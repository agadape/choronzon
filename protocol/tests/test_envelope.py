"""Phone-safe forms: GC1: envelope, UTF-8-mangled recovery, GC1R: human-readable replies."""
import pytest

from protocol import address, envelope, memo as wire
from protocol.memo import ProtocolError as PE

REPLY = address.bech32m_encode("zutest", [i % 32 for i in range(170)])
CID = 3510208332


def mangle(m):
    """What Zingo did in phone test T3: every byte re-encoded as UTF-8 text."""
    return m.decode("latin-1").encode("utf-8")


# --- GC1: envelope ------------------------------------------------------------------------------------------------

def test_ascii_envelope_round_trip():
    cid, memos = envelope.encode_contribution_ascii(b"typed on a phone", wire.CODEC_TEXT, REPLY, CID)
    assert all(b < 0x80 for m in memos for b in m) and all(len(m) <= wire.MEMO_SIZE for m in memos)
    assert memos[0].startswith(b"GC1:")
    c = wire.decode_contribution([envelope.normalize_memo(m + b"\0" * 10) for m in memos])
    assert (c.contrib_id, c.data, c.reply_addr) == (CID, b"typed on a phone", REPLY)


def test_ascii_envelope_capacity():
    assert envelope.ASCII_BINARY_CAP == 381
    full = 3 * (381 - 12) - 6
    _, memos = envelope.encode_contribution_ascii(b"\x02" * full, wire.CODEC_C2_700C, None, CID)
    assert [len(m) for m in memos] == [512, 512, 512]
    assert wire.decode_contribution([envelope.normalize_memo(m) for m in memos]).data == b"\x02" * full
    with pytest.raises(PE):
        envelope.encode_contribution_ascii(b"\x02" * (full + 1), wire.CODEC_C2_700C, None, CID)


def test_bad_envelope():
    assert pytest.raises(PE, envelope.normalize_memo, b"GC1:not*base64!").value.code == PE.NOT_PROTOCOL


def test_envelope_of_payload_ending_in_zero():
    for i in range(10_000):
        _, (m,) = wire.encode_contribution(b"secret %d" % i, wire.CODEC_TEXT, None, CID)
        if m[-1] == 0:
            break
    assert wire.decode_contribution([envelope.normalize_memo(envelope.to_ascii_memo(m))]).data == b"secret %d" % i


# --- UTF-8-mangled binary -----------------------------------------------------------------------------------------

def test_mangled_binary_is_recovered():
    _, memos = wire.encode_contribution(b"\xff\x80 binary", wire.CODEC_TEXT, REPLY, CID)
    assert mangle(memos[0])[:2] == b"\xc3\xbf"
    for raw in (mangle(memos[0]), mangle(memos[0]) + b"\0" * 20):
        assert envelope.normalize_memo(raw) == memos[0].rstrip(b"\0")
        assert wire.decode_contribution([envelope.normalize_memo(raw)]).reply_addr == REPLY


def test_raw_binary_passes_through_and_foreign_memos_are_rejected():
    _, (m,) = wire.encode_contribution(b"x", wire.CODEC_TEXT, None, CID)
    assert envelope.normalize_memo(m) == m
    for foreign in (b"ZECATHON-SPIKE order#42", b"\xf5\x00\x01legacy", b"\xf6", b"\xc3\xbf\xff"):
        assert pytest.raises(PE, envelope.normalize_memo, foreign).value.code == PE.NOT_PROTOCOL


# --- GC1R: human-readable replies to phones -------------------------------------------------------------------------

def test_text_reply_round_trip():
    raw = envelope.encode_reply_text(CID, "you are not alone: i kept one too ✶")
    assert raw.startswith(b"GC1R:3510208332:") and raw[0] < 0xF5  # ZIP-302: a text memo, shown as text
    r = envelope.decode_reply_text(raw + b"\0" * 30)
    assert (r.contrib_id, r.text) == (CID, "you are not alone: i kept one too ✶")


def test_text_reply_limits():
    head = len(b"GC1R:%d:" % CID)
    assert len(envelope.encode_reply_text(CID, "x" * (512 - head))) == 512
    assert pytest.raises(PE, envelope.encode_reply_text, CID, "x" * (513 - head)).value.code == PE.TOO_LONG
    with pytest.raises(ValueError):
        envelope.encode_reply_text(CID, "nul\0inside")
    with pytest.raises(ValueError):
        envelope.encode_reply_text(2**32, "too big")


@pytest.mark.parametrize("raw", [b"GC1R:007:leading zeros", b"GC1R:-1:negative", b"GC1R:4294967296:too big",
                                 b"GC1R:12 no colon", b"GC1R::empty id", b"GC1R:12:\xff\xfe not utf8"])
def test_bad_text_replies(raw):
    assert pytest.raises(PE, envelope.decode_reply_text, raw).value.code == PE.MALFORMED


def test_text_reply_prefix_does_not_collide_with_envelope():
    raw = envelope.encode_reply_text(CID, "hi")
    assert not raw.startswith(envelope.ASCII_PREFIX)
    assert pytest.raises(PE, envelope.normalize_memo, raw).value.code == PE.NOT_PROTOCOL


def test_decode_any_reply_accepts_every_form():
    binary = wire.encode_reply(CID, b"hello")
    forms = [envelope.encode_reply_text(CID, "hello"), binary, binary.rstrip(b"\0"), envelope.to_ascii_memo(binary),
             mangle(binary)]
    for raw in forms:
        assert envelope.decode_any_reply(raw) == wire.Reply(CID, wire.CODEC_TEXT, b"hello")
