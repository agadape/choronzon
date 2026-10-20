"""Text-safe forms of v1 memos, for phone wallets that treat every ZIP-321 memo as text.

Phone test T3 (Zingo, testnet) showed a binary memo re-encoded byte-by-byte as UTF-8 (0xFF -> C3 BF).
Two text forms fix that; both are protocol markers, not the brand:

  GC1:<base64url(binary memo), no padding>   contributions from phones. 508 chars => 381 binary bytes per memo.
  GC1R:<contrib_id in decimal>:<text>        replies TO phones, shown by the wallet as readable text.

normalize_memo() accepts every form a renderer can meet: raw binary, the GC1: envelope, and UTF-8-mangled binary.
"""
from __future__ import annotations

import base64
import binascii
from dataclasses import dataclass

from . import memo as wire

ASCII_PREFIX = b"GC1:"
REPLY_TEXT_PREFIX = b"GC1R:"
ASCII_BINARY_CAP = (wire.MEMO_SIZE - len(ASCII_PREFIX)) * 3 // 4  # 381
_MAX_U32 = 2**32 - 1


@dataclass(frozen=True)
class TextReply:
    contrib_id: int
    text: str


def to_ascii_memo(binary_memo: bytes) -> bytes:
    out = ASCII_PREFIX + base64.urlsafe_b64encode(binary_memo).rstrip(b"=")
    if len(out) > wire.MEMO_SIZE:
        raise wire.ProtocolError(wire.ProtocolError.TOO_LONG, f"envelope is {len(out)} chars")
    return out


def encode_contribution_ascii(data: bytes, codec: int, reply_addr: str | None = None,
                              contrib_id: int | None = None) -> tuple[int, list[bytes]]:
    """Contribution memos as all-ASCII text (for ZIP-321 QR codes scanned by phone wallets)."""
    cid, memos = wire.encode_contribution(data, codec, reply_addr, contrib_id,
                                          body_cap=ASCII_BINARY_CAP - wire.HEADER_SIZE)
    return cid, [to_ascii_memo(m) for m in memos]


def normalize_memo(raw: bytes) -> bytes:
    """Return the binary v1 memo whatever form it arrived in. Raises ProtocolError(not-protocol) otherwise."""
    if raw.startswith(ASCII_PREFIX):
        text = raw.rstrip(b"\0")[len(ASCII_PREFIX):]
        try:
            return base64.b64decode(text + b"=" * (-len(text) % 4), altchars=b"-_", validate=True)
        except binascii.Error as e:
            raise wire.ProtocolError(wire.ProtocolError.NOT_PROTOCOL, f"bad envelope: {e}") from None
    if raw[:1] == bytes([wire.ZIP302_ARBITRARY]):
        return raw
    if raw[:2] == b"\xc3\xbf":  # UTF-8 of 0xFF: binary memo that a wallet re-encoded as text
        try:
            return raw.rstrip(b"\0").decode("utf-8").encode("latin-1")
        except (UnicodeDecodeError, UnicodeEncodeError):
            pass
    raise wire.ProtocolError(wire.ProtocolError.NOT_PROTOCOL)


def encode_reply_text(contrib_id: int, text: str) -> bytes:
    """Human-readable reply for a phone wallet: GC1R:<contrib_id>:<text> (UTF-8, <= 512 bytes)."""
    if not 0 <= contrib_id <= _MAX_U32:
        raise ValueError("contrib_id must be a u32")
    if "\0" in text:
        raise ValueError("text must not contain NUL (wallets trim trailing zero bytes)")
    out = REPLY_TEXT_PREFIX + f"{contrib_id}:{text}".encode("utf-8")
    if len(out) > wire.MEMO_SIZE:
        raise wire.ProtocolError(wire.ProtocolError.TOO_LONG, f"reply is {len(out)} bytes")
    return out


def decode_reply_text(raw: bytes) -> TextReply:
    if not raw.startswith(REPLY_TEXT_PREFIX):
        raise wire.ProtocolError(wire.ProtocolError.NOT_PROTOCOL)
    cid_part, sep, text = raw.rstrip(b"\0")[len(REPLY_TEXT_PREFIX):].partition(b":")
    canonical = cid_part.isdigit() and (cid_part == b"0" or not cid_part.startswith(b"0"))
    if not sep or not canonical or int(cid_part) > _MAX_U32:
        raise wire.ProtocolError(wire.ProtocolError.MALFORMED, "bad contrib_id in text reply")
    try:
        return TextReply(int(cid_part), text.decode("utf-8"))
    except UnicodeDecodeError:
        raise wire.ProtocolError(wire.ProtocolError.MALFORMED, "text reply is not UTF-8") from None


def decode_any_reply(raw: bytes) -> wire.Reply:
    """Decode a reply in any form: GC1R text, GC1 envelope, raw binary, or UTF-8-mangled binary."""
    if raw.startswith(REPLY_TEXT_PREFIX):
        r = decode_reply_text(raw)
        return wire.Reply(r.contrib_id, wire.CODEC_TEXT, r.text.encode("utf-8"))
    return wire.decode_reply(normalize_memo(raw))
