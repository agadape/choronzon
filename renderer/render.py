"""One render: wallet DB at an explicit height -> score, score_hash, mixed PCM, render_hash (+ the G6 regression hash)."""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path

from . import legacy, tts
from .composer import COMPOSER_VERSION, SAMPLE_RATE, Mix, compose
from .decoder import CODEC2_TAG, EXPECTED_FINGERPRINT, Decoder
from .hashes import RENDER_HASH_VERSION, SCORE_HASH_VERSION, render_hash, score_hash
from .score import Score, build_score
from .tts import Voice
from .wallet import WalletDB


@dataclass(frozen=True)
class RenderResult:
    score: Score
    score_hash: str
    render_hash: str
    g6_hash: str
    mix: Mix
    decoder_fingerprint: str
    voice_fingerprint: str | None   # None when no voice was configured

    @property
    def pcm(self) -> bytes:
        return self.mix.pcm

    @property
    def decoder_matches_pin(self) -> bool:
        return self.decoder_fingerprint == EXPECTED_FINGERPRINT

    @property
    def voice_matches_pin(self) -> bool:
        return self.voice_fingerprint == tts.EXPECTED_FINGERPRINT

    def summary(self) -> dict:
        return {"as_of_height": self.score.as_of_height, "offerings": len(self.score.offerings),
                "skipped": len(self.score.skipped), "score_hash": self.score_hash, "render_hash": self.render_hash,
                "g6_hash": self.g6_hash, "mix_seconds": self.mix.samples // SAMPLE_RATE,
                "decoder_matches_pin": self.decoder_matches_pin, "voice_matches_pin": self.voice_matches_pin}

    def to_json(self) -> dict:
        """Everything here is deterministic: two machines with the same key, decoder and voice write identical files."""
        return {
            "score": self.score.to_json(),
            "score_hash": self.score_hash, "score_hash_version": SCORE_HASH_VERSION,
            "render_hash": self.render_hash, "render_hash_version": RENDER_HASH_VERSION,
            "render": {"composer": COMPOSER_VERSION, "sample_rate": SAMPLE_RATE, "channels": 2,
                       "samples": self.mix.samples, "timeline": [p.to_json() for p in self.mix.placed],
                       "silent": list(self.mix.failures),
                       "decoder": {"codec2_tag": CODEC2_TAG, "fingerprint": self.decoder_fingerprint,
                                   "matches_pin": self.decoder_matches_pin},
                       "voice": {"espeak_ng": tts.ESPEAK_VERSION, "sox": tts.SOX_VERSION,
                                 "fingerprint": self.voice_fingerprint, "matches_pin": self.voice_matches_pin}},
            "regression": {"g6_hash": self.g6_hash},
        }


def render(db: WalletDB, as_of: int, decoder: Decoder, skiplist: frozenset[str] = frozenset(),
           voice: Voice | None = None) -> RenderResult:
    candidates = db.candidates(as_of)
    score = build_score(candidates, as_of, skiplist)
    s_hash = score_hash(score)
    mix = compose(score.offerings, decoder, voice)
    return RenderResult(score, s_hash, render_hash(s_hash, mix.pcm, COMPOSER_VERSION),
                        legacy.g6_hash(candidates, as_of, decoder), mix, decoder.fingerprint(),
                        voice.fingerprint() if voice else None)


def _atomic_write(path: Path, data: bytes) -> None:
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_bytes(data)
    os.replace(tmp, path)


def write_outputs(result: RenderResult, out_dir: str | Path) -> None:
    """out/score.json (score, timeline, hashes; no memo content, no addresses), out/render_hash, out/mix.wav."""
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    _atomic_write(out / "score.json", (json.dumps(result.to_json(), indent=1, sort_keys=True) + "\n").encode())
    _atomic_write(out / "render_hash", (result.render_hash + "\n").encode())
    _atomic_write(out / "mix.wav", result.mix.wav())
