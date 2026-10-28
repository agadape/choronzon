"""Binary memo wire format v1. Canonical: this is what is already on testnet (ported from research/spikes/wb_protocol.py).

Every memo is 512 bytes on chain. ZIP-302: first byte 0xFF => arbitrary data.

Header (12 bytes, big-endian):
  0   1  0xFF        ZIP-302 arbitrary-data marker
  1   1  'G' (0x47)  protocol magic (a protocol marker, not a brand; changing it is a version bump)
  2   1  version     = 1
  3   4  contrib_id  random u32 chosen by the sender; not derived from any key or identity
  7   1  kind        1 = contribution chunk, 2 = reply
  8   1  seq         chunk index, 0-based
  9   1  total       chunks in this contribution, 1..3
  10  2  len         body length in THIS memo, <= 500

Contribution (kind=1): stream = [codec:1][data...] split across chunks; the last chunk ends with
  [reply_len:1][reply_addr: ASCII][crc32(stream):4]      reply_len = 0 => no reply address.
  The CRC covers the stream only; the reply address is checked by its own Bech32m checksum.
Reply (kind=2): one memo sent straight to the reply address: [codec:1][data...][crc32(codec+data):4].

Wallets trim trailing zero bytes from stored memos, so every reader zero-pads back to 512 before parsing.
(The spike decoder did not, and dropped ~1/256 contributions: those whose CRC ends in 0x00.)
"""
from __future__ import annotations

import secrets
import struct
import zlib
from dataclasses import dataclass
from typing import Iterable

from . import address

MEMO_SIZE = 512
HEADER_SIZE = 12
MAX_BODY = MEMO_SIZE - HEADER_SIZE  # 500
MAX_CHUNKS = 3
ZIP302_ARBITRARY = 0xFF
MAGIC = 0x47
VERSION = 1

KIND_CONTRIBUTION = 1
KIND_REPLY = 2
KIND_CONDUCTOR = 3   # the god's own voice: same body as a contribution, valid only on the choir wallet's own spends
KINDS = frozenset({KIND_CONTRIBUTION, KIND_REPLY, KIND_CONDUCTOR})

CODEC_C2_700C = 1
CODEC_C2_1200 = 2
CODEC_C2_1300 = 3
CODEC_TEXT = 10
AUDIO_CODECS = {CODEC_C2_700C: "700C", CODEC_C2_1200: "1200", CODEC_C2_1300: "1300"}  # value = c2dec mode
KNOWN_CODECS = frozenset(AUDIO_CODECS) | {CODEC_TEXT}

_HEADER = struct.Struct(">BBBIBBBH")


class ProtocolError(ValueError):
    """Input is not a valid v1 message. `code` is a stable reason code used in logs and in the score."""

    NOT_PROTOCOL = "not-protocol"        # no 0xFF 'G' prefix (someone else's memo, plain text, legacy 0xF5)
    BAD_VERSION = "bad-version"
    BAD_HEADER = "bad-header"            # kind / seq / total out of range
    BAD_LEN = "bad-len"                  # len > 500, memo > 512 bytes, or non-zero bytes after the body
    WRONG_KIND = "wrong-kind"
    MIXED_CHUNKS = "mixed-chunks"        # contrib_id or total differ between chunks
    DUPLICATE_CHUNK = "duplicate-chunk"
    MISSING_CHUNK = "missing-chunk"
    MALFORMED = "malformed"              # body too short to hold codec + reply block + CRC
    CRC_MISMATCH = "crc-mismatch"
    UNKNOWN_CODEC = "unknown-codec"
    TOO_LONG = "too-long"                # encoder: does not fit in 3 memos / 1 reply memo

    def __init__(self, code: str, detail: str = ""):
        super().__init__(f"{code}: {detail}" if detail else code)
        self.code = code


@dataclass(frozen=True)
class Header:
    contrib_id: int
    kind: int
    seq: int
    total: int
    length: int


@dataclass(frozen=True)
class Contribution:
    contrib_id: int
    codec: int
    data: bytes
    reply_addr: str | None       # only set when the embedded address passes its checksum
    reply_present: bool          # a reply block was embedded (reply_len > 0), valid or not
    kind: int = KIND_CONTRIBUTION  # KIND_CONTRIBUTION, or KIND_CONDUCTOR (authenticity is decided by the renderer)

    @property
    def reply_addr_invalid(self) -> bool:
        return self.reply_present and self.reply_addr is None


@dataclass(frozen=True)
class Reply:
    contrib_id: int
    codec: int
    data: bytes


def _header(contrib_id: int, kind: int, seq: int, total: int, length: int) -> bytes:
    return _HEADER.pack(ZIP302_ARBITRARY, MAGIC, VERSION, contrib_id, kind, seq, total, length)


def parse_memo(memo: bytes) -> tuple[Header, bytes]:
    """Validate one binary memo (zero-padded or wallet-trimmed) and return (header, body)."""
    if len(memo) > MEMO_SIZE:
        raise ProtocolError(ProtocolError.BAD_LEN, f"memo is {len(memo)} bytes")
    if len(memo) < 2 or memo[0] != ZIP302_ARBITRARY or memo[1] != MAGIC:
        raise ProtocolError(ProtocolError.NOT_PROTOCOL)
    memo = memo.ljust(MEMO_SIZE, b"\0")  # undo the wallet's trailing-zero trim
    _, _, version, cid, kind, seq, total, length = _HEADER.unpack_from(memo)
    if version != VERSION:
        raise ProtocolError(ProtocolError.BAD_VERSION, str(version))
    if kind not in KINDS or not 0 < total <= MAX_CHUNKS or seq >= total:
        raise ProtocolError(ProtocolError.BAD_HEADER, f"kind={kind} seq={seq} total={total}")
    if length > MAX_BODY:
        raise ProtocolError(ProtocolError.BAD_LEN, str(length))
    end = HEADER_SIZE + length
    if memo[end:].strip(b"\0"):
        raise ProtocolError(ProtocolError.BAD_LEN, "data after the declared body")
    return Header(cid, kind, seq, total, length), memo[HEADER_SIZE:end]


def new_contrib_id() -> int:
    """Random u32 for a new contribution. Sender-side only; renderers never generate randomness."""
    return secrets.randbits(32)


def encode_contribution(data: bytes, codec: int, reply_addr: str | None = None, contrib_id: int | None = None,
                        *, body_cap: int = MAX_BODY, kind: int = KIND_CONTRIBUTION) -> tuple[int, list[bytes]]:
    """Split one contribution into 1..3 memos (each <= 512 bytes; the wallet zero-pads them)."""
    if kind not in (KIND_CONTRIBUTION, KIND_CONDUCTOR):
        raise ProtocolError(ProtocolError.WRONG_KIND, str(kind))
    if codec not in KNOWN_CODECS:
        raise ProtocolError(ProtocolError.UNKNOWN_CODEC, str(codec))
    reply = (reply_addr or "").encode("ascii")
    if reply and not address.is_unified_address(reply_addr):
        raise ValueError("reply address is not a valid unified address")
    if len(reply) > 255:
        raise ValueError("reply address too long for a 1-byte length")
    cid = new_contrib_id() if contrib_id is None else contrib_id
    stream = bytes([codec]) + data
    body = stream + bytes([len(reply)]) + reply + struct.pack(">I", zlib.crc32(stream))
    chunks = [body[i:i + body_cap] for i in range(0, len(body), body_cap)]
    if len(chunks) > MAX_CHUNKS:
        raise ProtocolError(ProtocolError.TOO_LONG, f"needs {len(chunks)} memos, max {MAX_CHUNKS}")
    return cid, [_header(cid, kind, i, len(chunks), len(c)) + c for i, c in enumerate(chunks)]


def encode_conductor(data: bytes, codec: int, contrib_id: int | None = None) -> tuple[int, list[bytes]]:
    """A line in the god's own voice: sent by the choir wallet to itself. No reply address."""
    return encode_contribution(data, codec, None, contrib_id, kind=KIND_CONDUCTOR)


def decode_contribution(memos: Iterable[bytes]) -> Contribution:
    """Reassemble one contribution (or conductor line) from its memos (any order). Raises ProtocolError."""
    parts: dict[int, bytes] = {}
    first: Header | None = None
    for memo in memos:
        header, body = parse_memo(memo)
        if header.kind not in (KIND_CONTRIBUTION, KIND_CONDUCTOR):
            raise ProtocolError(ProtocolError.WRONG_KIND, str(header.kind))
        first = first or header
        if (header.contrib_id, header.total, header.kind) != (first.contrib_id, first.total, first.kind):
            raise ProtocolError(ProtocolError.MIXED_CHUNKS)
        if header.seq in parts:
            raise ProtocolError(ProtocolError.DUPLICATE_CHUNK, str(header.seq))
        parts[header.seq] = body
    if first is None:
        raise ProtocolError(ProtocolError.NOT_PROTOCOL, "no memos")
    if sorted(parts) != list(range(first.total)):
        raise ProtocolError(ProtocolError.MISSING_CHUNK, f"have {sorted(parts)} of {first.total}")
    body = b"".join(parts[i] for i in range(first.total))
    if len(body) < 6:  # codec + reply_len + crc32
        raise ProtocolError(ProtocolError.MALFORMED, f"{len(body)} body bytes")
    crc, rest = struct.unpack(">I", body[-4:])[0], body[:-4]
    # [stream][reply_len][reply] -- reply_len is only known from the end, so try each split; the CRC picks it.
    for reply_len in range(min(255, len(rest) - 2) + 1):
        stream = rest[:len(rest) - 1 - reply_len]
        if rest[len(stream)] == reply_len and zlib.crc32(stream) == crc:
            break
    else:
        raise ProtocolError(ProtocolError.CRC_MISMATCH)
    if stream[0] not in KNOWN_CODECS:
        raise ProtocolError(ProtocolError.UNKNOWN_CODEC, str(stream[0]))
    reply_addr = None
    if reply_len:
        candidate = rest[len(stream) + 1:].decode("ascii", "replace")
        reply_addr = candidate if address.is_unified_address(candidate) else None
    return Contribution(first.contrib_id, stream[0], stream[1:], reply_addr, reply_len > 0, first.kind)


def encode_reply(contrib_id: int, data: bytes, codec: int = CODEC_TEXT) -> bytes:
    """One binary reply memo, sent directly to the contributor's reply address (never to the choir)."""
    if codec not in KNOWN_CODECS:
        raise ProtocolError(ProtocolError.UNKNOWN_CODEC, str(codec))
    stream = bytes([codec]) + data
    body = stream + struct.pack(">I", zlib.crc32(stream))
    if len(body) > MAX_BODY:
        raise ProtocolError(ProtocolError.TOO_LONG, f"reply body {len(body)} > {MAX_BODY}")
    return _header(contrib_id, KIND_REPLY, 0, 1, len(body)) + body


def decode_reply(memo: bytes) -> Reply:
    header, body = parse_memo(memo)
    if header.kind != KIND_REPLY:
        raise ProtocolError(ProtocolError.WRONG_KIND, str(header.kind))
    if header.total != 1:
        raise ProtocolError(ProtocolError.BAD_HEADER, "a reply is a single memo")
    if len(body) < 5:
        raise ProtocolError(ProtocolError.MALFORMED, f"{len(body)} body bytes")
    stream, crc = body[:-4], struct.unpack(">I", body[-4:])[0]
    if zlib.crc32(stream) != crc:
        raise ProtocolError(ProtocolError.CRC_MISMATCH)
    if stream[0] not in KNOWN_CODECS:
        raise ProtocolError(ProtocolError.UNKNOWN_CODEC, str(stream[0]))
    return Reply(header.contrib_id, stream[0], stream[1:])
