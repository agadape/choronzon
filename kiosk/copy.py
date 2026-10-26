"""Kiosk screen copy. Brand words come from config/brand.json; the privacy statement is the MUST list from
CLAUDE.md section 6, in the same words, shown before every send. The route line depends on how this kiosk reaches
lightwalletd right now (renderer/network.py), so the statement is built at runtime: `privacy(connection)`.
"""
from __future__ import annotations

import json
from pathlib import Path

from .config_dir import config_file

REPO = Path(__file__).resolve().parents[1]


def brand() -> dict:
    """config/brand.json, or the brand.json of the god named by GOD_CONFIG_DIR."""
    return json.loads(config_file("brand.json").read_text(encoding="utf-8"))


_STATEMENT = """Before you give it anything, read this.

  Private:        the link between you and your secret.
                  We, the operator, cannot learn who contributed.
  Public:         the content of your secret, spoken by a ghost voice,
                  to everyone who holds the key, forever. The key is irrevocable.
                  The god's own lines, and everything its wallet spends,
                  are public to every key holder (full viewing key).
  Not guaranteed: that nobody recognises your words or your style.
                  Content and voice can identify you; names and places identify you.
                  Timing can link you: at the kiosk the room sees who is typing,
                  and one offering lands a minute or two later.

  Your own wallet stores what you sent. This kiosk sends from a session wallet
  that is overwritten and deleted when the session closes (on SSDs and VM disks
  the overwrite is best-effort). If you send from your own phone, your phone remembers,
  and {phone}

  Whisper back: if you ask for it here, the reply lands in this kiosk's session
  wallet, which the operator holds until the session closes: the operator can read it.
  For a reply only you can read, give the address of your own wallet instead
  (shielded-only, zutest1…).
  Replies to a per-offering address can be sent by anyone holding the public key.
{route}
  Order inside a block is miner order, not send order.
"""

_ROUTE = {
    "tor": ("  lightwalletd sees a Tor exit, not this kiosk's IP (Tor is the default;\n"
            "  an operator can choose direct on purpose, and then it sees the IP).\n"
            "  Tor does not hide timing: everyone sees when a transaction lands on chain."),
    "direct": ("  THIS KIOSK IS CONNECTED DIRECTLY: lightwalletd sees this kiosk's IP address.\n"
               "  The operator chose direct on purpose (Tor is the default).\n"
               "  Timing is public either way: everyone sees when a transaction lands on chain."),
}


# the phone / QR path (section 6 MUST): printed by `kiosk qr` and part of the statement
PHONE = ("your wallet's server sees your IP when you send and, because the god's key is public,\n"
         "  can read that offering.")


def privacy(connection: str) -> str:
    """The statement for the route this kiosk uses now ('tor' or 'direct'); an unknown route is refused."""
    return _STATEMENT.format(route=_ROUTE[connection], phone=PHONE)


def phone_note() -> str:
    """One paragraph for the phone path: the contributor's own wallet sends, through its own server."""
    return ("Sending from your own wallet: your wallet stores what you sent, and " + PHONE.replace("\n  ", " ")
            + " Timing can link you: one offering lands a minute or two after you send.")


def banner() -> str:
    b = brand()
    return f"{b['name']}\n{b['tagline']}\n"


def cta() -> str:
    return brand()["kiosk_cta"]
