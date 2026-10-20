"""Renderer CLI.

  python3 -m renderer once   --wallet wallets/test/V [--as-of N|tip] [--sync] [--out DIR]
  python3 -m renderer daemon --wallet wallets/test/V [--interval 30] [--out DIR]

`daemon` loops sync -> enhance -> render at the scanned height -> write out/score.json + out/render_hash.
Only a view-only wallet is accepted (the public viewing key); --allow-spend-key exists for the V-vs-B check.
Logs carry txids, heights, reason codes and hashes only: never memo content, never addresses.
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
import time

from . import render as rnd
from .decoder import REPO, Decoder
from .score import load_skiplist
from .wallet import NotReady, WalletDB, sync_and_enhance

log = logging.getLogger("renderer")


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
    for txid in result.decode_failures:
        log.warning("audio decode failed tx=%s (rendered as silence)", txid)
    if not result.fingerprint_matches_pin:
        log.warning("decoder fingerprint differs from the pinned codec2 build: render_hash will differ "
                    "from other machines (score_hash is unaffected)")
    log.info("rendered as_of=%d offerings=%d skipped=%d score_hash=%s render_hash=%s", result.score.as_of_height,
             len(result.score.offerings), len(result.score.skipped), result.score_hash, result.render_hash)


def _open_wallet(args) -> WalletDB:
    db = WalletDB(args.wallet)
    if db.has_spend_key() and not args.allow_spend_key:
        sys.exit(f"refusing: {args.wallet} holds a spending key; the renderer runs from the public viewing key "
                 f"(use a view-only wallet such as wallets/test/V)")
    return db


def cmd_once(args) -> None:
    db = _open_wallet(args)
    if args.sync:
        sync_and_enhance(args.devtool, args.wallet, args.server)
    scanned = db.scanned_height()
    as_of = scanned if args.as_of == "tip" else int(args.as_of)
    if as_of > scanned:
        sys.exit(f"as_of {as_of} is above the scanned height {scanned}: sync first")
    result = rnd.render(db, as_of, Decoder(args.c2dec), load_skiplist(args.skiplist))
    _log_result(result, set())
    if args.out:
        rnd.write_outputs(result, args.out)
    print(json.dumps(result.summary(), indent=1))


def cmd_daemon(args) -> None:
    db, decoder, seen, last = _open_wallet(args), Decoder(args.c2dec), set(), None
    log.info("daemon start wallet=%s interval=%ss out=%s", args.wallet, args.interval, args.out)
    while True:
        try:
            sync_and_enhance(args.devtool, args.wallet, args.server)
        except Exception as e:  # network hiccups must not stop the daemon; render what is already synced
            log.warning("%s; rendering what is already synced", e)
        as_of, skiplist = db.scanned_height(), load_skiplist(args.skiplist)
        if (as_of, skiplist) != last:
            try:
                result = rnd.render(db, as_of, decoder, skiplist)
            except NotReady as e:
                log.info("waiting: %s", e)
            else:
                rnd.write_outputs(result, args.out)
                _log_result(result, seen)
                last = (as_of, skiplist)
        time.sleep(args.interval)


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(prog="python3 -m renderer", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="command", required=True)
    for name in ("once", "daemon"):
        s = sub.add_parser(name)
        s.add_argument("--wallet", required=True, help="wallet directory (view-only)")
        s.add_argument("--out", default=str(REPO / "out"), help="output directory ('' = don't write, once only)")
        s.add_argument("--skiplist", default=str(REPO / "config" / "skiplist.txt"))
        s.add_argument("--c2dec", default=str(REPO / "bin" / "c2dec"))
        s.add_argument("--devtool", default=str(REPO / "bin" / "devtool-aegis"))
        s.add_argument("--server", default="zecrocks")
        s.add_argument("--allow-spend-key", action="store_true", help="only for comparing against the choir wallet")
    sub.choices["once"].add_argument("--as-of", default="tip", help="block height, or 'tip' = scanned height")
    sub.choices["once"].add_argument("--sync", action="store_true", help="sync + enhance before rendering")
    sub.choices["daemon"].add_argument("--interval", type=float, default=30.0, help="seconds between loops")
    args = p.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", stream=sys.stderr)
    try:
        (cmd_once if args.command == "once" else cmd_daemon)(args)
    except KeyboardInterrupt:
        log.info("stopped")


if __name__ == "__main__":
    main()
