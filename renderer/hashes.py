"""Two versioned hashes (decided 21 Oct; see CLAUDE.md section 1 and concept doc section 6a).

score_hash v1  = SHA-256( canonical score JSON || raw on-chain memo bytes || as_of_height )
                 Chain data only, no audio decoder: "the blockchain is the score".
render_hash v1 = SHA-256( score_hash (32 bytes) || PCM from the pinned decoder || composer version )
                 What two laptops compare in the demo.

Raw memo bytes = every memo of every offering, zero-padded to 512 (the on-chain plaintext), in score order.
as_of_height is ASCII decimal, as in the G6 spike. Canonical JSON = sorted keys, no whitespace, ASCII only.
"""
from __future__ import annotations

import hashlib
import json

from .score import Score

SCORE_HASH_VERSION = "score/1"
RENDER_HASH_VERSION = "render/1"


def canonical_json(obj) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()


def score_hash(score: Score) -> str:
    h = hashlib.sha256(canonical_json(score.to_json()))
    for offering in score.offerings:
        for memo in offering.raw_memos:
            h.update(memo)
    h.update(str(score.as_of_height).encode())
    return h.hexdigest()


def render_hash(score_hash_hex: str, pcm: bytes, composer_version: str) -> str:
    return hashlib.sha256(bytes.fromhex(score_hash_hex) + pcm + composer_version.encode()).hexdigest()
