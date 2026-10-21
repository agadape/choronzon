"""Renderer unit tests against a synthetic wallet DB (same tables/columns the renderer reads; no chain needed)."""
import json
import sqlite3

import pytest

import protocol
from protocol import address
from renderer import render as rnd
from renderer.__main__ import main
from renderer.score import (REASON_FLAGGED, REASON_OWN_SPEND, REASON_UNSUPPORTED_POOL, build_score,
                            load_skiplist)
from renderer.wallet import NotReady, WalletDB

REPLY = address.bech32m_encode("zutest", [i % 32 for i in range(170)])


def txid(n: int) -> str:
    return f"{n:064x}"


def offering(text: bytes, cid: int = 7, reply: str | None = None) -> bytes:
    return protocol.encode_contribution(text, protocol.CODEC_TEXT, reply, cid)[1][0]


class FakeDecoder:
    """Stands in for bin/c2dec: deterministic bytes derived from the frames, plus a tag to simulate versions."""
    sample_rate = 8000

    def __init__(self, tag: bytes = b"v1"):
        self.tag = tag

    def decode(self, codec, frames):
        return self.tag + bytes(reversed(frames))

    def fingerprint(self):
        return "fake-" + self.tag.decode()


class FakeVoice:
    """Stands in for espeak-ng: deterministic PCM derived from the text."""

    def __init__(self, tag: bytes = b"v1"):
        self.tag = tag

    def speak(self, text):
        return self.tag + text.encode("utf-8") * 4

    def fingerprint(self):
        return "fake-voice-" + self.tag.decode()


def render(db, as_of, decoder=None, skiplist=frozenset(), voice=None):
    return rnd.render(db, as_of, decoder or FakeDecoder(), skiplist, voice or FakeVoice())


def make_wallet(tmp_path, notes, spend_key=False, tip=100, scan_ranges=((0, 101, 10),), name="wallet"):
    """notes: (txid, height, tx_index, output_index, memo|None, is_change[, pool])."""
    d = tmp_path / name
    d.mkdir()
    con = sqlite3.connect(d / "data.sqlite")
    con.executescript("""
        create table accounts (has_spend_key integer);
        create table blocks (height integer);
        create table scan_queue (block_range_start integer, block_range_end integer, priority integer);
        create table transactions (id_tx integer primary key, txid blob, mined_height integer, tx_index integer);
        create table ironwood_received_notes (transaction_id integer, action_index integer, memo blob,
                                              is_change integer);
        create table sapling_received_notes (transaction_id integer, output_index integer, memo blob,
                                             is_change integer);""")
    con.execute("insert into accounts values (?)", (int(spend_key),))
    con.executemany("insert into blocks values (?)", [(h,) for h in range(tip - 2, tip + 1)])
    con.executemany("insert into scan_queue values (?, ?, ?)", scan_ranges)
    ids = {}
    for tx, height, tx_index, out_index, memo, is_change, *pool in notes:
        if tx not in ids:
            ids[tx] = con.execute("insert into transactions (txid, mined_height, tx_index) values (?, ?, ?)",
                                  (bytes.fromhex(tx)[::-1], height, tx_index)).lastrowid
        table = "sapling_received_notes" if pool == ["sapling"] else "ironwood_received_notes"
        con.execute(f"insert into {table} values (?, ?, ?, ?)", (ids[tx], out_index, memo, is_change))
    con.commit()
    con.close()
    return d


def score_of(wallet_dir, as_of=100, skiplist=frozenset()):
    db = WalletDB(wallet_dir)
    return build_score(db.candidates(as_of), as_of, skiplist)


# --- ordering ------------------------------------------------------------------------------------------------------

def test_canonical_order_is_height_then_tx_index_then_action(tmp_path):
    """Miner order inside a block, not insertion (send) order."""
    w = make_wallet(tmp_path, [(txid(1), 10, 2, 0, offering(b"third"), 0),
                               (txid(2), 10, 1, 1, offering(b"second"), 0),
                               (txid(3), 9, 5, 0, offering(b"first"), 0)])
    assert [o.data for o in score_of(w).offerings] == [b"first", b"second", b"third"]


def test_txids_are_reported_in_display_order(tmp_path):
    w = make_wallet(tmp_path, [(txid(0xABCD), 10, 1, 0, offering(b"x"), 0)])
    assert score_of(w).offerings[0].txid == txid(0xABCD)


# --- validation and skip reasons -----------------------------------------------------------------------------------

def test_every_skip_has_a_reason_code(tmp_path):
    corrupt = bytearray(offering(b"corrupted"))
    corrupt[14] ^= 1
    w = make_wallet(tmp_path, [
        (txid(1), 10, 1, 0, b"ZECATHON-SPIKE order#42", 0),        # someone else's text memo
        (txid(2), 10, 2, 0, offering(b"conductor line"), 1),        # choir's own spend
        (txid(3), 10, 3, 0, bytes(corrupt), 0),
        (txid(4), 10, 4, 0, offering(b"flag me"), 0),
        (txid(5), 10, 5, 0, offering(b"other pool"), 0, "sapling"),
        (txid(6), 10, 6, 0, b"\xf6", 0),                            # ZIP-302 empty memo only
        (txid(7), 10, 7, 0, offering(b"kept"), 0),
    ])
    s = score_of(w, skiplist=frozenset({txid(4)}))
    assert [o.data for o in s.offerings] == [b"kept"]
    assert {sk.txid: sk.reason for sk in s.skipped} == {
        txid(1): "not-protocol", txid(2): REASON_OWN_SPEND, txid(3): "crc-mismatch",
        txid(4): REASON_FLAGGED, txid(5): REASON_UNSUPPORTED_POOL, txid(6): "not-protocol"}


def conductor_memo(text: bytes, cid: int = 9) -> bytes:
    return protocol.encode_conductor(text, protocol.CODEC_TEXT, cid)[1][0]


def test_conductor_lines_are_authenticated_by_own_spend(tmp_path):
    """S13: the god's voice = kind 3 on outputs that spent the choir's own notes; the same memo inbound is a forgery."""
    w = make_wallet(tmp_path, [(txid(1), 10, 1, 0, conductor_memo(b"we are many"), 1),   # own spend -> the god
                               (txid(2), 10, 2, 0, conductor_memo(b"i am the god"), 0),   # inbound -> NOT THE GOD
                               (txid(3), 10, 3, 0, offering(b"plain"), 1),                # own spend, kind 1 -> skip
                               (txid(4), 10, 4, 0, offering(b"plain"), 0)])               # ordinary offering
    s = score_of(w)
    assert [(o.txid, o.conductor, o.data) for o in s.offerings] == [(txid(1), True, b"we are many"),
                                                                     (txid(4), False, b"plain")]
    assert {sk.txid: sk.reason for sk in s.skipped} == {txid(2): "forged-conductor", txid(3): REASON_OWN_SPEND}
    assert s.offerings[0].to_json()["conductor"] is True and "conductor" not in s.offerings[1].to_json()


def test_contrib_id_collision_across_txs_keeps_both(tmp_path):
    w = make_wallet(tmp_path, [(txid(1), 10, 1, 0, offering(b"one", cid=42), 0),
                               (txid(2), 10, 2, 0, offering(b"two", cid=42), 0)])
    assert [(o.contrib_id, o.data) for o in score_of(w).offerings] == [(42, b"one"), (42, b"two")]


def test_multi_memo_offering_and_empty_memo_outputs(tmp_path):
    _, memos = protocol.encode_contribution(bytes(1200), protocol.CODEC_C2_700C, None, 9)
    rows = [(txid(1), 10, 1, i, m.rstrip(b"\0"), 0) for i, m in enumerate(reversed(memos))]
    rows.append((txid(1), 10, 1, 3, b"\xf6", 0))
    o = score_of(make_wallet(tmp_path, rows)).offerings[0]
    assert (o.data, o.memo_count) == (bytes(1200), 4)
    assert all(len(m) == protocol.MEMO_SIZE for m in o.raw_memos)


def test_reply_address_reported_as_flag_only(tmp_path):
    w = make_wallet(tmp_path, [(txid(1), 10, 1, 0, offering(b"a", reply=REPLY), 0),
                               (txid(2), 10, 2, 0, offering(b"b"), 0)])
    assert [o.to_json()["has_reply"] for o in score_of(w).offerings] == [True, False]


# --- readiness, height, keys ---------------------------------------------------------------------------------------

def test_missing_memo_fails_closed(tmp_path):
    w = make_wallet(tmp_path, [(txid(1), 10, 1, 0, None, 0)])
    with pytest.raises(NotReady):
        score_of(w)


def test_missing_memo_on_own_spend_is_fine(tmp_path):
    """A spend-key wallet keeps its own self-send memo in sent_notes; the tx is skipped anyway."""
    w = make_wallet(tmp_path, [(txid(1), 10, 1, 0, None, 1), (txid(2), 10, 2, 0, offering(b"x"), 0)])
    s = score_of(w)
    assert len(s.offerings) == 1 and s.skipped[0].reason == REASON_OWN_SPEND


def test_scanned_height_stops_before_an_unscanned_range(tmp_path):
    gap = make_wallet(tmp_path, [], tip=100, scan_ranges=((0, 90, 10), (90, 95, 50), (95, 101, 10)), name="gap")
    full = make_wallet(tmp_path, [], tip=100, name="full")
    assert WalletDB(gap).scanned_height() == 89
    assert WalletDB(full).scanned_height() == 100


def test_view_only_detection(tmp_path):
    assert not WalletDB(make_wallet(tmp_path, [], spend_key=False, name="v")).has_spend_key()
    assert WalletDB(make_wallet(tmp_path, [], spend_key=True, name="b")).has_spend_key()


def test_cli_refuses_a_wallet_with_a_spending_key(tmp_path):
    w = make_wallet(tmp_path, [], spend_key=True)
    with pytest.raises(SystemExit) as e:
        main(["once", "--wallet", str(w), "--out", ""])
    assert "spending key" in str(e.value)


# --- hashes -------------------------------------------------------------------------------------------------------

def _audio_wallet(tmp_path):
    _, (memo,) = protocol.encode_contribution(b"\x01\x02\x03frames", protocol.CODEC_C2_700C, None, 5)
    return make_wallet(tmp_path, [(txid(1), 10, 1, 0, memo, 0), (txid(2), 20, 1, 0, offering(b"later"), 0)])


def test_score_hash_ignores_decoder_and_voice_render_hash_does_not(tmp_path):
    db = WalletDB(_audio_wallet(tmp_path))
    a = render(db, 100, FakeDecoder(b"v1"), voice=FakeVoice(b"v1"))
    b = render(db, 100, FakeDecoder(b"v2"), voice=FakeVoice(b"v1"))
    c = render(db, 100, FakeDecoder(b"v1"), voice=FakeVoice(b"v2"))
    assert a.score_hash == b.score_hash == c.score_hash
    assert len({a.render_hash, b.render_hash, c.render_hash}) == 3


def test_as_of_is_explicit_and_part_of_the_hash(tmp_path):
    db = WalletDB(_audio_wallet(tmp_path))
    early, late = render(db, 15), render(db, 100)
    assert len(early.score.offerings) == 1 and len(late.score.offerings) == 2
    assert render(db, 16).score_hash != early.score_hash  # same offerings, different height


def test_flagging_changes_the_score_and_lists_the_tx(tmp_path):
    db = WalletDB(_audio_wallet(tmp_path))
    plain, flagged = render(db, 100), render(db, 100, skiplist=frozenset({txid(2)}))
    assert plain.score_hash != flagged.score_hash
    assert flagged.score.to_json()["skipped"] == [{"tx": txid(2), "height": 20, "tx_index": 1,
                                                    "reason": REASON_FLAGGED}]


def test_outputs_are_deterministic_and_hold_no_content_or_addresses(tmp_path):
    w = make_wallet(tmp_path, [(txid(1), 10, 1, 0, offering(b"my secret words", reply=REPLY), 0)])
    db = WalletDB(w)
    for out in ("o1", "o2"):
        rnd.write_outputs(render(db, 100), tmp_path / out)
    one, two = (tmp_path / "o1" / "score.json").read_bytes(), (tmp_path / "o2" / "score.json").read_bytes()
    assert one == two
    assert (tmp_path / "o1" / "mix.wav").read_bytes() == (tmp_path / "o2" / "mix.wav").read_bytes()
    assert b"my secret words" not in one and REPLY.encode() not in one and b"zutest" not in one
    doc = json.loads(one)
    assert doc["score"]["offerings"][0]["has_reply"] is True
    assert doc["render"]["timeline"][0]["tx"] == txid(1) and doc["render"]["composer"] == "choir/2"
    assert (tmp_path / "o1" / "render_hash").read_text().strip() == doc["render_hash"]


# --- skip-list file ---------------------------------------------------------------------------------------------

def test_skiplist_file(tmp_path):
    f = tmp_path / "skiplist.txt"
    f.write_text(f"# header\n{txid(1).upper()}  # reason\n\n   \n{txid(2)}\n")
    assert load_skiplist(f) == frozenset({txid(1), txid(2)})
    assert load_skiplist(tmp_path / "missing.txt") == frozenset()
    f.write_text("not-a-txid\n")
    with pytest.raises(ValueError):
        load_skiplist(f)
