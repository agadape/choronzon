"""The score: every offering at an explicit height, in canonical order, plus every skipped tx and why.

Built from chain data only (no audio decoder), so its hash is the claim "the blockchain is the score".
Canonical order = (mined_height, tx_index, action_index): miner order inside a block, not send order.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

import protocol
from protocol import ProtocolError

from .wallet import Candidate, NotReady

SCORE_FORMAT = "score/1"
REASON_FLAGGED = "flagged"                  # on the open skip-list: still on chain, never sung
REASON_OWN_SPEND = "choir-own-spend"        # the choir wallet spent its own notes without a conductor line
REASON_FORGED = "forged-conductor"          # a conductor line that did NOT spend the choir's own notes: NOT THE GOD
REASON_UNSUPPORTED_POOL = "unsupported-pool"

_TXID = re.compile(r"^[0-9a-f]{64}$")


@dataclass(frozen=True)
class Offering:
    txid: str
    height: int
    tx_index: int
    action_index: int
    contrib_id: int
    codec: int
    data: bytes                    # decoded payload (text or Codec2 frames); not written to score.json
    memo_count: int
    has_reply: bool                # a reply address that passes its checksum is embedded (the address is not kept)
    reply_invalid: bool
    raw_memos: tuple[bytes, ...]   # every memo of the tx, zero-padded to 512 = the on-chain plaintext
    conductor: bool = False        # the god's own voice: a kind=3 line that spent the choir wallet's own notes (S13)

    def to_json(self) -> dict:
        d = {"tx": self.txid, "height": self.height, "tx_index": self.tx_index, "action_index": self.action_index,
             "contrib_id": self.contrib_id, "codec": self.codec, "bytes": len(self.data),
             "memos": self.memo_count, "has_reply": self.has_reply}
        if self.conductor:   # key only present for conductor lines: score JSON of older heights is unchanged
            d["conductor"] = True
        return d


@dataclass(frozen=True)
class Skipped:
    txid: str
    height: int
    tx_index: int
    reason: str

    def to_json(self) -> dict:
        return {"tx": self.txid, "height": self.height, "tx_index": self.tx_index, "reason": self.reason}


@dataclass(frozen=True)
class Score:
    as_of_height: int
    offerings: tuple[Offering, ...]
    skipped: tuple[Skipped, ...]

    def to_json(self) -> dict:
        return {"format": SCORE_FORMAT, "as_of_height": self.as_of_height,
                "offerings": [o.to_json() for o in self.offerings], "skipped": [s.to_json() for s in self.skipped]}


def load_skiplist(path: str | Path | None) -> frozenset[str]:
    """One display-order txid per line; '#' starts a comment (put the reason there). Missing file = empty list."""
    if path is None or not Path(path).exists():
        return frozenset()
    txids = set()
    for n, line in enumerate(Path(path).read_text().splitlines(), 1):
        entry = line.split("#", 1)[0].strip().lower()
        if not entry:
            continue
        if not _TXID.match(entry):
            raise ValueError(f"{path}:{n}: not a 64-hex txid")
        txids.add(entry)
    return frozenset(txids)


def _is_empty(memo: bytes) -> bool:
    return memo.rstrip(b"\0") in (b"", b"\xf6")  # no memo / ZIP-302 "empty memo"


def build_score(candidates: list[Candidate], as_of: int, skiplist: frozenset[str] = frozenset()) -> Score:
    """Fails closed (NotReady) when a memo that decides the outcome has not been fetched yet. Memos of txs that
    are skipped anyway may be missing: a spend-key wallet keeps its own self-send memo in sent_notes, not here."""
    offerings, skipped, pending = [], [], []
    for c in sorted(candidates, key=lambda c: (c.height, c.tx_index, c.action_index)):
        if c.height > as_of:
            continue
        reason = (REASON_FLAGGED if c.txid in skiplist else
                  REASON_UNSUPPORTED_POOL if c.pool != "ironwood" else None)
        if reason is None and any(m is None for m in c.memos):
            if c.own_spend:          # a self-send whose memo this wallet cannot read: never a conductor line here
                reason = REASON_OWN_SPEND
            else:
                pending.append(c.txid)
                continue
        if reason is None:
            try:
                d = protocol.decode_contribution([protocol.normalize_memo(m) for m in c.memos if not _is_empty(m)])
            except ProtocolError as e:
                d = None
                reason = e.code
            # Authenticity (S13): the god's voice is a kind=3 line on outputs flagged is_change, i.e. the tx spent
            # the choir wallet's own notes, which only the spend key can do. Everything else is not the god.
            if d is not None and c.own_spend and d.kind != protocol.KIND_CONDUCTOR:
                reason = REASON_OWN_SPEND
            elif d is not None and not c.own_spend and d.kind == protocol.KIND_CONDUCTOR:
                reason = REASON_FORGED
            elif reason and c.own_spend:
                reason = REASON_OWN_SPEND   # funding / split self-sends carry no v1 memo at all
        if reason:
            skipped.append(Skipped(c.txid, c.height, c.tx_index, reason))
            continue
        offerings.append(Offering(c.txid, c.height, c.tx_index, c.action_index, d.contrib_id, d.codec, d.data,
                                  len(c.memos), d.reply_addr is not None, d.reply_addr_invalid,
                                  tuple(m.ljust(protocol.MEMO_SIZE, b"\0") for m in c.memos),
                                  d.kind == protocol.KIND_CONDUCTOR))
    if pending:
        raise NotReady(f"{len(pending)} tx at or below {as_of} have no memo yet (run enhance)")
    return Score(as_of, tuple(offerings), tuple(skipped))
