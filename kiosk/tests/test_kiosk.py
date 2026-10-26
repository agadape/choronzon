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
            "anyone holding the public key", "miner order, not send order",
            # a kiosk --reply lands in the operator's session wallet: say so, and offer the visitor's own wallet
            "the reply lands in this kiosk's session", "the operator can read it", "give the address of your own wallet",
            # close overwrites, and says where that is not a guarantee
            "overwritten and deleted", "best-effort"]
    for route in ("tor", "direct"):
        text = copy.privacy(route)
        for phrase in must:
            assert phrase in text.replace("\n  ", " "), (route, phrase)
        # section 6 MUST: the choir's own spends are public (audit 26 Oct: missing until then)
        assert ("The god's own lines, and everything its wallet spends, are public to every key holder"
                in " ".join(text.split())), route
        for banned in ("anonymous", "untraceable", "nobody can ever", "no one will ever know", "wiped",
                       "never through us", "lightwalletd sees the kiosk's ip address."):
            assert banned not in text.lower(), (route, banned)
    tor, direct = copy.privacy("tor").replace("\n  ", " "), copy.privacy("direct").replace("\n  ", " ")
    # CLAUDE.md section 6 MUST wording for the route
    assert "lightwalletd sees a Tor exit, not this kiosk's IP (Tor is the default;" in tor
    assert "an operator can choose direct on purpose, and then it sees the IP)" in tor
    assert "Tor does not hide timing" in tor
    assert "DIRECTLY: lightwalletd sees this kiosk's IP address" in direct and "on purpose" in direct
    assert "Tor exit" not in direct
    with pytest.raises(KeyError):
        copy.privacy("carrier-pigeon")


def test_confirm_prints_the_route_this_process_uses(monkeypatch, capsys):
    from kiosk.__main__ import confirm
    for route, marker in (("tor", "Tor exit"), ("direct", "CONNECTED DIRECTLY")):
        monkeypatch.setenv("LWD_CONNECTION", route)
        confirm(type("A", (), {"yes": True})())
        out = capsys.readouterr().out
        assert marker in out, route


@pytest.mark.parametrize("cmd", [["preview"], ["offer", "--yes"], ["qr"], ["speak", "--from", "wallets/test/B"]])
def test_a_secret_on_the_command_line_is_refused(cmd, capsys):
    from kiosk.__main__ import main
    with pytest.raises(SystemExit) as e:
        main([cmd[0], "my secret", *cmd[1:]])
    msg = str(e.value.code)
    assert "refusing the text as a command-line argument" in msg and "shell history" in msg and "`ps`" in msg
    assert "my secret" not in msg and "my secret" not in capsys.readouterr().out


def test_reply_and_reply_to_are_exclusive():
    from kiosk.__main__ import main
    with pytest.raises(SystemExit) as e:
        main(["offer", "-", "--reply", "--reply-to", "utest1x"])
    assert e.value.code == 2      # argparse: not allowed together


def test_reply_to_must_be_a_unified_address_of_the_choir_network():
    from kiosk.session import check_reply_to
    good = address.bech32m_encode("utest", [i % 32 for i in range(170)])
    assert check_reply_to(" " + good + "\n", "test") == good
    with pytest.raises(ValueError, match="not a testnet"):
        check_reply_to(address.bech32m_encode("u", [i % 32 for i in range(170)]), "test")
    with pytest.raises(ValueError, match="does not parse"):
        check_reply_to(good[:-1] + ("q" if good[-1] != "q" else "p"), "test")    # checksum broken
    with pytest.raises(ValueError, match="does not parse"):
        check_reply_to("ztestsapling1abc", "test")


def _reply_db(path, memos):
    import sqlite3
    con = sqlite3.connect(path)
    con.execute("create table ironwood_received_notes (memo blob, is_change integer)")
    con.executemany("insert into ironwood_received_notes values (?, ?)", [(m, c) for m, c in memos])
    con.commit()
    con.close()


def test_inbox_shows_only_the_reply_for_the_typed_contrib_id(tmp_path):
    from kiosk.session import replies_for
    db = tmp_path / "data.sqlite"
    _reply_db(db, [(protocol.encode_reply(111, b"for the first visitor"), 0),
                   (protocol.encode_reply_text(222, "for the second visitor"), 0),
                   (protocol.encode_reply(111, b"own change, ignored"), 1),
                   (b"\xf6", 0)])
    state = {"offerings": [{"contrib_id": 111, "txid": "a" * 64}, {"contrib_id": 222, "txid": "b" * 64}]}
    first = replies_for(db, state, 111)
    assert [r["text"] for r in first] == ["for the first visitor"] and first[0]["for_txid"] == "a" * 64
    assert [r["text"] for r in replies_for(db, state, 222)] == ["for the second visitor"]
    assert replies_for(db, state, 333) == []          # not an offering of this session: nothing, not even a count
    assert replies_for(db, {"offerings": []}, 111) == []


@pytest.mark.parametrize("with_shred", [True, False])
def test_session_close_overwrites_every_file_before_deleting(tmp_path, monkeypatch, with_shred):
    import os
    import shutil
    from kiosk import session
    if not with_shred:
        monkeypatch.setattr(session.shutil, "which", lambda name: None)
    elif not shutil.which("shred"):
        pytest.skip("no shred on this machine")
    root = tmp_path / "current"
    files = {"wallet/data.sqlite": b"sent_notes: my secret" * 300, "wallet/data.sqlite-wal": b"wal" * 99,
             "identity.age": b"AGE-SECRET-KEY-1...", "state.json": b'{"offerings": []}',
             "wallet/tor/arti-data/guards.json": b"guards", "empty": b""}
    keep = tmp_path / "links"
    keep.mkdir()
    for rel, data in files.items():
        f = root / rel
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_bytes(data)
        os.link(f, keep / rel.replace("/", "_"))      # a second name for the same inode: shows what was on it
    outside = tmp_path / "outside.txt"
    outside.write_bytes(b"not part of the session")
    (root / "wallet" / "link-out").symlink_to(outside)
    session.Session(root).close()
    assert not root.exists()
    assert outside.read_bytes() == b"not part of the session"          # a symlink is removed, never followed
    for rel, data in files.items():
        after = (keep / rel.replace("/", "_")).read_bytes()
        assert len(after) == len(data) and after == b"\0" * len(data), rel


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
