#!/usr/bin/env python3
"""Count the offerings that came from wallets we do not control.

We cannot learn who sent an offering (that is the point), but we do know every transaction our own wallets built.
An accepted offering at or after --since whose txid is not among them came from outside. Prints counts, block range
and txids only: no memo text, no addresses.

  python3 scripts/outside_offerings.py --since 4543331 [--score out/score.json] [--exclude txid ...]

Our wallets: every wallet directory under wallets/ that has a data.sqlite (A, B, L, the open kiosk session, ...).
A closed kiosk session's wallet is deleted, so use a --since height after the last session you closed, or pass
its txids with --exclude. Offerings the team sent from a wallet outside wallets/ (e.g. the developer's phone)
must be passed with --exclude too.
"""
from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]


def own_txids(root: Path) -> set[str]:
    """Display-order txids of every transaction any of our wallets built (it holds a sent_notes row for it)."""
    out: set[str] = set()
    for db in root.rglob("data.sqlite"):
        try:
            con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
            rows = con.execute("select distinct t.txid from sent_notes s join transactions t "
                               "on s.transaction_id = t.id_tx").fetchall()
            con.close()
        except sqlite3.Error:
            continue
        out.update(bytes(r[0])[::-1].hex() for r in rows)
    return out


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--since", type=int, required=True, help="first block height that counts")
    p.add_argument("--score", default=str(REPO / "out" / "score.json"))
    p.add_argument("--wallets", default=str(REPO / "wallets"))
    p.add_argument("--exclude", nargs="*", default=[], help="txids the team sent from wallets outside --wallets")
    a = p.parse_args()

    doc = json.loads(Path(a.score).read_text(encoding="utf-8"))
    score = doc["score"]
    ours = own_txids(Path(a.wallets)) | {t.lower() for t in a.exclude}
    recent = [o for o in score["offerings"] if o["height"] >= a.since and not o.get("conductor")]
    outside = [o for o in recent if o["tx"] not in ours]
    print(f"score as_of {score['as_of_height']}, render_hash {doc['render_hash'][:8]}…, counting from block {a.since}")
    print(f"offerings since then: {len(recent)}  from our wallets: {len(recent) - len(outside)}  "
          f"from wallets we do not control: {len(outside)}")
    for o in outside:
        print(f"  {o['tx']}  block {o['height']}  codec {o['codec']}")


if __name__ == "__main__":
    main()
