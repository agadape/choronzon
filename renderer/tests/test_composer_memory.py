"""Audit 26 Oct: the composer mixed into two Python int lists (~80 bytes per output frame; GBs at ~10k offerings).
It now mixes into int32 arrays as it places each voice. The output must stay byte-identical (it feeds render_hash):
checked here against the previous implementation, kept verbatim below, on a synthetic score with heavy overlap,
clipping, every pan and pitch layer, conductor lines and failures. The chain anchors are in test_chain_regression.py.
"""
import array
import sys
import tracemalloc

import protocol
from renderer import composer
from renderer.composer import (CONDUCTOR_PITCH, MIN_GAP, OFFERING_PITCH_LAYERS, OVERLAP_DEN, OVERLAP_NUM,
                               PAN_STEPS, SAMPLE_RATE, Mix, Placed, _pitch, features, voice_for)
from renderer.decoder import DecodeError
from renderer.score import Offering


def reference_compose(offerings, decoder, voice):
    """composer.compose as of d099811 (Python int lists), unchanged."""
    placed, failures, voices = [], [], []
    start = 0
    for n, o in enumerate(offerings):
        if o.conductor:
            pan, layer = PAN_STEPS // 2, CONDUCTOR_PITCH
        else:
            pan, layer = o.contrib_id % (PAN_STEPS + 1), (o.contrib_id >> 8) % OFFERING_PITCH_LAYERS
        try:
            mono = _pitch(voice_for(o, decoder, voice), layer)
            silent = False
        except (DecodeError, composer.TTSError):
            mono, silent = array.array("h", bytes(2 * SAMPLE_RATE)), True
            failures.append(o.txid)
        if n:
            prev = placed[-1]
            start = prev.start + max(prev.samples * OVERLAP_NUM // OVERLAP_DEN, MIN_GAP)
        energy, zc = features(mono)
        placed.append(Placed(o.txid, o.contrib_id, start, len(mono), pan, layer, energy, zc, silent, o.conductor))
        voices.append(mono)
    total = max((p.start + p.samples for p in placed), default=0)
    left, right = [0] * total, [0] * total
    for p, mono in zip(placed, voices):
        gl, gr = PAN_STEPS - p.pan, p.pan
        for i, s in enumerate(mono):
            left[p.start + i] += s * gl
            right[p.start + i] += s * gr
    out = array.array("h", bytes(4 * total))
    for i in range(total):
        out[2 * i] = max(-32768, min(32767, left[i] // PAN_STEPS))
        out[2 * i + 1] = max(-32768, min(32767, right[i] // PAN_STEPS))
    if sys.byteorder != "little":
        out.byteswap()
    return Mix(out.tobytes(), tuple(placed), tuple(failures))


class SynthDecoder:
    """Deterministic integer 'speech' from the frames: loud saw/square mixes, lengths from 0 to past the cap."""
    sample_rate = SAMPLE_RATE

    def decode(self, codec, frames):
        seed = int.from_bytes(frames[:4], "big")
        if seed % 29 == 0:
            raise DecodeError("synthetic failure")
        n = (seed * 7919) % (3 * SAMPLE_RATE) if seed % 41 else composer.MAX_VOICE + 4000
        amp = 2000 + seed % 30000
        period = 80 * (seed % 7 + 1)          # one period built per sample, then repeated (cheap under tracemalloc)
        a = array.array("h", [((i * (seed % 97 + 3)) % 512 - 256) * amp // 256 if (i // 40) % 2 else
                              (amp if i % (seed % 13 + 2) else -amp) for i in range(period)])
        return (a * (n // period + 1))[:n].tobytes()


def synthetic(n):
    out = []
    for k in range(n):
        frames = (k * 2654435761 % 2**32).to_bytes(4, "big") + b"x"
        out.append(Offering(f"{k:064x}", 10 + k // 50, k % 50, 0, (k * 40503) % 2**32, protocol.CODEC_C2_700C,
                            frames, 1, False, False, (), conductor=(k % 17 == 5)))
    return out


def test_byte_identical_to_the_previous_composer_on_a_synthetic_score():
    offs = synthetic(160)
    dec = SynthDecoder()
    new, old = composer.compose(offs, dec, None), reference_compose(offs, dec, None)
    assert new.placed == old.placed and new.failures == old.failures
    assert new.pcm == old.pcm
    a = array.array("h")
    a.frombytes(new.pcm)
    assert max(a) == 32767 and min(a) == -32768          # clipping on both rails was exercised
    assert {p.pitch_layer for p in new.placed} == {0, 1, 2, 3} and any(p.silent for p in new.placed)


def test_empty_and_zero_length_voices_match_too():
    class Z:
        sample_rate = SAMPLE_RATE

        def decode(self, codec, frames):
            return b"" if frames == b"empty" else array.array("h", [5] * 3).tobytes()
    offs = [Offering(f"{k:064x}", 10, k, 0, k, protocol.CODEC_C2_700C, b"empty" if k % 2 else b"x", 1, False, False,
                     ()) for k in range(5)]
    assert composer.compose([], Z(), None).pcm == reference_compose([], Z(), None).pcm == b""
    assert composer.compose(offs, Z(), None) == reference_compose(offs, Z(), None)


def test_memory_per_output_frame_is_bounded():
    """Two int32 accumulators + the int16 output + its bytes copy = 16 B per stereo frame, plus bounded temporaries
    (one voice slice <= 26.7 s, one clipping chunk). Measured on this score: 9.1 MB here, 36.6 MB for the list
    version (89 B per frame); at 1000 offerings (10.1 M frames) 178 MB against 870 MB, same PCM."""
    offs = synthetic(40)
    dec = SynthDecoder()
    tracemalloc.start()
    try:
        mix = composer.compose(offs, dec, None)
        _, peak = tracemalloc.get_traced_memory()
    finally:
        tracemalloc.stop()
    assert peak < 18 * mix.samples + 12 * 2**20, (peak, mix.samples)
