"""Binary v1 memo tests. Covers every case in the concept doc's mandatory protocol test list (section 5a)."""
import itertools
import struct
import zlib

import pytest

from protocol import address, memo as wire
from protocol.memo import ProtocolError as PE

REPLY = address.bech32m_encode("zutest", [i % 32 for i in range(170)])  # synthetic, 183 chars like a real R2 UA
CID = 0x8B6C4A28


def pad(m):
    return m.ljust(wire.MEMO_SIZE, b"\0")  # what the chain carries


def trim(m):
    return m.rstrip(b"\0")  # what the wallet DB stores


def code_of(fn, *args):
    with pytest.raises(PE) as e:
        fn(*args)
    return e.value.code


def with_header(m, **changes):
    """Rewrite header fields of an existing memo (to build malformed inputs)."""
    f = dict(zip(("marker", "magic", "version", "cid", "kind", "seq", "total", "len"),
                 struct.unpack(">BBBIBBBH", m[:12])))
    f.update(changes)
    return struct.pack(">BBBIBBBH", *f.values()) + m[12:]


def contribution_memo(stream_codec, data, reply=b"", cid=CID):
    """Hand-built single-memo contribution (lets tests use codecs the encoder refuses)."""
    stream = bytes([stream_codec]) + data
    body = stream + bytes([len(reply)]) + reply + struct.pack(">I", zlib.crc32(stream))
    return struct.pack(">BBBIBBBH", 0xFF, 0x47, 1, cid, 1, 0, 1, len(body)) + body


# --- round trips ------------------------------------------------------------------------------------------------

def test_text_with_reply_round_trip_padded_and_trimmed():
    cid, memos = wire.encode_contribution(b"i never told anyone this", wire.CODEC_TEXT, REPLY, CID)
    assert cid == CID and len(memos) == 1 and len(memos[0]) <= wire.MEMO_SIZE
    for form in (pad, trim):
        c = wire.decode_contribution([form(m) for m in memos])
        assert (c.contrib_id, c.codec, c.data, c.reply_addr, c.reply_present) == \
               (CID, wire.CODEC_TEXT, b"i never told anyone this", REPLY, True)


def test_no_reply_address():
    _, memos = wire.encode_contribution(b"x", wire.CODEC_TEXT)
    c = wire.decode_contribution(memos)
    assert c.reply_addr is None and not c.reply_present and not c.reply_addr_invalid


def test_random_contrib_id_is_u32():
    cids = {wire.encode_contribution(b"x", wire.CODEC_TEXT)[0] for _ in range(20)}
    assert all(0 <= c < 2**32 for c in cids) and len(cids) > 1


def test_audio_round_trip_three_memos_any_order():
    data = bytes(range(256)) * 5  # 1280 B of "Codec2" frames
    _, memos = wire.encode_contribution(data, wire.CODEC_C2_700C, None, CID)
    assert len(memos) == 3
    for perm in itertools.permutations(memos):
        assert wire.decode_contribution(list(perm)).data == data


# --- capacity -----------------------------------------------------------------------------------------------------

def test_empty_payload():
    _, memos = wire.encode_contribution(b"", wire.CODEC_TEXT, None, CID)
    assert wire.decode_contribution(memos).data == b""


def test_max_payload_single_memo():
    one = 500 - 6  # codec + reply_len + crc32 around the data
    _, memos = wire.encode_contribution(b"a" * one, wire.CODEC_TEXT, None, CID)
    assert len(memos) == 1 and len(memos[0]) == wire.MEMO_SIZE
    _, memos = wire.encode_contribution(b"a" * (one + 1), wire.CODEC_TEXT, None, CID)
    assert len(memos) == 2


def test_three_full_memos_and_overflow():
    full = 3 * 500 - 6
    _, memos = wire.encode_contribution(b"\x01" * full, wire.CODEC_C2_700C, None, CID)
    assert [len(m) for m in memos] == [512, 512, 512]
    assert wire.decode_contribution(memos).data == b"\x01" * full
    assert code_of(wire.encode_contribution, b"\x01" * (full + 1), wire.CODEC_C2_700C) == PE.TOO_LONG


# --- wallet trimming / lost bytes ------------------------------------------------------------------------------

def _payload_whose_memo_ends_in_zero():
    for i in range(10_000):
        data = b"secret %d" % i
        _, memos = wire.encode_contribution(data, wire.CODEC_TEXT, None, contrib_id=1)
        if memos[-1][-1] == 0:
            return data, memos
    raise AssertionError("no such payload found")


def test_trimmed_memo_whose_crc_ends_in_zero_still_decodes():
    """Regression: the spike decoder dropped ~1/256 contributions (CRC ending in 0x00, trimmed by the wallet)."""
    data, memos = _payload_whose_memo_ends_in_zero()
    assert wire.decode_contribution([trim(m) for m in memos]).data == data


def test_trimmed_header_of_empty_body_still_parses():
    m = struct.pack(">BBBIBBBH", 0xFF, 0x47, 1, CID, 2, 0, 1, 0)
    header, body = wire.parse_memo(trim(m))
    assert header.length == 0 and body == b""


def test_memo_that_lost_a_real_last_byte_fails():
    _, memos = wire.encode_contribution(b"abc", wire.CODEC_TEXT, None, CID)
    m = memos[0]
    assert m[-1] != 0, "pick a payload whose last byte is non-zero"
    assert code_of(wire.decode_contribution, [m[:-1]]) == PE.CRC_MISMATCH


# --- header and length validation -------------------------------------------------------------------------------

@pytest.fixture
def three():
    return wire.encode_contribution(bytes(1200), wire.CODEC_C2_700C, None, CID)[1]


def test_len_larger_than_data(three):
    m = with_header(three[2], len=struct.unpack(">H", three[2][10:12])[0] + 3)
    assert code_of(wire.decode_contribution, [three[0], three[1], m]) == PE.CRC_MISMATCH


def test_len_smaller_than_data(three):
    m = with_header(three[2], len=struct.unpack(">H", three[2][10:12])[0] - 3)
    assert code_of(wire.decode_contribution, [three[0], three[1], m]) == PE.BAD_LEN


def test_len_over_500_and_memo_over_512(three):
    assert code_of(wire.parse_memo, with_header(three[0], len=501)) == PE.BAD_LEN
    assert code_of(wire.parse_memo, three[0] + b"\1") == PE.BAD_LEN


@pytest.mark.parametrize("seq,total", [(3, 3), (1, 1), (0, 0), (0, 4)])
def test_bad_seq_total(three, seq, total):
    assert code_of(wire.parse_memo, with_header(three[0], seq=seq, total=total)) == PE.BAD_HEADER


def test_total_changes_between_chunks(three):
    assert code_of(wire.decode_contribution, [three[0], with_header(three[1], total=2), three[2]]) == PE.MIXED_CHUNKS


def test_contrib_id_differs_between_chunks(three):
    assert code_of(wire.decode_contribution, [three[0], with_header(three[1], cid=CID + 1), three[2]]) == \
        PE.MIXED_CHUNKS


def test_duplicate_missing_chunks(three):
    assert code_of(wire.decode_contribution, [three[0], three[0], three[1], three[2]]) == PE.DUPLICATE_CHUNK
    assert code_of(wire.decode_contribution, [three[0], three[2]]) == PE.MISSING_CHUNK
    assert code_of(wire.decode_contribution, []) == PE.NOT_PROTOCOL


def test_crc_failure(three):
    corrupt = bytearray(three[1])
    corrupt[100] ^= 1
    assert code_of(wire.decode_contribution, [three[0], bytes(corrupt), three[2]]) == PE.CRC_MISMATCH


def test_too_short_body():
    m = struct.pack(">BBBIBBBH", 0xFF, 0x47, 1, CID, 1, 0, 1, 3) + b"\x0a\x00\x01"
    assert code_of(wire.decode_contribution, [m]) == PE.MALFORMED


# --- unknown version / magic / codec / kind ----------------------------------------------------------------------

def test_unknown_version_and_magic(three):
    assert code_of(wire.parse_memo, with_header(three[0], version=2)) == PE.BAD_VERSION
    assert code_of(wire.parse_memo, with_header(three[0], magic=0x48)) == PE.NOT_PROTOCOL
    assert code_of(wire.parse_memo, with_header(three[0], marker=0xF5)) == PE.NOT_PROTOCOL  # legacy S12 marker
    assert code_of(wire.parse_memo, b"ZECATHON-SPIKE order#42") == PE.NOT_PROTOCOL       # plain text memo
    assert code_of(wire.parse_memo, b"\xf6") == PE.NOT_PROTOCOL                          # ZIP-302 empty memo


def test_unknown_codec():
    assert code_of(wire.decode_contribution, [contribution_memo(99, b"data")]) == PE.UNKNOWN_CODEC
    assert code_of(wire.encode_contribution, b"data", 99) == PE.UNKNOWN_CODEC
    assert code_of(wire.encode_reply, CID, b"data", 99) == PE.UNKNOWN_CODEC


def test_wrong_kind():
    reply = wire.encode_reply(CID, b"hi")
    _, (contrib,) = wire.encode_contribution(b"hi", wire.CODEC_TEXT, None, CID)
    assert code_of(wire.decode_contribution, [reply]) == PE.WRONG_KIND
    assert code_of(wire.decode_reply, contrib) == PE.WRONG_KIND
    assert code_of(wire.parse_memo, with_header(contrib, kind=3)) == PE.BAD_HEADER


# --- reply address integrity (not covered by the CRC in v1) -------------------------------------------------------

def test_corrupted_reply_address_keeps_secret_drops_address():
    m = bytearray(contribution_memo(wire.CODEC_TEXT, b"secret", REPLY.encode()))
    pos = m.index(REPLY.encode()) + 50
    m[pos] = ord("q") if m[pos] != ord("q") else ord("p")
    c = wire.decode_contribution([bytes(m)])
    assert c.data == b"secret" and c.reply_addr is None and c.reply_present and c.reply_addr_invalid


def test_non_ascii_reply_address_is_invalid_not_fatal():
    c = wire.decode_contribution([contribution_memo(wire.CODEC_TEXT, b"secret", b"\xffzutest1abc")])
    assert c.data == b"secret" and c.reply_addr_invalid


def test_encoder_refuses_invalid_reply_address():
    with pytest.raises(ValueError):
        wire.encode_contribution(b"x", wire.CODEC_TEXT, REPLY[:-1] + ("q" if REPLY[-1] != "q" else "p"))


def test_contrib_id_collision_is_not_an_error():
    """Uniqueness is by txid (renderer); two different contributions may share a contrib_id."""
    a = wire.decode_contribution(wire.encode_contribution(b"one", wire.CODEC_TEXT, None, CID)[1])
    b = wire.decode_contribution(wire.encode_contribution(b"two", wire.CODEC_TEXT, None, CID)[1])
    assert a.contrib_id == b.contrib_id and a.data != b.data


# --- binary replies -----------------------------------------------------------------------------------------------

def test_reply_round_trip_and_limits():
    r = wire.encode_reply(CID, b"you are not alone.")
    assert wire.decode_reply(trim(r)) == wire.Reply(CID, wire.CODEC_TEXT, b"you are not alone.")
    assert code_of(wire.encode_reply, CID, b"x" * 496) == PE.TOO_LONG
    assert len(wire.encode_reply(CID, b"x" * 495)) == wire.MEMO_SIZE
    assert code_of(wire.decode_reply, with_header(r, seq=0, total=2)) == PE.BAD_HEADER
    corrupt = bytearray(r)
    corrupt[14] ^= 1
    assert code_of(wire.decode_reply, bytes(corrupt)) == PE.CRC_MISMATCH
