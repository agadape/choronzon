"""Read-only view of a zcash_client_sqlite wallet DB (as written by bin/devtool-aegis), plus sync/enhance.

The renderer only ever reads. Memos are not in compact blocks, so `enhance` must have fetched every full
transaction first; a note whose memo is still NULL makes the render fail closed (NotReady) instead of being
counted as an invalid offering.
"""
from __future__ import annotations

import sqlite3
import subprocess
from dataclasses import dataclass
from pathlib import Path

PRIORITY_SCANNED = 10  # zcash_client_sqlite ScanPriority: 0 Ignored, 10 Scanned, >10 still to scan

# (table, output-index column, pool) -- only Ironwood carries offerings; other pools are listed, never dropped silently
_NOTE_TABLES = (("ironwood_received_notes", "action_index", "ironwood"),
                ("orchard_received_notes", "action_index", "orchard"),
                ("sapling_received_notes", "output_index", "sapling"))
_POOL_IDS = {"sapling": 2, "orchard": 3, "ironwood": 4}   # sent_notes.output_pool (zcash_client_sqlite PoolType)


class NotReady(RuntimeError):
    """The wallet has not fetched everything needed to render at this height yet."""


@dataclass(frozen=True)
class Candidate:
    """Every note this wallet received in one transaction."""
    txid: str                      # display (explorer) byte order; wallet DBs store it reversed
    height: int
    tx_index: int
    action_index: int              # lowest output index of this tx's notes
    pool: str
    memos: tuple[bytes | None, ...]  # one per note, in output order; None = memo not fetched yet
    own_spend: bool                # outputs flagged is_change: the tx spent this wallet's own notes (S13)


def display_txid(internal_hex: str) -> str:
    return bytes.fromhex(internal_hex)[::-1].hex()


class WalletDB:
    def __init__(self, wallet_dir: str | Path):
        self.path = Path(wallet_dir) / "data.sqlite"
        if not self.path.is_file():
            raise FileNotFoundError(f"no wallet database at {self.path}")

    def _query(self, sql: str, args: tuple = ()) -> list[tuple]:
        con = sqlite3.connect(f"file:{self.path}?mode=ro", uri=True)
        try:
            return con.execute(sql, args).fetchall()
        finally:
            con.close()

    def has_spend_key(self) -> bool:
        return any(row[0] for row in self._query("select has_spend_key from accounts"))

    def scanned_height(self) -> int:
        """Highest height below which every block has been scanned."""
        tip = self._query("select max(height) from blocks")[0][0] or 0
        gap = self._query("select min(block_range_start) from scan_queue where priority > ? and block_range_start <= ?",
                          (PRIORITY_SCANNED, tip))[0][0]
        return tip if gap is None else min(tip, gap - 1)

    def newest_tx_height(self) -> int:
        """Height of the newest transaction the key can see (the scanned height when there is none). A render there
        has the same score as one at the tip, but its hashes change only when something new is mined."""
        scanned = self.scanned_height()
        return max((c.height for c in self.candidates(scanned)), default=scanned)

    def candidates(self, as_of: int) -> list[Candidate]:
        tables = {r[0] for r in self._query("select name from sqlite_master where type = 'table'")}
        out = []
        for table, index_col, pool in _NOTE_TABLES:
            if table not in tables:
                continue
            # A spend-key wallet stores the memo of its OWN outputs in sent_notes, not in received_notes (where it
            # is NULL); a view-only wallet decrypts them into received_notes. Fall back so both read the same bytes.
            memo_expr = "n.memo"
            if "sent_notes" in tables:
                memo_expr = (f"coalesce(n.memo, (select s.memo from sent_notes s where s.transaction_id = t.id_tx "
                             f"and s.output_index = n.{index_col} and s.output_pool = {_POOL_IDS[pool]} limit 1))")
            rows = self._query(f"""
                select hex(t.txid), t.mined_height, t.tx_index, n.{index_col}, {memo_expr}, n.is_change
                from {table} n join transactions t on t.id_tx = n.transaction_id
                where t.mined_height is not null and t.mined_height <= ?
                order by t.mined_height, t.tx_index, n.{index_col}""", (as_of,))
            by_tx: dict[str, list[tuple]] = {}
            for row in rows:
                by_tx.setdefault(row[0], []).append(row)
            for txid, notes in by_tx.items():
                _, height, tx_index, first_index, _, _ = notes[0]
                out.append(Candidate(display_txid(txid), height, tx_index, first_index, pool,
                                     tuple(None if n[4] is None else bytes(n[4]) for n in notes),
                                     any(n[5] for n in notes)))
        return sorted(out, key=lambda c: (c.height, c.tx_index, c.action_index))


def sync_and_enhance(devtool: str | Path, wallet_dir: str | Path, server: str = "zecrocks",
                     timeout: int = 900, connection: str | None = None, attempts: int = 3,
                     pause: float = 10.0) -> None:
    """Fetch new blocks, then the full transactions (memos). Devtool output is not echoed: it can contain addresses.

    `connection` None = the default (tor; LWD_CONNECTION overrides; see renderer/network.py). Both commands only
    read and resume where they stopped, so a failed one is retried on the SAME route (a Tor circuit can break
    during a long first sync; lightwalletd resets TLS now and then): up to `attempts` times, never over direct.
    """
    import logging
    import time
    from . import network
    connection = network.resolve(connection)
    for command in ("sync", "enhance"):
        cmd = [str(devtool), "wallet", "-w", str(wallet_dir), command, "-s", server,
               *network.args_for(command, connection)]
        for attempt in range(1, attempts + 1):
            try:
                done = subprocess.run(cmd, capture_output=True, timeout=timeout)
            except subprocess.TimeoutExpired:
                error = f"devtool {command} timed out after {timeout} s"
            else:
                if done.returncode == 0:
                    break
                from kiosk.devtool import sanitize      # the last line only, addresses and memo values removed
                err = done.stderr.decode("utf-8", "replace").strip().splitlines() or [""]
                error = f"devtool {command} failed with exit code {done.returncode}: {sanitize(err[-1].strip())[:200]}"
            if attempt == attempts:
                raise RuntimeError(f"{error} ({attempts} attempts over {connection})"
                                   f"{network.failure_hint(connection)}")
            logging.getLogger("renderer").warning("%s; retrying over %s (%d/%d)", error, connection, attempt + 1,
                                                  attempts)
            time.sleep(pause)
