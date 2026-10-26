"""Offline composer: ordered offerings -> one stereo 8 kHz int16 buffer, integer arithmetic only.

Everything here is a pure function of the score (plus the pinned decoder and voice). No floats, no RNG:
  * voice n starts when voice n-1 is 5/8 of the way through (a choir, not a queue);
  * pan (17 steps) and pitch layer (1, 15/16, 17/16; nearest-sample integer resampling) come from contrib_id;
  * voices are summed in int32 and clipped to int16.
Per-offering integer features (duration, energy, zero crossings) are exported for the creature.
"""
from __future__ import annotations

import array
import io
import sys
import wave
from dataclasses import dataclass

import protocol

from .decoder import DecodeError, Decoder
from .score import Offering
from .tts import TTSError, Voice

COMPOSER_VERSION = "choir/2"
SAMPLE_RATE = Decoder.sample_rate
CHANNELS = 2
PAN_STEPS = 16                      # pan index 0..16: 0 = hard left, 16 = hard right
PITCH_LAYERS = ((1, 1), (15, 16), (17, 16), (3, 4))   # (num, den): output index i reads input index i*num//den
CONDUCTOR_PITCH = 3                 # the god's own voice: deeper (3/4), always centered, never a random layer
OFFERING_PITCH_LAYERS = 3           # offerings only use layers 0..2
OVERLAP_NUM, OVERLAP_DEN = 5, 8     # next voice starts at 5/8 of the previous one
MIN_GAP = SAMPLE_RATE // 2          # but never sooner than 0.5 s after the previous start
MAX_VOICE = 20 * SAMPLE_RATE        # 20 s per offering, hard cap
_CHUNK = 1 << 16                    # frames clipped per step (bounds the temporary Python list)


@dataclass(frozen=True)
class Placed:
    txid: str
    contrib_id: int
    start: int          # sample index in the mix
    samples: int        # mono length after pitch shift
    pan: int            # 0..16
    pitch_layer: int    # index into PITCH_LAYERS
    energy: int         # mean |sample|, 0..32767
    zero_crossings: int # per second, a rough pitch/brightness measure
    silent: bool        # decode/TTS failed: placed as silence so the timeline stays stable
    conductor: bool = False

    def to_json(self) -> dict:
        d = {"tx": self.txid, "contrib_id": self.contrib_id, "start": self.start, "samples": self.samples,
             "pan": self.pan, "pitch_layer": self.pitch_layer, "energy": self.energy,
             "zero_crossings": self.zero_crossings, "silent": self.silent}
        if self.conductor:
            d["conductor"] = True
        return d


@dataclass(frozen=True)
class Mix:
    pcm: bytes                      # interleaved int16 LE stereo
    placed: tuple[Placed, ...]
    failures: tuple[str, ...]       # txids rendered as silence

    @property
    def samples(self) -> int:
        return len(self.pcm) // (2 * CHANNELS)

    def wav(self) -> bytes:
        buf = io.BytesIO()
        with wave.open(buf, "wb") as w:
            w.setnchannels(CHANNELS)
            w.setsampwidth(2)
            w.setframerate(SAMPLE_RATE)
            w.writeframes(self.pcm)
        return buf.getvalue()


def _int16(pcm: bytes) -> array.array:
    a = array.array("h")
    a.frombytes(pcm[:len(pcm) - len(pcm) % 2])
    if sys.byteorder != "little":
        a.byteswap()
    return a


def _pitch(src: array.array, layer: int) -> array.array:
    num, den = PITCH_LAYERS[layer]
    if num == den:
        return src
    n = len(src) * den // num
    out = array.array("h", bytes(2 * n))
    for i in range(n):
        out[i] = src[i * num // den]
    return out


def features(mono: array.array) -> tuple[int, int]:
    if not mono:
        return 0, 0
    energy = sum(abs(s) for s in mono) // len(mono)
    zc = sum(1 for i in range(1, len(mono)) if (mono[i - 1] < 0) != (mono[i] < 0))
    return energy, zc * SAMPLE_RATE // len(mono)


def voice_for(offering: Offering, decoder: Decoder, voice: Voice | None) -> array.array:
    """Mono int16 samples for one offering, through the pinned decoder (and the pinned voice for text)."""
    if offering.codec in protocol.AUDIO_CODECS:
        pcm = decoder.decode(offering.codec, offering.data)
    else:
        if voice is None:
            raise TTSError("no voice configured for text offerings")
        pcm = voice.speak(offering.data.decode("utf-8", "replace"))
    return _int16(pcm[:2 * MAX_VOICE])


def compose(offerings: list[Offering] | tuple[Offering, ...], decoder: Decoder, voice: Voice | None) -> Mix:
    """Each voice is mixed in as soon as it is placed (placement needs only the previous voice), into two int32
    arrays: ~8 bytes per output frame instead of two Python int lists (~80 bytes per frame; GBs at 10k offerings).
    int32 cannot overflow: a voice is at most 20 s * 4/3 (pitch layer 3/4) and starts >= MIN_GAP after the previous
    one, so at most 54 voices overlap; 54 * 32768 * PAN_STEPS < 2**31 (and array raises rather than wrapping)."""
    placed, failures = [], []
    left, right = array.array("i"), array.array("i")
    start = 0
    for n, o in enumerate(offerings):
        if o.conductor:
            pan, layer = PAN_STEPS // 2, CONDUCTOR_PITCH
        else:
            pan, layer = o.contrib_id % (PAN_STEPS + 1), (o.contrib_id >> 8) % OFFERING_PITCH_LAYERS
        try:
            mono = _pitch(voice_for(o, decoder, voice), layer)
            silent = False
        except (DecodeError, TTSError):
            mono, silent = array.array("h", bytes(2 * SAMPLE_RATE)), True   # 1 s of silence keeps its slot
            failures.append(o.txid)
        if n:
            prev = placed[-1]
            start = prev.start + max(prev.samples * OVERLAP_NUM // OVERLAP_DEN, MIN_GAP)
        energy, zc = features(mono)
        placed.append(Placed(o.txid, o.contrib_id, start, len(mono), pan, layer, energy, zc, silent, o.conductor))
        end = start + len(mono)
        if end > len(left):                     # total = max(start + samples), as before
            grow = bytes(4 * (end - len(left)))
            left.frombytes(grow)
            right.frombytes(grow)
        gl, gr = PAN_STEPS - pan, pan
        left[start:end] = array.array("i", [a + s * gl for a, s in zip(left[start:end], mono)])
        right[start:end] = array.array("i", [a + s * gr for a, s in zip(right[start:end], mono)])
    total = len(left)
    out = array.array("h", bytes(4 * total))
    lo, hi = -32768 * PAN_STEPS, 32768 * PAN_STEPS      # v // PAN_STEPS clamped to int16, chunk by chunk
    for a in range(0, total, _CHUNK):
        b = min(total, a + _CHUNK)
        out[2 * a:2 * b:2] = array.array("h", [-32768 if v < lo else 32767 if v >= hi else v // PAN_STEPS
                                               for v in left[a:b]])
        out[2 * a + 1:2 * b:2] = array.array("h", [-32768 if v < lo else 32767 if v >= hi else v // PAN_STEPS
                                                   for v in right[a:b]])
    if sys.byteorder != "little":
        out.byteswap()
    return Mix(out.tobytes(), tuple(placed), tuple(failures))
