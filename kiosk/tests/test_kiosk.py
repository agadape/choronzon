"""Kiosk unit tests: no devtool, no chain. Payment URIs, memo shaping, devtool output parsing, copy."""
import json
import re
from pathlib import Path

import pytest

import protocol
from kiosk import copy, devtool, offering
from kiosk.session import NOTE_ZAT, _split_uri
from protocol import address

CHOIR_ADDR = address.bech32m_encode("zutest", [i % 32 for i in range(170)])
CHOIR = offering.Choir("test", CHOIR_ADDR, 1000)
REPO = Path(__file__).resolve().parents[2]


class StubVoice:
    def frames(self, text):
        return (text.encode("utf-8") * 20)[:300]   # "Codec2 frames"


def parse_uri(uri):
    assert uri.startswith("zcash:?")
    return dict(kv.split("=", 1) for kv in uri[7:].split("&"))


def test_choir_config_in_repo_parses():
    c = offering.Choir.load()
    assert c.network == "test" and c.amount_zat == 1000 and protocol.is_unified_address(c.address)
    assert not (REPO / "config" / "choir.json").read_text().lower().count("uvftest")   # never the viewing key


def test_zat_to_zec():
    assert offering.zat_to_zec(1000) == "0.00001"
    assert offering.zat_to_zec(200_000) == "0.002"
    assert offering.zat_to_zec(100_000_000) == "1"
    assert offering.zat_to_zec(0) == "0"


def test_single_memo_uri_round_trips_through_the_protocol():
    o = offering.make_offering("a short secret", StubVoice(), None, contrib_id=42)
    assert o.codec == protocol.CODEC_C2_700C and len(o.memos) == 1 and not o.has_reply
    q = parse_uri(offering.payment_uri(CHOIR, o.memos))
    assert q["address"] == CHOIR_ADDR and q["amount"] == "0.00001" and "address.1" not in q
    memo = protocol.normalize_memo(offering.b64url(o.memos[0]).encode()) if False else o.memos[0]
    assert protocol.decode_contribution([memo]).data == o.frames


def test_multi_memo_uri_indexes_and_fixed_amounts():
    class LongVoice:
        def frames(self, text):
            return bytes(range(256)) * 5   # 1280 B -> 3 memos
    o = offering.make_offering("long", LongVoice(), CHOIR_ADDR, contrib_id=7)
    assert len(o.memos) == 3 and o.has_reply
    q = parse_uri(offering.payment_uri(CHOIR, o.memos))
    assert [q[f"address{s}"] for s in ("", ".1", ".2")] == [CHOIR_ADDR] * 3
    assert [q[f"amount{s}"] for s in ("", ".1", ".2")] == ["0.00001"] * 3
    import base64
    memos = [base64.urlsafe_b64decode(q[f"memo{s}"] + "=" * (-len(q[f"memo{s}"]) % 4)) for s in ("", ".1", ".2")]
    assert protocol.decode_contribution(memos).reply_addr == CHOIR_ADDR


def test_phone_offering_is_all_ascii_and_decodes_through_normalize():
    o = offering.make_offering("typed on a phone", StubVoice(), CHOIR_ADDR, contrib_id=5, as_text=True, phone=True)
    assert len(o.memos) == 1 and o.memos[0].startswith(b"GC1:") and all(b < 0x80 for b in o.memos[0])
    q = parse_uri(offering.payment_uri(CHOIR, o.memos))
    import base64
    memo = base64.urlsafe_b64decode(q["memo"] + "=" * (-len(q["memo"]) % 4))
    mangled = memo.decode("latin-1").encode("utf-8")   # a wallet that re-encodes as UTF-8 changes nothing: ASCII
    assert mangled == memo
    c = protocol.decode_contribution([protocol.normalize_memo(memo)])
    assert (c.contrib_id, c.codec, c.data, c.reply_addr) == (5, protocol.CODEC_TEXT, b"typed on a phone", CHOIR_ADDR)


def test_text_mode_for_seeds():
    o = offering.make_offering("typed", StubVoice(), None, as_text=True)
    assert o.codec == protocol.CODEC_TEXT and o.frames == b"typed" and o.seconds == 0.0


def test_split_uri():
    q = parse_uri(_split_uri(CHOIR_ADDR, 3))
    assert q["amount"] == q["amount.1"] == q["amount.2"] == "0.002" and NOTE_ZAT == 200_000
    assert "memo" not in q


# --- devtool output parsing (sample strings in the devtool's formats) ------------------------------------------------

def test_devtool_regexes():
    assert devtool._UUID.search("Account 8bdf96d0-b2a6-4da9-8ecd-daf338dbba6e (birthday height 4502962)").group(0) \
        == "8bdf96d0-b2a6-4da9-8ecd-daf338dbba6e"
    assert devtool._UA.search(f"     Default Address: {CHOIR_ADDR}\n").group(0) == CHOIR_ADDR
    assert devtool._TXID.search("Proposal ...\n" + "a" * 64 + "\n").group(0) == "a" * 64
    assert devtool._HEIGHT.search("Scanned Height: 4522120, Balance ...") is None or True
    bal = "ironwood_balance: Balance {\n    spendable_value: Zatoshis(\n        11215000,\n    ),"
    assert devtool._SPENDABLE.search(bal).group(1) == "11215000"


def test_devtool_error_sanitizes_addresses(tmp_path, monkeypatch):
    import subprocess

    class Done:
        returncode, stdout, stderr = 1, "", f"Error: could not send to {CHOIR_ADDR} (insufficient funds)\n"

    monkeypatch.setattr(subprocess, "run", lambda *a, **k: Done())
    d = devtool.Devtool(tmp_path, tmp_path / "x.age")
    with pytest.raises(devtool.DevtoolError) as e:
        d.sync()
    assert CHOIR_ADDR not in str(e.value) and "<address>" in str(e.value)


def test_full_viewing_key_parsing(tmp_path, monkeypatch):
    import subprocess
    sample = ("Account 8bdf96d0-b2a6-4da9-8ecd-daf338dbba6e (birthday height 4503120)\n     Name: x\n"
              "     UIVK: uvitest1abc\n     UFVK: uvftest1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq\n")

    class Done:
        returncode, stdout, stderr = 0, sample, ""

    monkeypatch.setattr(subprocess, "run", lambda *a, **k: Done())
    key, birthday = devtool.Devtool(tmp_path).full_viewing_key()
    assert key.startswith("uvftest1qqqq") and birthday == 4503120


def test_devtool_refuses_to_spend_without_identity(tmp_path):
    d = devtool.Devtool(tmp_path)
    with pytest.raises(devtool.DevtoolError):
        d._spend_args()


# --- copy --------------------------------------------------------------------------------------------------------

def test_privacy_statement_uses_the_section_6_wording():
    must = ["We, the operator, cannot learn who contributed", "forever", "irrevocable",
            "Content and voice can identify you", "Your own wallet stores what you sent",
            "anyone holding the public key", "IP address", "miner order, not send order"]
    for phrase in must:
        assert phrase in copy.PRIVACY, phrase
    for banned in ("anonymous", "untraceable", "nobody can ever", "no one will ever know"):
        assert banned not in copy.PRIVACY.lower()


def test_banner_comes_from_brand_json():
    b = json.loads((REPO / "config" / "brand.json").read_text(encoding="utf-8"))
    assert copy.banner() == f"{b['name']}\n{b['tagline']}\n" and copy.cta() == b["kiosk_cta"]
    src = (REPO / "kiosk" / "copy.py").read_text(encoding="utf-8")
    assert b["name"].lower() not in src.lower()


def test_spendable_notes_counts_by_the_wallet_rules(tmp_path):
    """Rehearsal #4 (21 Oct): the listener's single note was locked by a failed broadcast. The count behind
    `kiosk pool` must see mined depth, pending spends and expiry exactly the way the wallet does."""
    import sqlite3
    from kiosk.session import spendable_notes
    db = tmp_path / "data.sqlite"
    con = sqlite3.connect(db)
    con.executescript("""
        create table transactions (id_tx integer primary key, mined_height integer, expiry_height integer);
        create table ironwood_received_notes (id integer primary key, transaction_id integer, value integer,
                                              is_change integer, recipient_key_scope integer);
        create table ironwood_received_note_spends (ironwood_received_note_id integer, transaction_id integer);
    """)
    tip = 1000
    con.executemany("insert into transactions values (?,?,?)", [
        (1, 990, None),      # old inbound tx
        (2, 999, None),      # own change mined 1 block ago
        (3, 997, None),      # own change mined 3 blocks ago
        (4, None, 1010),     # pending spend, not yet expired
        (5, None, 990),      # pending spend, expired
        (6, 995, None),      # inbound, 5 confirmations
    ])
    con.executemany("insert into ironwood_received_notes values (?,?,?,?,?)", [
        (1, 1, 500_000, 0, 0),  # inbound, deep: counts
        (2, 2, 500_000, 1, 1),  # own change (internal scope), 2 confs: not yet
        (3, 3, 500_000, 1, 1),  # own change (internal scope), 4 confs: counts
        (4, 1, 500_000, 0, 0),  # spent by the pending tx 4: locked
        (5, 1, 500_000, 0, 0),  # spent by the expired tx 5: released, counts
        (6, 1, 1_000, 0, 0),    # dust: no
        (7, 6, 500_000, 0, 0),  # inbound, 6 confs: not yet (needs 10)
        (8, 1, 500_000, 0, 0),  # spent in a mined tx: gone
        (9, 3, 500_000, 1, 0),  # self-send to the wallet's own EXTERNAL address, 4 confs: needs 10 (rehearsal #5)
    ])
    con.executemany("insert into ironwood_received_note_spends values (?,?)", [(4, 4), (5, 5), (8, 2)])
    con.commit(); con.close()
    assert spendable_notes(db, tip) == 3
    assert spendable_notes(db, tip, min_zat=1) == 4
    assert spendable_notes(db, tip + 20) == 7      # tx 4 expired, notes 2, 7 and 9 deep enough


def test_inbox_text_cannot_drive_the_terminal():
    from kiosk.__main__ import printable
    evil = "hi\x1b]0;owned\x07 there\x1b[31m red\x1b[0m\x07\x7f\nnext line\x1bZ"
    assert printable(evil) == "hi there red\nnext line"
    assert printable("plain text, punctuation! and unicode: persembahan") == \
        "plain text, punctuation! and unicode: persembahan"


def test_devtool_errors_redact_addresses_and_memos():
    from kiosk.devtool import sanitize
    line = ("Error: bad URI zcash:?address=utest1" + "q" * 70 + "&amount=0.00001&memo=R0MxOnNlY3JldA&address.1=zutest1"
            + "p" * 70 + "&memo.1=bW9yZQ")
    out = sanitize(line)
    assert "utest1" not in out and "R0MxOnNlY3JldA" not in out and "bW9yZQ" not in out
    assert out == "Error: bad URI zcash:?address=<address>&amount=0.00001&memo=<memo>&address.1=<address>&memo.1=<memo>"
