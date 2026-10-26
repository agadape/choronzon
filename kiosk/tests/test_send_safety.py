"""Audit 26 Oct: a send that failed may have broadcast. Nothing may resend it or call it "not sent"; a session open
that fails says which state it left; `session status` counts notes and shows its age."""
import json
import sqlite3
import time

import pytest

from kiosk import __main__ as cli
from kiosk import session as ks
from kiosk.devtool import DevtoolError


def _wallet_db(path, rows):
    """rows: (id_tx, txid_bytes_internal_order, created, raw, mined_height)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(path)
    con.executescript("""
        create table transactions (id_tx integer primary key, txid blob, created text, raw blob, mined_height integer,
                                   expiry_height integer);
        create table ironwood_received_notes (id integer primary key, transaction_id integer, value integer,
                                              is_change integer, recipient_key_scope integer);
        create table ironwood_received_note_spends (ironwood_received_note_id integer, transaction_id integer);
    """)
    con.executemany("insert into transactions (id_tx, txid, created, raw, mined_height) values (?,?,?,?,?)", rows)
    con.commit()
    con.close()
    return path


TX_A, TX_B = bytes(range(32)), bytes(range(32, 64))


def test_built_since_sees_only_transactions_this_wallet_built_after_the_marker(tmp_path):
    db = _wallet_db(tmp_path / "w" / "data.sqlite", [
        (1, b"\x01" * 32, "2026-10-25", b"raw", 100),      # built before the marker
        (2, b"\x02" * 32, None, b"raw", 101),              # received (enhanced: raw, no created)
    ])
    marker = ks.last_tx_id(db)
    assert marker == 2 and ks.built_since(db, marker) == []
    con = sqlite3.connect(db)
    con.execute("insert into transactions (id_tx, txid, created, raw, mined_height) values (3, ?, 'now', x'00', null)",
                (TX_A,))
    con.execute("insert into transactions (id_tx, txid, created, raw, mined_height) values (4, ?, null, null, 105)",
                (TX_B,))                                      # a received tx that sync added: not ours
    con.commit()
    con.close()
    # display order is the wallet's internal order reversed
    assert ks.built_since(db, marker) == [(TX_A[::-1].hex(), None)]


def test_sent_since_cli_exit_codes(tmp_path, capsys, monkeypatch):
    monkeypatch.setenv("LWD_CONNECTION", "tor")        # restored after the test (main() sets it process-wide)
    w = tmp_path / "w"
    _wallet_db(w / "data.sqlite", [(1, TX_A, "x", b"r", None)])
    cli.main(["sent-since", str(w)])
    assert capsys.readouterr().out.strip() == "1"
    with pytest.raises(SystemExit) as e:
        cli.main(["sent-since", str(w), "--after", "1"])
    assert e.value.code == 3 and "sent nothing" in capsys.readouterr().out
    cli.main(["sent-since", str(w), "--after", "0"])           # found: exit 0 (no SystemExit)
    assert TX_A[::-1].hex() in capsys.readouterr().out


class FakeWallet:
    def __init__(self, fail_pay=None, wallet_dir=None):
        self.fail_pay, self.wallet_dir, self.paid = fail_pay, wallet_dir, []

    def sync(self):
        pass

    def generate_address(self):
        return "unused"

    def pay(self, uri):
        self.paid.append(uri)
        if self.fail_pay:
            raise DevtoolError(self.fail_pay)
        return "ab" * 32


def _session(tmp_path, monkeypatch, wallet, state=None):
    s = ks.Session(tmp_path / "current")
    s.dir.mkdir(parents=True, exist_ok=True)
    s.state_file.write_text(json.dumps(state or {"ready": 1, "offerings": []}))
    monkeypatch.setattr(ks.Session, "wallet", property(lambda self: wallet))
    monkeypatch.setattr(ks, "make_offering", lambda text, voice, reply: type("O", (), {"memos": [b"m"],
                                                                                          "contrib_id": 7})())
    monkeypatch.setattr(ks, "payment_uri", lambda choir, memos: "zcash:?x")
    return s


def test_a_failed_pay_is_status_unknown_never_not_sent(tmp_path, monkeypatch):
    w = FakeWallet(fail_pay="devtool pay exit 1: peer closed connection without sending TLS close_notify")
    s = _session(tmp_path, monkeypatch, w)
    with pytest.raises(ks.SendStatusUnknown) as e:
        s.offer("x", None, None, False)
    assert str(e.value).startswith("status unknown") and "Check before retrying" in str(e.value)
    assert isinstance(e.value, DevtoolError)        # every existing `except DevtoolError` still catches it
    assert len(w.paid) == 1                         # tried once, never resent
    assert "contrib_id 7" in str(e.value)
    assert s.state()["offerings"] == [{"contrib_id": 7, "txid": "unknown"}]     # the inbox still answers if it lands


def test_status_counts_spendable_notes_and_reports_age(tmp_path, monkeypatch):
    class W:
        wallet_dir = tmp_path / "current" / "wallet"

        def spendable_zat(self):
            return 5 * ks.NOTE_ZAT          # the old estimate said 5 notes

        def height(self):
            return 1000
    s = _session(tmp_path, monkeypatch, W(), {"ready": 1, "opened": 1_000_000, "offerings": [{}, {}]})
    monkeypatch.setattr(ks, "spendable_note_values", lambda db, tip: [ks.NOTE_ZAT, ks.NOTE_ZAT])   # really 2
    st = s.status(now=1_000_000 + 70 * 3600)
    assert st["notes_left"] == 2 and st["offerings"] == 2 and st["ready"]
    assert st["age_hours"] == 70.0 and st["opened_utc"] == "1970-01-12 13:46"
    assert "session close" in st["warning"]
    assert "warning" not in s.status(now=1_000_000 + 3600)


class FakePool:
    def __init__(self, tmp_path, fail_send=False, spendable=10**9):
        self.wallet_dir, self.fail_send, self.spendable = tmp_path / "pool", fail_send, spendable

    def sync(self):
        pass

    def height(self):
        return 100

    def spendable_zat(self):
        return self.spendable

    def send(self, address, zat):
        if self.fail_send:
            raise DevtoolError("devtool send exit 1: transport error")
        return "cd" * 32


class FakeSessionWallet:
    def __init__(self, wallet_dir):
        self.wallet_dir = wallet_dir

    def init(self, name, birthday=None):
        self.wallet_dir.mkdir(parents=True, exist_ok=True)
        (self.wallet_dir / "data.sqlite").write_bytes(b"wallet")

    def default_address(self):
        return "utest1session"

    def sync(self):
        pass

    def spendable_zat(self):
        return 0


@pytest.fixture
def sessions_dir(tmp_path, monkeypatch):
    d = tmp_path / "kiosk"
    monkeypatch.setattr(ks, "SESSIONS_DIR", d)
    monkeypatch.setattr(ks.Session, "wallet", property(lambda self: FakeSessionWallet(self.dir / "wallet")))
    return d


def test_open_that_fails_before_funding_wipes_itself(tmp_path, sessions_dir):
    with pytest.raises(DevtoolError) as e:
        ks.Session.open(FakePool(tmp_path, spendable=5), notes=3, log=lambda *_: None)
    assert "Nothing was sent" in str(e.value) and "session open" in str(e.value)
    assert ks.Session.current() is None and not (sessions_dir / "current").exists()


def test_open_whose_funding_send_failed_is_kept_and_says_how_to_recover(tmp_path, sessions_dir):
    with pytest.raises(DevtoolError) as e:
        ks.Session.open(FakePool(tmp_path, fail_send=True), notes=3, log=lambda *_: None)
    msg = str(e.value)
    assert "Funding status unknown" in msg and "--resume" in msg and "session close" in msg
    s = ks.Session.current()
    assert s is not None and s.state()["funding"] == "unknown" and "ready" not in s.state()


def test_open_that_fails_after_funding_keeps_the_wallet(tmp_path, sessions_dir, monkeypatch):
    monkeypatch.setattr(ks.Session, "_wait_spendable", lambda self, *a: (_ for _ in ()).throw(
        DevtoolError("funds did not become spendable in time")))
    logs = []
    with pytest.raises(DevtoolError) as e:
        ks.Session.open(FakePool(tmp_path), notes=3, log=logs.append)
    assert "cd" * 32 in str(e.value) and "--resume" in str(e.value)
    assert any("funding sent: txid " + "cd" * 32 in m for m in logs)      # printed right after the send
    st = ks.Session.current().state()
    assert st["fund_txid"] == "cd" * 32 and st["open_failed"] and "ready" not in st


def test_resume_finishes_a_half_open_session(tmp_path, sessions_dir, monkeypatch):
    d = sessions_dir / "current"
    d.mkdir(parents=True)
    (d / "state.json").write_text(json.dumps({"opened": int(time.time()), "notes": 4, "offerings": [],
                                              "fund_txid": "cd" * 32, "open_failed": "timeout"}))
    seen = []
    monkeypatch.setattr(ks, "ensure_pool", lambda wallet, notes, log, wait_minutes: seen.append(notes) or notes)
    ks.Session.current().resume(log=lambda *_: None)
    st = ks.Session.current().state()
    assert seen == [4] and "ready" in st and not st["open_failed"]


def test_cli_open_refuses_over_a_half_open_session(tmp_path, sessions_dir, monkeypatch):
    d = sessions_dir / "current"
    d.mkdir(parents=True)
    (d / "state.json").write_text(json.dumps({"opened": 1, "notes": 4, "fund_txid": "cd" * 32}))
    monkeypatch.setattr(cli, "Session", ks.Session)
    monkeypatch.setenv("LWD_CONNECTION", "tor")
    with pytest.raises(SystemExit) as e:
        cli.main(["session", "open", "--connection", "tor"])
    assert "--resume" in str(e.value.code) and "session close" in str(e.value.code)
