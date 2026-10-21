"""An ephemeral kiosk session: a throwaway wallet that exists only while the kiosk is open.

open:   create a fresh wallet (new mnemonic, own age identity), fund it from the operator's pool wallet,
        wait until the funds are spendable, split them into a pool of small notes so offerings can go out
        back-to-back (a rejected broadcast locks one note for ~40 blocks, not the whole balance).
offer:  speak the text, build the memos, pay the choir. Optionally embed a fresh diversified reply address.
inbox:  replies received at this wallet, matched by contrib_id, shown only while the session is open.
close:  delete the wallet directory and its identity. The wallet's sent_notes (the secrets) go with it.

Nothing about an offering is written anywhere by the kiosk except the wallet's own database.
"""
from __future__ import annotations

import json
import shutil
import threading
import time
from dataclasses import dataclass
from pathlib import Path

import protocol
from renderer.tts import Voice

from .devtool import Devtool, DevtoolError
from .offering import Choir, Offering, make_offering, payment_uri

REPO = Path(__file__).resolve().parents[1]
SESSIONS_DIR = REPO / "wallets" / "kiosk"
INBOUND_CONFIRMATIONS = 10      # funds from another wallet are spendable after 10 confirmations
OWN_CONFIRMATIONS = 3           # the wallet's own change / self-send outputs after 3
NOTE_ZAT = 200_000              # 0.002 TAZ per pool note: one offering (<= 3 outputs + fee) with room to spare
FEE_RESERVE_ZAT = 100_000
# one devtool process on the session wallet at a time: a double-submitted web form would otherwise run two `pay`
# on one sqlite wallet (locked database, or one note locked for ~40 blocks)
_LOCK = threading.RLock()


@dataclass(frozen=True)
class Session:
    dir: Path

    @property
    def wallet(self) -> Devtool:
        return Devtool(self.dir / "wallet", self.dir / "identity.age")

    @property
    def state_file(self) -> Path:
        return self.dir / "state.json"

    def state(self) -> dict:
        return json.loads(self.state_file.read_text()) if self.state_file.exists() else {}

    def _save(self, **changes) -> None:
        with _LOCK:
            self.state_file.write_text(json.dumps({**self.state(), **changes}, indent=1) + "\n")

    @classmethod
    def current(cls) -> "Session | None":
        link = SESSIONS_DIR / "current"
        return cls(link) if link.exists() else None

    # --- lifecycle -----------------------------------------------------------------------------------------------

    @classmethod
    def open(cls, pool: Devtool, notes: int, log=print) -> "Session":
        if cls.current():
            raise RuntimeError("a session is already open; close it first")
        d = SESSIONS_DIR / "current"
        d.mkdir(parents=True)
        s = cls(d)
        s._save(opened=int(time.time()), notes=notes, offerings=[])
        log("creating the session wallet")
        pool.sync()
        s.wallet.init("kiosk-session", birthday=pool.height())
        budget = notes * NOTE_ZAT + FEE_RESERVE_ZAT
        if pool.spendable_zat() < budget:
            raise DevtoolError(f"pool wallet has {pool.spendable_zat()} zat spendable, needs {budget}")
        log(f"funding it with {budget} zat from the pool wallet")
        s._save(fund_txid=pool.send(s.wallet.default_address(), budget))
        s._wait_spendable(budget, INBOUND_CONFIRMATIONS, log)
        log(f"splitting into {notes} notes")
        s._save(split_txid=s.wallet.pay(_split_uri(s.wallet.default_address(), notes)))
        s._wait_spendable(notes * NOTE_ZAT, OWN_CONFIRMATIONS, log)
        s._save(ready=int(time.time()))
        log("session ready")
        return s

    def _wait_spendable(self, zat: int, confirmations: int, log) -> None:
        log(f"waiting for ~{confirmations} confirmations (~{confirmations * 35 // 60 + 1} min)")
        for _ in range(120):
            self.wallet.sync()
            if self.wallet.spendable_zat() >= zat:
                return
            time.sleep(20)
        raise DevtoolError("funds did not become spendable in time")

    def close(self) -> None:
        """Wipe the wallet, its identity and the session state. The secrets sent from it are gone with it."""
        shutil.rmtree(self.dir)

    # --- offerings -----------------------------------------------------------------------------------------------

    def offer(self, text: str, voice: Voice, choir: Choir, want_reply: bool) -> tuple[Offering, str]:
        with _LOCK:
            reply = self.wallet.generate_address() if want_reply else None
            offering = make_offering(text, voice, reply)
            # sync first: a transaction built from a stale chain tip gets an expiry height that has already passed
            # and is rejected at broadcast ("must not be mined at a block Height greater than its expiry"; rehearsal #1)
            self.wallet.sync()
            txid = self.wallet.pay(payment_uri(choir, offering.memos))
            self._save(offerings=self.state().get("offerings", []) +
                       [{"contrib_id": offering.contrib_id, "txid": txid}])
        return offering, txid

    def status(self) -> dict:
        st = self.state()
        try:
            spendable = self.wallet.spendable_zat()
        except DevtoolError:
            spendable = None
        return {"ready": "ready" in st, "spendable_zat": spendable, "offerings": len(st.get("offerings", [])),
                "notes_left": None if spendable is None else spendable // NOTE_ZAT}

    def inbox(self) -> list[dict]:
        """Replies received at this wallet (any form), matched against the offerings sent in this session."""
        self.wallet.sync()
        self.wallet.enhance()
        mine = {o["contrib_id"]: o["txid"] for o in self.state().get("offerings", [])}
        out = []
        for memo in _received_memos(self.dir / "wallet" / "data.sqlite"):
            try:
                r = protocol.decode_any_reply(memo)
            except protocol.ProtocolError:
                continue
            out.append({"contrib_id": r.contrib_id, "for_txid": mine.get(r.contrib_id), "codec": r.codec,
                        "text": r.data.decode("utf-8", "replace") if r.codec == protocol.CODEC_TEXT else None})
        return out


def _split_uri(address: str, notes: int) -> str:
    amount = f"{NOTE_ZAT / 100_000_000:.8f}".rstrip("0")
    parts = [f"address{'' if i == 0 else f'.{i}'}={address}&amount{'' if i == 0 else f'.{i}'}={amount}"
             for i in range(notes)]
    return "zcash:?" + "&".join(parts)


def spendable_note_values(db_path: Path, tip: int, min_zat: int = NOTE_ZAT // 2) -> list[int]:
    """Values of the notes of at least `min_zat` this wallet could spend now, by the wallet's own rule (ZIP 315).

    This devtool build never sets `transactions.trust_status`, so the wallet treats every transaction as
    untrusted: only notes received at the internal (change) key scope get the 3-confirmation rule; a self-send
    to the wallet's own external address needs 10 like any inbound note (rehearsal #5). A note spent by a
    pending transaction stays locked until that transaction's expiry height passes (failure drill 5). The wallet
    also gates on its note-commitment-tree checkpoints, which this query cannot see: callers cross-check the
    sum against the wallet's own spendable balance (`ensure_pool`).
    """
    import sqlite3
    con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        rows = con.execute(
            """select n.value from ironwood_received_notes n
               join transactions t on t.id_tx = n.transaction_id
               where n.value >= :min and t.mined_height is not null
                 and t.mined_height <= :tip - (case n.recipient_key_scope when 1 then :own else :inbound end) + 1
                 and not exists (select 1 from ironwood_received_note_spends s
                                 join transactions t2 on t2.id_tx = s.transaction_id
                                 where s.ironwood_received_note_id = n.id
                                   and (t2.mined_height is not null or coalesce(t2.expiry_height, 0) = 0
                                        or t2.expiry_height >= :tip))""",
            {"min": min_zat, "tip": tip, "own": OWN_CONFIRMATIONS, "inbound": INBOUND_CONFIRMATIONS}).fetchall()
        return [int(v) for (v,) in rows]
    finally:
        con.close()


def spendable_notes(db_path: Path, tip: int, min_zat: int = NOTE_ZAT // 2) -> int:
    return len(spendable_note_values(db_path, tip, min_zat))


def _pool_state(wallet: Devtool) -> tuple[int, bool]:
    """(notes the query counts, whether the wallet itself agrees they are all spendable)."""
    values = spendable_note_values(wallet.wallet_dir / "data.sqlite", wallet.height())
    return len(values), wallet.spendable_zat() >= sum(values)


def ensure_pool(wallet: Devtool, notes: int, log=print, wait_minutes: int = 30) -> int:
    """Make sure a spending wallet holds at least `notes` spendable notes; split its funds if it does not.

    Used by the rehearsal for the listener wallet and usable for the operator's pool wallet. If the funds are
    locked by a pending transaction (a failed broadcast), waits for its expiry, then splits. Returns the count.
    """
    budget = notes * NOTE_ZAT + FEE_RESERVE_ZAT
    deadline = time.time() + wait_minutes * 60
    while True:
        wallet.sync()
        have, agreed = _pool_state(wallet)
        if have >= notes and agreed:
            return have
        if have < notes and wallet.spendable_zat() >= budget:
            break
        if time.time() > deadline:
            raise DevtoolError(f"{wallet.wallet_dir.name} has {have} spendable notes (need {notes}) and "
                               f"{wallet.spendable_zat()} zat spendable (need {budget}); top it up")
        log(f"{wallet.wallet_dir.name}: {have} spendable notes, funds locked or pending; waiting (~1 min)")
        time.sleep(60)
    log(f"{wallet.wallet_dir.name}: {have} spendable notes, splitting into {notes} of {NOTE_ZAT} zat")
    wallet.pay(_split_uri(wallet.default_address(), notes))
    log(f"waiting for ~{OWN_CONFIRMATIONS} confirmations (~{OWN_CONFIRMATIONS * 35 // 60 + 1} min)")
    for _ in range(120):
        wallet.sync()
        have, agreed = _pool_state(wallet)
        if have >= notes and agreed:
            return have
        time.sleep(20)
    raise DevtoolError("the split did not become spendable in time")


def _received_memos(db_path: Path) -> list[bytes]:
    import sqlite3
    con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        return [bytes(m) for (m,) in con.execute(
            "select memo from ironwood_received_notes where memo is not null and is_change = 0")]
    finally:
        con.close()
