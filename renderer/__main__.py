"""Renderer CLI.

  python3 -m renderer once   --wallet wallets/test/V [--as-of N|tip|last] [--sync] [--out DIR]
  python3 -m renderer daemon --wallet wallets/test/V [--interval 30] [--out DIR]
  python3 -m renderer whisper <txid> --wallet wallets/test/V [--text-file F | text on stdin] [--phone] [--send-from wallets/test/L]
  python3 -m renderer summon --key-file key.txt --birthday 4503120 --wallet wallets/watcher [--as-of N]

`daemon` loops sync -> enhance -> render at the scanned height -> write out/score.json + out/render_hash.
Only a view-only wallet is accepted (the public viewing key); --allow-spend-key exists for the V-vs-B check.
Every lightwalletd connection (sync, enhance, the whisper send, summon's init-fvk) goes over Tor by default;
`--connection direct` or LWD_CONNECTION=direct is the deliberate escape hatch (renderer/network.py).
Logs carry txids, heights, reason codes and hashes only: never memo content, never addresses.
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from pathlib import Path

from . import network
from . import render as rnd
from .decoder import REPO, Decoder
from .tts import Voice
from .score import load_skiplist
from .wallet import NotReady, WalletDB, sync_and_enhance

log = logging.getLogger("renderer")
DEFAULT_WHISPER = "you are not alone."


def _log_result(result: rnd.RenderResult, seen: set[str]) -> None:
    """One line per skipped tx (with its reason) and per offering, each logged once per process."""
    for s in result.score.skipped:
        if s.txid not in seen:
            seen.add(s.txid)
            log.info("skip tx=%s height=%d reason=%s", s.txid, s.height, s.reason)
    for o in result.score.offerings:
        if o.txid not in seen:
            seen.add(o.txid)
            log.info("offering tx=%s height=%d codec=%d%s", o.txid, o.height, o.codec,
                     " reply-address-invalid" if o.reply_invalid else "")
    for txid in result.mix.failures:
        log.warning("voice failed tx=%s (rendered as 1 s of silence)", txid)
    if not result.decoder_matches_pin:
        log.warning("decoder fingerprint differs from the pinned codec2 build: render_hash will differ "
                    "from other machines (score_hash is unaffected)")
    if not result.voice_matches_pin:
        log.warning("voice fingerprint differs from the pinned espeak-ng/sox build: render_hash will differ "
                    "from other machines (score_hash is unaffected)")
    log.info("rendered as_of=%d offerings=%d skipped=%d score_hash=%s render_hash=%s", result.score.as_of_height,
             len(result.score.offerings), len(result.score.skipped), result.score_hash, result.render_hash)


def _voice(decoder: Decoder, args) -> Voice:
    voice = Voice(decoder, cache_dir=Path(args.out) / "cache" if args.out else None)
    if not voice.available():
        sys.exit("espeak-ng and sox are required to voice text offerings (scripts/setup.sh installs them)")
    return voice


def _open_wallet(args) -> WalletDB:
    db = WalletDB(args.wallet)
    if db.has_spend_key() and not args.allow_spend_key:
        sys.exit(f"refusing: {args.wallet} holds a spending key; the renderer runs from the public viewing key "
                 f"(use a view-only wallet such as wallets/test/V)")
    return db


def cmd_once(args) -> None:
    db = _open_wallet(args)
    if args.sync:
        try:
            sync_and_enhance(args.devtool, args.wallet, args.server, connection=args.connection)
        except RuntimeError as e:   # e.g. Tor cannot connect: say so and stop; never render a stale view as fresh
            sys.exit(str(e))
    scanned = db.scanned_height()
    as_of = scanned if args.as_of == "tip" else db.newest_tx_height() if args.as_of == "last" else int(args.as_of)
    if as_of > scanned:
        sys.exit(f"as_of {as_of} is above the scanned height {scanned}: sync first")
    decoder = Decoder(args.c2dec)
    result = rnd.render(db, as_of, decoder, load_skiplist(args.skiplist), _voice(decoder, args))
    _log_result(result, set())
    if args.out:
        rnd.write_outputs(result, args.out)
    print(json.dumps(result.summary(), indent=1))


def cmd_daemon(args) -> None:
    db, decoder, seen, last = _open_wallet(args), Decoder(args.c2dec), set(), None
    voice = _voice(decoder, args)
    log.info("daemon start wallet=%s interval=%ss out=%s connection=%s", args.wallet, args.interval, args.out,
             args.connection)
    while True:
        try:
            try:
                sync_and_enhance(args.devtool, args.wallet, args.server, connection=args.connection)
            except Exception as e:  # network hiccups must not stop the daemon; render what is already synced
                log.warning("%s; rendering what is already synced", e)
            as_of, skiplist = db.scanned_height(), load_skiplist(args.skiplist)
            if (as_of, skiplist) != last:
                try:
                    result = rnd.render(db, as_of, decoder, skiplist, voice)
                except NotReady as e:
                    log.info("waiting: %s", e)
                else:
                    rnd.write_outputs(result, args.out)
                    _log_result(result, seen)
                    last = (as_of, skiplist)
        except Exception:  # a bad skiplist line, a locked sqlite, a hung subprocess: log it, keep the last render
            log.exception("render loop failed; retrying after the interval")
        time.sleep(args.interval)


def cmd_whisper(args) -> None:
    """Whisper back to one offering: print (or send) a direct shielded reply to its embedded address."""
    from . import whisper
    if args.text is not None:
        sys.exit("refusing --text: the whisper would land in the shell history and in `ps`. Pipe it "
                 "(printf '%s' '...' | python3 -m renderer whisper <txid> ...), use --text-file F, or type it at "
                 "the prompt")
    db = _open_wallet(args)
    target = whisper.find_target(db, args.txid)
    if target is None:
        sys.exit("that offering carries no (valid) reply address of this network")
    uri = whisper.reply_uri(target, _whisper_text(args), phone=args.phone)
    if args.send_from:
        from kiosk.devtool import Devtool, DevtoolError
        wallet_dir = Path(args.send_from)
        w = Devtool(wallet_dir, wallet_dir.with_suffix(".age"), server=args.server, connection=args.connection)
        try:
            w.sync()
            txid = w.pay(uri)
        except DevtoolError as e:      # sanitized by the wrapper: exit code + last line, never an address
            sys.exit(f"cannot send the whisper from {wallet_dir.name}: {e}")
        print(network.describe(args.connection))
        print(f"whisper sent directly to the offering's reply address. txid {txid}")
        print("(the choir's key holders cannot see this transaction; it reaches whichever wallet owns the reply "
              "address, for a kiosk --reply offering the kiosk's session wallet)")
    else:
        print(f"reply to contrib_id {target.contrib_id} of offering {target.txid[:12]}…")
        print("pay this with any wallet that understands the address (the reply never passes through the choir; "
              "it reaches whichever wallet owns the reply address):")
        print(uri)
        print(whisper.qr_ascii(uri))


def _whisper_text(args) -> str:
    """The whisper: --text-file, else stdin (pipe), else a prompt; empty means the default line."""
    if args.text_file:
        text = Path(args.text_file).read_text(encoding="utf-8")
    elif not sys.stdin.isatty():
        text = sys.stdin.read()
    else:
        text = input("your whisper (Enter for 'you are not alone.'): ")
    return text.strip() or DEFAULT_WHISPER


def cmd_summon(args) -> None:
    """A new Watcher: from the published key alone, build a view-only wallet, sync it and evoke the god.

    This is the second-laptop proof: a machine that had nothing but the key prints the same hashes.
    The key is read from --key-file or the SUMMON_KEY environment variable, never from our command line (shell
    history) and never logged. The wallet tool itself takes it only as an argument: `init-fvk --fvk <key>` holds
    it on the devtool's own argv (visible in `ps` to local processes) for the moment that command runs, once per
    Watcher. The key is published on purpose from 24 Oct, so this is low risk; a fix needs a devtool change.
    """
    import os
    from kiosk.devtool import Devtool, DevtoolError
    key = Path(args.key_file).read_text().strip() if args.key_file else os.environ.get("SUMMON_KEY", "").strip()
    if not key.startswith(("uview", "uvftest", "uvf1")):
        sys.exit("no key: pass --key-file or set SUMMON_KEY (a unified full viewing key)")
    wallet_dir = Path(args.wallet)
    if not (wallet_dir / "data.sqlite").exists():
        if args.tor_cache_from and args.connection == "tor":
            # only the public Tor directory cache, never the guards (kiosk/session.py seed_tor_cache)
            from kiosk.session import seed_tor_cache
            if seed_tor_cache(Path(args.tor_cache_from), wallet_dir):
                log.info("summon: Tor directory cache copied from %s", args.tor_cache_from)
        log.info("summon: creating a view-only wallet from the key (birthday %s)", args.birthday)
        try:
            Devtool(wallet_dir, server=args.server, connection=args.connection)._run(
                "init-fvk", "--name", "watcher", "--fvk", key, "--birthday", str(args.birthday), "-s", args.server)
        except DevtoolError as e:
            sys.exit(str(e))
    log.info("summon: syncing over %s (first time: a few minutes)", args.connection)
    try:
        sync_and_enhance(args.devtool, wallet_dir, args.server, connection=args.connection)
    except RuntimeError as e:
        sys.exit(str(e))
    args.sync, args.allow_spend_key = False, False
    cmd_once(args)


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(prog="python3 -m renderer", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="command", required=True)
    for name in ("once", "daemon", "whisper", "summon"):
        s = sub.add_parser(name)
        s.add_argument("--wallet", required=True, help="wallet directory (view-only)")
        s.add_argument("--out", default=str(REPO / "out"), help="output directory ('' = don't write, once only)")
        s.add_argument("--skiplist", default=str(REPO / "config" / "skiplist.txt"))
        s.add_argument("--c2dec", default=str(REPO / "bin" / "c2dec"))
        s.add_argument("--devtool", default=str(REPO / "bin" / "devtool-aegis"))
        s.add_argument("--server", default="zecrocks")
        network.add_argument(s)
        s.add_argument("--allow-spend-key", action="store_true", help="only for comparing against the choir wallet")
    sub.choices["once"].add_argument("--as-of", default="tip", help="block height, 'tip' = scanned height, 'last' = height of the newest transaction the key sees")
    sub.choices["once"].add_argument("--sync", action="store_true", help="sync + enhance before rendering")
    sub.choices["daemon"].add_argument("--interval", type=float, default=30.0, help="seconds between loops")
    s = sub.choices["summon"]
    s.add_argument("--key-file", help="file holding the published full viewing key (or set SUMMON_KEY)")
    s.add_argument("--birthday", type=int, required=True, help="block height the god was born at")
    s.add_argument("--as-of", default="tip", help="block height to evoke at (compare with the other laptop)")
    s.add_argument("--tor-cache-from", help="copy the public Tor directory cache from this warm wallet dir (a cold "
                   "Tor bootstrap takes minutes; guards are never copied)")
    w = sub.choices["whisper"]
    w.add_argument("txid", help="the offering to answer (display order)")
    w.add_argument("--text", default=None, help="refused (shell history, ps): pipe the whisper on stdin, "
                   "use --text-file, or type it at the prompt")
    w.add_argument("--text-file", help="read the whisper from this file")
    w.add_argument("--phone", action="store_true", help="readable GC1R memo for a phone wallet")
    w.add_argument("--send-from", help="send the reply now from this wallet dir (its .age identity next to it)")
    args = p.parse_args(argv)
    try:
        args.connection = network.resolve(args.connection)
    except ValueError as e:     # a bad LWD_CONNECTION value: refuse rather than guess
        p.error(str(e))
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", stream=sys.stderr)
    try:
        {"once": cmd_once, "daemon": cmd_daemon, "whisper": cmd_whisper, "summon": cmd_summon}[args.command](args)
    except KeyboardInterrupt:
        log.info("stopped")


if __name__ == "__main__":
    main()
