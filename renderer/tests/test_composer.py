"""Composer: integer-only mixing, deterministic placement, pan/pitch from contrib_id, silence on failure."""
import array
import wave
import io

import protocol
from renderer import composer
from renderer.decoder import DecodeError
from renderer.score import Offering
from renderer.tts import TTSError

SR = composer.SAMPLE_RATE


def pcm(samples):
    return array.array("h", samples).tobytes()


def offering(n, codec=protocol.CODEC_C2_700C, data=b"frames", cid=None):
    return Offering(f"{n:064x}", 10, n, 0, cid if cid is not None else n, codec, data, 1, False, False, ())


class StubDecoder:
    sample_rate = SR

    def __init__(self, table):
        self.table = table   # frames -> list of int16 samples, or an exception

    def decode(self, codec, frames):
        out = self.table[frames]
        if isinstance(out, Exception):
            raise out
        return pcm(out)


class StubVoice:
    def speak(self, text):
        if text == "fail":
            raise TTSError("x")
        return pcm([1000] * SR)  # 1 s


def samples(mix):
    a = array.array("h")
    a.frombytes(mix.pcm)
    return a


def test_single_centered_voice_is_split_equally():
    dec = StubDecoder({b"f": [1600, -1600, 0]})
    mix = composer.compose([offering(1, data=b"f", cid=composer.PAN_STEPS // 2)], dec, None)
    assert list(samples(mix)) == [800, 800, -800, -800, 0, 0]
    assert mix.placed[0].pan == 8 and mix.placed[0].pitch_layer == 0 and not mix.failures


def test_hard_pan_and_clipping():
    dec = StubDecoder({b"f": [32767, -32768]})
    left = composer.compose([offering(1, data=b"f", cid=0)], dec, None)       # pan 0 = hard left
    assert list(samples(left)) == [32767, 0, -32768, 0]
    loud = StubDecoder({b"a": [30000] * 4, b"b": [30000] * 4})
    two = composer.compose([offering(1, data=b"a", cid=8), offering(2, data=b"b", cid=8)], loud, None)
    assert two.placed[1].start == composer.MIN_GAP          # 4 samples * 5/8 < MIN_GAP
    assert max(samples(two)) == 15000                        # centered voices halve; no overlap here


def test_overlap_rule_and_total_length():
    dec = StubDecoder({b"a": [100] * 16000, b"b": [100] * 8000})
    mix = composer.compose([offering(1, data=b"a", cid=8), offering(2, data=b"b", cid=8)], dec, None)
    a, b = mix.placed
    assert (a.start, a.samples) == (0, 16000)
    assert b.start == 16000 * 5 // 8 == 10000
    assert mix.samples == 10000 + 8000
    assert samples(mix)[2 * 12000] == 100  # both voices (50 + 50) at a sample where they overlap


def test_pitch_layers_from_contrib_id():
    src = list(range(0, 3200, 2))  # 1600 samples
    dec = StubDecoder({b"f": src})
    for layer in range(composer.OFFERING_PITCH_LAYERS):
        num, den = composer.PITCH_LAYERS[layer]
        cid = 8 | (layer << 8)
        mix = composer.compose([offering(1, data=b"f", cid=cid)], dec, None)
        p = mix.placed[0]
        assert p.pitch_layer == layer and p.samples == 1600 * den // num
        gain_left = composer.PAN_STEPS - p.pan
        assert samples(mix)[2 * 10] == src[10 * num // den] * gain_left // composer.PAN_STEPS


def test_conductor_voice_is_centered_and_deep():
    src = list(range(0, 3200, 2))
    dec = StubDecoder({b"f": src})
    o = Offering(f"{1:064x}", 10, 1, 0, 0xDEADBEEF, protocol.CODEC_C2_700C, b"f", 1, False, False, (), True)
    mix = composer.compose([o], dec, None)
    p = mix.placed[0]
    assert (p.pan, p.pitch_layer, p.conductor) == (composer.PAN_STEPS // 2, composer.CONDUCTOR_PITCH, True)
    assert p.samples == 1600 * 4 // 3 and p.to_json()["conductor"] is True
    assert "conductor" not in composer.compose([offering(2, data=b"f", cid=8)], dec, None).placed[0].to_json()


def test_text_offering_uses_the_voice_and_failures_become_silence():
    dec = StubDecoder({b"bad": DecodeError("x")})
    offs = [offering(1, protocol.CODEC_TEXT, b"hello", cid=8), offering(2, data=b"bad", cid=8),
            offering(3, protocol.CODEC_TEXT, b"fail", cid=8)]
    mix = composer.compose(offs, dec, StubVoice())
    assert [p.silent for p in mix.placed] == [False, True, True]
    assert mix.failures == (offs[1].txid, offs[2].txid)
    assert mix.placed[0].energy == 1000 and mix.placed[1].samples == SR and mix.placed[1].energy == 0


def test_features_are_integers():
    dec = StubDecoder({b"f": [1000, -1000] * 4000})  # 1 s square wave at 4 kHz
    p = composer.compose([offering(1, data=b"f", cid=8)], dec, None).placed[0]
    assert (p.energy, p.zero_crossings) == (1000, 7999)


def test_wav_header_and_determinism():
    dec = StubDecoder({b"f": [1, 2, 3]})
    a, b = (composer.compose([offering(1, data=b"f", cid=3)], dec, None) for _ in range(2))
    assert a.pcm == b.pcm and a.wav() == b.wav()
    with wave.open(io.BytesIO(a.wav())) as w:
        assert (w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()) == (2, 2, SR, 3)


def test_voice_cap():
    dec = StubDecoder({b"f": [7] * (composer.MAX_VOICE + 100)})
    assert composer.compose([offering(1, data=b"f", cid=8)], dec, None).placed[0].samples == composer.MAX_VOICE
