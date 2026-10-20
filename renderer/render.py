"""One render: wallet DB at an explicit height -> score, score_hash, PCM, render_hash (+ the G6 regression hash)."""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path

import protocol

from . import legacy
from .decoder import CODEC2_TAG, EXPECTED_FINGERPRINT, DecodeError, Decoder
from .hashes import RENDER_HASH_VERSION, SCORE_HASH_VERSION, render_hash, score_hash
from .score import Score, build_score
from .wallet import WalletDB

# Day-2 placeholder composer: decoded Codec2 PCM concatenated in score order. Text offerings add no audio yet;
# the Day-3 composer (local TTS + integer mix) replaces this and bumps the version, which changes render_hash.
COMPOSER_VERSION = "concat/0"


@dataclass(frozen=True)
class RenderResult:
    score: Score
    score_hash: str
    render_hash: str
    g6_hash: str
    pcm: bytes
    decoder_fingerprint: str
    decode_failures: tuple[str, ...]  # txids whose audio did not decode (rendered as silence)

    @property
    def fingerprint_matches_pin(self) -> bool:
        return self.decoder_fingerprint == EXPECTED_FINGERPRINT

    def summary(self) -> dict:
        return {"as_of_height": self.score.as_of_height, "offerings": len(self.score.offerings),
                "skipped": len(self.score.skipped), "score_hash": self.score_hash, "render_hash": self.render_hash,
                "g6_hash": self.g6_hash, "decoder_fingerprint_matches_pin": self.fingerprint_matches_pin}

    def to_json(self) -> dict:
        """Everything here is deterministic: two machines with the same key and decoder write identical files."""
        return {
            "score": self.score.to_json(),
            "score_hash": self.score_hash, "score_hash_version": SCORE_HASH_VERSION,
            "render_hash": self.render_hash, "render_hash_version": RENDER_HASH_VERSION,
            "render": {"composer": COMPOSER_VERSION, "sample_rate": Decoder.sample_rate, "pcm_bytes": len(self.pcm),
                       "decode_failures": list(self.decode_failures),
                       "decoder": {"codec2_tag": CODEC2_TAG, "fingerprint": self.decoder_fingerprint,
                                   "fingerprint_matches_pin": self.fingerprint_matches_pin}},
            "regression": {"g6_hash": self.g6_hash},
        }


def render(db: WalletDB, as_of: int, decoder: Decoder, skiplist: frozenset[str] = frozenset()) -> RenderResult:
    candidates = db.candidates(as_of)
    score = build_score(candidates, as_of, skiplist)
    s_hash = score_hash(score)
    pcm, failures = bytearray(), []
    for offering in score.offerings:
        if offering.codec in protocol.AUDIO_CODECS:
            try:
                pcm += decoder.decode(offering.codec, offering.data)
            except DecodeError:
                failures.append(offering.txid)
    return RenderResult(score, s_hash, render_hash(s_hash, bytes(pcm), COMPOSER_VERSION),
                        legacy.g6_hash(candidates, as_of, decoder), bytes(pcm), decoder.fingerprint(), tuple(failures))


def _atomic_write(path: Path, text: str) -> None:
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(text)
    os.replace(tmp, path)


def write_outputs(result: RenderResult, out_dir: str | Path) -> None:
    """out/score.json (score + hashes, no memo content, no addresses) and out/render_hash (one line)."""
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    _atomic_write(out / "score.json", json.dumps(result.to_json(), indent=1, sort_keys=True) + "\n")
    _atomic_write(out / "render_hash", result.render_hash + "\n")
