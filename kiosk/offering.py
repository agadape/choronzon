"""Text -> ghost voice (Codec2 700C) -> v1 memos -> ZIP-321 payment request to the choir address.

The kiosk never sends the text itself: the secret is spoken by the local voice first, so what reaches the
chain is the same ghost that every listener hears. Each output carries the fixed amount from config/choir.json.
"""
from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from pathlib import Path

import protocol
from renderer.tts import Voice

REPO = Path(__file__).resolve().parents[1]
CHOIR_CONFIG = REPO / "config" / "choir.json"


@dataclass(frozen=True)
class Choir:
    network: str
    address: str
    amount_zat: int

    @classmethod
    def load(cls, path: Path = CHOIR_CONFIG) -> "Choir":
        doc = json.loads(path.read_text(encoding="utf-8"))
        if not protocol.is_unified_address(doc["address"]):
            raise ValueError(f"{path}: choir address does not parse")
        return cls(doc["network"], doc["address"], int(doc["amount_zat"]))


@dataclass(frozen=True)
class Offering:
    contrib_id: int
    codec: int
    frames: bytes                # what goes on chain (Codec2 frames or UTF-8 text)
    memos: tuple[bytes, ...]     # 1..3 binary memos, zero-trimmed
    has_reply: bool

    @property
    def seconds(self) -> float:
        # c2enc stores a 700C frame (40 ms, 28 bits) in 4 bytes -> 100 bytes per second (verified against soxi)
        return len(self.frames) / 100 if self.codec == protocol.CODEC_C2_700C else 0.0


def zat_to_zec(zat: int) -> str:
    return f"{zat // 100_000_000}.{zat % 100_000_000:08d}".rstrip("0").rstrip(".") or "0"


def b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def payment_uri(choir: Choir, memos: tuple[bytes, ...] | list[bytes]) -> str:
    """ZIP-321: first payment un-indexed, the rest as .1, .2 (all to the choir, all the fixed amount)."""
    amount = zat_to_zec(choir.amount_zat)
    parts = []
    for i, memo in enumerate(memos):
        sfx = "" if i == 0 else f".{i}"
        parts.append(f"address{sfx}={choir.address}&amount{sfx}={amount}&memo{sfx}={b64url(memo)}")
    return "zcash:?" + "&".join(parts)


def make_offering(text: str, voice: Voice, reply_addr: str | None = None, contrib_id: int | None = None,
                  as_text: bool = False, conductor: bool = False, phone: bool = False) -> Offering:
    """`phone`: wrap each memo in the ASCII envelope (GC1: + base64url) so a mobile wallet sends it intact."""
    if as_text:   # text offering, voiced by the renderer (the phone path's default: short, one memo)
        codec, frames = protocol.CODEC_TEXT, text.encode("utf-8")
    else:
        codec, frames = protocol.CODEC_C2_700C, voice.frames(text)
    kind = protocol.KIND_CONDUCTOR if conductor else protocol.KIND_CONTRIBUTION
    if phone:
        cid, memos = protocol.encode_contribution_ascii(frames, codec, reply_addr, contrib_id)
    else:
        cid, memos = protocol.encode_contribution(frames, codec, reply_addr, contrib_id, kind=kind)
    return Offering(cid, codec, frames, tuple(m.rstrip(b"\0") for m in memos), reply_addr is not None)
