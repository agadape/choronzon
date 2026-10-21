"""Kiosk CLI: give the god a secret.

  python3 -m kiosk preview "text" [--wav out.wav]        speak it locally, show memo sizes; nothing is sent
  python3 -m kiosk offer "text" [--reply] [--yes]        send from the open session wallet
  python3 -m kiosk offer "text" --from wallets/test/A    send from a named wallet (operator / seeding; labelled)
  python3 -m kiosk session open [--notes 8] [--pool wallets/test/A]
  python3 -m kiosk session status | close
  python3 -m kiosk inbox                                 whispers that returned to this session's wallet

Prints txids (display order) and sizes only. Never prints addresses, never writes the text anywhere.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from renderer.decoder import Decoder
from renderer.tts import Voice

from . import copy
from .devtool import Devtool, DevtoolError
from .offering import Choir, make_offering, payment_uri
from .session import Session

REPO = Path(__file__).resolve().parents[1]
EXPLORER = "https://testnet.zcashexplorer.app/transactions/"


def voice() -> Voice:
    v = Voice(Decoder(), cache_dir=REPO / "out" / "cache")
    if not v.available():
        sys.exit("espeak-ng and sox are required (scripts/setup.sh)")
    return v


def describe(offering) -> str:
    return (f"ghost voice: {offering.seconds:.1f} s, {len(offering.frames)} bytes -> {len(offering.memos)} memo(s) "
            f"[{', '.join(str(len(m)) for m in offering.memos)} bytes], contrib_id {offering.contrib_id}, "
            f"reply address {'embedded' if offering.has_reply else 'none'}")


def cmd_preview(a) -> None:
    v = voice()
    o = make_offering(a.text, v, None)
    print(describe(o))
    if a.wav:
        import wave
        with wave.open(a.wav, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(Decoder.sample_rate)
            w.writeframes(Decoder().decode(o.codec, o.frames))
        print(f"wrote {a.wav} (what every listener will hear)")


def confirm(a) -> None:
    print(copy.banner())
    print(copy.PRIVACY)
    if a.yes:
        return
    answer = input(f"{copy.cta()}  [type SEND to continue] ").strip()
    if answer != "SEND":
        sys.exit("nothing sent")


def cmd_offer(a) -> None:
    choir = Choir.load()
    v = voice()
    confirm(a)
    if a.from_wallet:
        wallet_dir = Path(a.from_wallet)
        identity = wallet_dir.with_suffix(".age")
        if not identity.exists():
            sys.exit(f"no identity file {identity.name} next to {wallet_dir}")
        w = Devtool(wallet_dir, identity)
        print(f"sending from the named wallet {wallet_dir.name} (not an ephemeral session wallet: "
              f"its database keeps what it sent)")
        reply = w.generate_address() if a.reply else None
        o = make_offering(a.text, v, reply)
        print(describe(o))
        w.sync()
        txid = w.pay(payment_uri(choir, o.memos))
    else:
        s = Session.current()
        if not s or not s.status()["ready"]:
            sys.exit("no ready session: python3 -m kiosk session open")
        o, txid = s.offer(a.text, v, choir, a.reply)
        print(describe(o))
    print(f"sent. txid {txid}\n{EXPLORER}{txid}\n(the explorer shows only that a shielded transaction exists)")


def cmd_session(a) -> None:
    if a.action == "open":
        pool_dir = Path(a.pool)
        pool = Devtool(pool_dir, pool_dir.with_suffix(".age"))
        try:
            Session.open(pool, a.notes)
        except DevtoolError as e:
            sys.exit(str(e))
    elif a.action == "status":
        s = Session.current()
        print(json.dumps(s.status() if s else {"open": False}, indent=1))
    elif a.action == "close":
        s = Session.current()
        if not s:
            sys.exit("no session")
        s.close()
        print("session wallet wiped")


def cmd_inbox(a) -> None:
    s = Session.current()
    if not s:
        sys.exit("no session")
    replies = s.inbox()
    if not replies:
        print("no whisper has returned (yet)")
    for r in replies:
        who = f"for your offering {r['for_txid'][:12]}…" if r["for_txid"] else "for an offering not from this session"
        print(f"a whisper returned {who}: {r['text'] if r['text'] is not None else f'<audio codec {r['codec']}>'}")


def main(argv=None) -> None:
    p = argparse.ArgumentParser(prog="python3 -m kiosk", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="command", required=True)
    s = sub.add_parser("preview")
    s.add_argument("text")
    s.add_argument("--wav")
    s = sub.add_parser("offer")
    s.add_argument("text")
    s.add_argument("--reply", action="store_true", help="embed a fresh one-time reply address")
    s.add_argument("--from", dest="from_wallet", help="send from this wallet dir instead of the session wallet")
    s.add_argument("--yes", action="store_true", help="skip the SEND prompt (scripts, seeding)")
    s = sub.add_parser("session")
    s.add_argument("action", choices=["open", "status", "close"])
    s.add_argument("--notes", type=int, default=8)
    s.add_argument("--pool", default=str(REPO / "wallets" / "test" / "A"))
    sub.add_parser("inbox")
    a = p.parse_args(argv)
    try:
        {"preview": cmd_preview, "offer": cmd_offer, "session": cmd_session, "inbox": cmd_inbox}[a.command](a)
    except DevtoolError as e:
        sys.exit(str(e))


if __name__ == "__main__":
    main()
