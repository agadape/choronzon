"""Kiosk screen copy. Brand words come from config/brand.json; the privacy statement is the MUST list from
CLAUDE.md section 6, in the same words, shown before every send.
"""
from __future__ import annotations

import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]


def brand() -> dict:
    return json.loads((REPO / "config" / "brand.json").read_text(encoding="utf-8"))


PRIVACY = """Before you give it anything, read this.

  Private:        the link between you and your secret.
                  We, the operator, cannot learn who contributed.
  Public:         the content of your secret, spoken by a ghost voice,
                  to everyone who holds the key, forever. The key is irrevocable.
  Not guaranteed: that nobody recognises your words or your style.
                  Content and voice can identify you; names and places identify you.

  Your own wallet stores what you sent. This kiosk uses a wallet that is
  wiped when the session ends. If you send from your own phone, your phone remembers.
  Replies to a per-offering address can be sent by anyone holding the public key.
  lightwalletd sees the kiosk's IP address.
  Order inside a block is miner order, not send order.
"""


def banner() -> str:
    b = brand()
    return f"{b['name']}\n{b['tagline']}\n"


def cta() -> str:
    return brand()["kiosk_cta"]
