"""Kiosk CLI: give the god a secret.

  python3 -m kiosk preview [--wav out.wav]               speak it locally, show memo sizes; nothing is sent
  python3 -m kiosk offer [--reply | --reply-to <ua>] [--yes]   send from the open session wallet
  python3 -m kiosk offer --from wallets/test/A           send from a named wallet (operator / seeding; labelled)
  python3 -m kiosk qr [--reply <ua>] [--png qr.png]      phone offering: ZIP-321 QR (ASCII envelope) for Zingo etc.
  python3 -m kiosk speak --from wallets/test/B           the god's own voice (choir wallet self-send, kind=3)
  python3 -m kiosk speak --from wallets/test/A --forge   demo forgery: renderers show NOT THE GOD
  python3 -m kiosk reveal --from wallets/test/B [--to key.txt]   the Eye opens: publish the full viewing key (M5)
  python3 -m kiosk session open [--notes 8] [--pool wallets/test/A]
  python3 -m kiosk session status | close
  python3 -m kiosk inbox [contrib_id]                    the whisper that returned to one offering of this session

The text is typed at a prompt or piped on stdin (`printf '...' | python3 -m kiosk offer -`), never given as an
argument: an argument lands in the shell history and in `ps`. Prints txids (display order) and sizes only. Never
prints addresses, never writes the text anywhere.
--reply embeds a one-time address of the kiosk's session wallet: the operator holds that wallet until the session
closes and can read the reply. --reply-to embeds the visitor's own wallet address: the reply goes there directly.
Every command that talks to lightwalletd goes over Tor (the devtool's built-in client) unless `--connection direct`
or LWD_CONNECTION=direct is given on purpose; if Tor fails, the command fails (renderer/network.py).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

import protocol
from renderer import network
from renderer.decoder import Decoder
from renderer.tts import Voice

from . import copy
from .devtool import Devtool, DevtoolError
from .offering import Choir, make_offering, payment_uri
from .session import Session, check_reply_to

REPO = Path(__file__).resolve().parents[1]
# ZecBlock (formerly CipherScan) follows our NU7 testnet chain: its block 4,525,215 is 000026af4552… (checked
# 22 Oct 2026). Not every public testnet explorer does (docs/evidence-index.md).
EXPLORER = "https://testnet.zecblock.com/tx/"


def voice() -> Voice:
    # no TTS cache on the kiosk: a cache would keep the ghost voice of every secret sent from this machine
    v = Voice(Decoder(), cache_dir=None)
    if not v.available():
        sys.exit("espeak-ng and sox are required (scripts/setup.sh)")
    return v


REFUSE_ARGV = ("refusing the text as a command-line argument: it would land in the shell history and in `ps` "
               "for every local process. Type it at the prompt (no argument), or pipe it: "
               "printf '%s' '...' | python3 -m kiosk {cmd} -")


def read_text(a) -> str:
    """The secret: from stdin, or from an interactive prompt. Never from the command line (refused)."""
    if a.text and a.text != "-":
        sys.exit(REFUSE_ARGV.format(cmd=a.command))
    if sys.stdin.isatty():
        text = input("your secret (one line, Enter to finish): ")
    else:
        text = sys.stdin.read()
    text = text.strip()
    if not text:
        sys.exit("nothing to send")
    return text


def describe(offering) -> str:
    what = (f"ghost voice: {offering.seconds:.1f} s, {len(offering.frames)} bytes"
            if offering.codec != protocol.CODEC_TEXT else f"text: {len(offering.frames)} bytes (voiced by every renderer)")
    return (f"{what} -> {len(offering.memos)} memo(s) "
            f"[{', '.join(str(len(m)) for m in offering.memos)} bytes], contrib_id {offering.contrib_id}, "
            f"reply address {'embedded' if offering.has_reply else 'none'}")


def cmd_preview(a) -> None:
    v = voice()
    o = make_offering(read_text(a), v, None)
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
    print(copy.privacy(os.environ[network.ENV]))     # the route line says Tor or DIRECT, as this process connects
    if a.yes:
        return
    prompt = f"{copy.cta()}  [type SEND to continue] "
    if sys.stdin.isatty():
        answer = input(prompt).strip()
    else:   # the secret came in on a pipe: ask on the terminal itself, or require --yes when there is none
        try:
            with open("/dev/tty", "r+") as tty:
                tty.write(prompt)
                tty.flush()
                answer = tty.readline().strip()
        except OSError:
            sys.exit("the secret came in on a pipe and there is no terminal to confirm on: pass --yes to send")
    if answer != "SEND":
        sys.exit("nothing sent")


_ESC = re.compile(r"\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?|\x1b\[[0-?]*[ -/]*[@-~]|\x1b.?")


def printable(text: str) -> str:
    """A reply as it may reach the operator's terminal: no escape sequences, no control characters but newline.

    Anyone holding the public key can write to a reply address; the inbox must not let them drive the terminal.
    """
    text = _ESC.sub("", text)
    return "".join(ch for ch in text if ch == "\n" or (ch >= " " and ch != "\x7f"))


def sent(txid: str) -> str:
    """What the kiosk says after a broadcast. The explorer link is a courtesy, never the proof: a public explorer
    can lag behind the chain; the independent proof is a synced wallet holding only the public key."""
    return (f"sent. txid {txid}\n"
            f"public explorer (may lag a few blocks): {EXPLORER}{txid}\n"
            f"(it shows at most that a shielded transaction exists)\n"
            f"independent proof: bin/devtool-aegis wallet -w wallets/test/V list-tx after sync")


def cmd_pool(a) -> None:
    """Make sure a spending wallet holds at least N spendable notes (self-send split when it does not).

    One wallet with one note goes silent after one failed broadcast (its note stays locked ~40 blocks).
    The rehearsal runs this for the listener wallet; use it for any wallet that must send back-to-back.
    """
    from .session import ensure_pool
    wallet_dir = Path(a.wallet)
    identity = wallet_dir.with_suffix(".age")
    if not identity.exists():
        sys.exit(f"no identity file {identity.name} next to {wallet_dir}")
    have = ensure_pool(Devtool(wallet_dir, identity), a.notes)
    print(f"{wallet_dir.name}: {have} spendable notes (wanted {a.notes})")


def cmd_offer(a) -> None:
    choir = Choir.load()
    reply_to = None
    if a.reply_to:
        try:
            reply_to = check_reply_to(a.reply_to, choir.network)
        except ValueError as e:
            sys.exit(str(e))
    v = voice()
    text = read_text(a)
    confirm(a)
    if a.from_wallet:
        wallet_dir = Path(a.from_wallet)
        identity = wallet_dir.with_suffix(".age")
        if not identity.exists():
            sys.exit(f"no identity file {identity.name} next to {wallet_dir}")
        w = Devtool(wallet_dir, identity)
        print(f"sending from the named wallet {wallet_dir.name} (not an ephemeral session wallet: "
              f"its database keeps what it sent)")
        reply = reply_to or (w.generate_address() if a.reply else None)
        o = make_offering(text, v, reply)
        print(describe(o))
        w.sync()
        txid = w.pay(payment_uri(choir, o.memos))
    else:
        s = Session.current()
        if not s or not s.status()["ready"]:
            sys.exit("no ready session: python3 -m kiosk session open")
        o, txid = s.offer(text, v, choir, a.reply, reply_to)
        print(describe(o))
    if a.reply:
        print(f"a whisper back lands in {'this kiosk session' if not a.from_wallet else 'that'} wallet "
              f"(the operator can read it); see it with: python3 -m kiosk inbox {o.contrib_id}")
    elif reply_to:
        print("a whisper back goes directly to the wallet you named; it never reaches this kiosk")
    print(network.describe(os.environ[network.ENV]))
    print(sent(txid))


def cmd_qr(a) -> None:
    """Phone offering: a ZIP-321 request with the ASCII envelope, as a QR code for the contributor's own wallet.

    Default is a text offering (voiced by the renderer): short, one memo, a scannable QR. --voice sends the ghost
    voice instead when it fits. The phone's wallet keeps what it sent; the kiosk keeps nothing.
    """
    choir = Choir.load()
    if a.reply:
        try:
            a.reply = check_reply_to(a.reply, choir.network)
        except ValueError as e:
            sys.exit(str(e))
    o = make_offering(read_text(a), voice() if a.voice else None, a.reply, as_text=not a.voice, phone=True)
    uri = payment_uri(choir, o.memos)
    print(describe(o) + f"; ASCII envelope, URI {len(uri)} chars")
    if a.png:
        from renderer.whisper import qr_png
        qr_png(uri, a.png)
        print(f"wrote {a.png}: scan it with a testnet wallet (Zingo!) and send; the kiosk stores nothing")
    else:
        from renderer.whisper import qr_ascii
        print(qr_ascii(uri))
    if a.show_uri:
        print(uri)


def cmd_speak(a) -> None:
    """A line in the god's own voice: a kind=3 memo the choir wallet sends to itself (S13 authenticity)."""
    choir = Choir.load()
    v = voice()
    wallet_dir = Path(a.from_wallet)
    w = Devtool(wallet_dir, wallet_dir.with_suffix(".age"))
    o = make_offering(read_text(a), v, None, conductor=True)
    print(describe(o))
    w.sync()
    if a.forge:
        print(f"FORGERY TEST: sending a conductor-kind memo from the outside wallet {wallet_dir.name}; "
              f"every renderer must reject it as NOT THE GOD")
    else:
        if w.default_address() != choir.address:
            sys.exit(f"{wallet_dir.name} is not the choir wallet; use --forge to send a deliberate forgery")
        print("the god speaks: the choir wallet spends its own notes to itself")
    txid = w.pay(payment_uri(choir, o.memos))
    print(network.describe(os.environ[network.ENV]))
    print(sent(txid))


def cmd_reveal(a) -> None:
    """The Eye opens: publish the choir wallet's full viewing key. Irrevocable; do it on purpose, at the climax.

    Prints the key (and a QR) to the screen. Nothing is written unless --to names a file (e.g. for the README).
    """
    wallet_dir = Path(a.from_wallet)
    key, birthday = Devtool(wallet_dir).full_viewing_key()
    choir = Choir.load()
    if Devtool(wallet_dir).default_address() != choir.address:
        sys.exit(f"{wallet_dir.name} is not the choir wallet in config/choir.json")
    print(copy.banner())
    print("THE EYE OPENS. From this moment anyone holding this key can hear every offering, forever.")
    print("It cannot be closed again.\n")
    if not a.yes and input("type OPEN to publish the full viewing key: ").strip() != "OPEN":
        sys.exit("the Eye stays closed")
    print(f"\nfull viewing key (birthday height {birthday}):\n{key}\n")
    from renderer.whisper import qr_ascii
    print(qr_ascii(key))
    print(f"a Watcher evokes the god with:\n  python3 -m renderer summon --key-file KEY --birthday {birthday} "
          f"--wallet wallets/watcher")
    if a.to:
        Path(a.to).write_text(key + "\n")
        print(f"key written to {a.to} (your choice; it is now a published document)")


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
        print("session wallet overwritten and deleted (best-effort on SSDs and VM disks)")


def cmd_inbox(a) -> None:
    """The whisper for one offering only: the visitor types the contrib_id their offering printed."""
    s = Session.current()
    if not s:
        sys.exit("no session")
    raw = a.contrib_id
    if raw is None:
        if not sys.stdin.isatty():
            raw = sys.stdin.readline()
        else:
            raw = input("the contrib_id your offering printed: ")
    try:
        contrib_id = int(str(raw).strip())
    except ValueError:
        sys.exit("a contrib_id is the number the kiosk printed after your offering")
    replies = s.inbox(contrib_id)
    if not replies:
        print("no whisper has returned to that offering (yet)")
    for r in replies:
        print(f"a whisper returned for your offering {r['for_txid'][:12]}…: "
              f"{printable(r['text']) if r['text'] is not None else f'<audio codec {r['codec']}>'}")


def main(argv=None) -> None:
    p = argparse.ArgumentParser(prog="python3 -m kiosk", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="command", required=True)
    text_help = "omit (type it at a prompt) or - (pipe it on stdin); any other value is refused, see above"
    s = sub.add_parser("preview")
    s.add_argument("text", nargs="?", help=text_help)
    s.add_argument("--wav")
    s = sub.add_parser("offer")
    s.add_argument("text", nargs="?", help=text_help)
    r = s.add_mutually_exclusive_group()
    r.add_argument("--reply", action="store_true",
                   help="embed a fresh one-time address of the sending wallet (the kiosk session: the operator "
                        "can read the reply)")
    r.add_argument("--reply-to", metavar="UA",
                   help="embed the visitor's own wallet address: the reply goes there, never to the kiosk")
    s.add_argument("--from", dest="from_wallet", help="send from this wallet dir instead of the session wallet")
    s.add_argument("--yes", action="store_true", help="skip the SEND prompt (scripts, seeding)")
    s = sub.add_parser("qr", help="phone offering: ZIP-321 QR with the ASCII envelope")
    s.add_argument("text", nargs="?", help=text_help)
    s.add_argument("--reply", help="the contributor's own reply address (a fresh one from their wallet)")
    s.add_argument("--voice", action="store_true", help="send the ghost voice instead of text (must fit the QR)")
    s.add_argument("--png", help="write the QR as PNG to this path (default: ASCII in the terminal)")
    s.add_argument("--show-uri", action="store_true")
    s = sub.add_parser("speak", help="a line in the god's own voice (from the choir wallet)")
    s.add_argument("text", nargs="?", help=text_help)
    s.add_argument("--from", dest="from_wallet", required=True, help="the choir wallet dir (or an outsider with --forge)")
    s.add_argument("--forge", action="store_true", help="demo: send a conductor memo from a wallet that is not the god")
    s = sub.add_parser("reveal", help="the Eye opens: publish the choir's full viewing key (irrevocable)")
    s.add_argument("--from", dest="from_wallet", required=True, help="the choir wallet dir")
    s.add_argument("--to", help="also write the key to this file")
    s.add_argument("--yes", action="store_true")
    s = sub.add_parser("session")
    s.add_argument("action", choices=["open", "status", "close"])
    s.add_argument("--notes", type=int, default=8)
    s.add_argument("--pool", default=str(REPO / "wallets" / "test" / "A"))
    s = sub.add_parser("inbox", help="the whisper that returned to one offering of this session")
    s.add_argument("contrib_id", nargs="?", help="the number your offering printed (omit: asked at a prompt)")
    s = sub.add_parser("pool", help="make sure a spending wallet holds at least N spendable notes")
    s.add_argument("wallet", help="wallet dir (its .age identity next to it)")
    s.add_argument("--notes", type=int, default=3)
    for name in ("offer", "speak", "session", "inbox", "pool"):     # the subcommands that talk to lightwalletd
        network.add_argument(sub.choices[name])
    a = p.parse_args(argv)
    if getattr(a, "text", None) not in (None, "-"):      # before anything else runs: no secret on the command line
        sys.exit(REFUSE_ARGV.format(cmd=a.command))
    try:
        # one setting for the whole process: every Devtool built below (session wallet, pool, named wallet) reads it
        os.environ[network.ENV] = network.resolve(getattr(a, "connection", None))
    except ValueError as e:
        p.error(str(e))
    try:
        {"preview": cmd_preview, "offer": cmd_offer, "qr": cmd_qr, "speak": cmd_speak, "reveal": cmd_reveal,
         "session": cmd_session, "inbox": cmd_inbox, "pool": cmd_pool}[a.command](a)
    except DevtoolError as e:
        sys.exit(str(e))


if __name__ == "__main__":
    main()
