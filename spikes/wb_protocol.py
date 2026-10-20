#!/usr/bin/env python3
"""Whisper Back memo protocol v1 (spike). Pure-Python, no deps.

Memo = 512 bytes. ZIP-302: first byte 0xFF => arbitrary data, reader makes no other assumption.

Common header (12 bytes):
  0   1  0xFF                 ZIP-302 arbitrary-data marker
  1   1  'G'  (0x47)          magic
  2   1  version = 1
  3   4  contrib_id           random u32, generated client-side; not derived from any key/identity
  7   1  kind                 1 = CONTRIBUTION chunk, 2 = REPLY
  8   1  seq                  chunk index (0-based)
  9   1  total                number of chunks in this contribution
  10  2  len                  big-endian length of the body in THIS memo

CONTRIBUTION body (kind=1), chunks 0..total-1:
  chunk data = [codec:1][audio/text bytes...]  on seq 0; raw continuation bytes after.
  The LAST chunk ends with:
    [reply_len:1][reply_addr: reply_len bytes, ASCII]   (reply_len = 0 => no reply destination)
    [crc32:4] over the concatenated contribution data (excluding the reply block)

REPLY body (kind=2), single memo, sent DIRECTLY to the reply address (never to the choir):
  [codec:1][text/audio bytes...][crc32:4]
  contrib_id in the header tells the recipient which of their secrets this answers.
  No sender address, no timestamp, no name: nothing else.

Public vs private (see threat model in ai/whisper-back-spike.md):
  * CONTRIBUTION memos go to the choir wallet whose FULL viewing key is public => everything in them is public,
    including the reply address. The reply address is a diversified address: unlinkable to the sender's other
    addresses without the sender's own keys.
  * REPLY memos go to the sender's diversified address => readable only by the sender's wallet.
"""
import os, struct, zlib, base64, sys, json

MAGIC, VERSION = 0x47, 1
KIND_CONTRIB, KIND_REPLY = 1, 2
MEMO, HDR = 512, 12
CODEC_TEXT, CODEC_C2_700C, CODEC_C2_1200 = 10, 1, 2


def _hdr(cid, kind, seq, total, ln):
    return struct.pack(">BBBIBBBH", 0xFF, MAGIC, VERSION, cid, kind, seq, total, ln)


def _parse_hdr(m):
    if len(m) < HDR or m[0] != 0xFF or m[1] != MAGIC:
        raise ValueError("not a ghost-choir memo")
    _, _, ver, cid, kind, seq, total, ln = struct.unpack(">BBBIBBBH", m[:HDR])
    if ver != VERSION: raise ValueError(f"unknown version {ver}")
    if ln > MEMO - HDR or HDR + ln > len(m) + (MEMO - len(m)): raise ValueError("bad len")
    if seq >= total or total == 0 or total > 3: raise ValueError("bad seq/total")
    return cid, kind, seq, total, ln


def encode_contribution(data: bytes, codec: int, reply_addr: str | None, cid: int | None = None, memo_cap: int = MEMO):
    cid = cid if cid is not None else struct.unpack(">I", os.urandom(4))[0]
    reply = (reply_addr or "").encode("ascii")
    if len(reply) > 255: raise ValueError("reply address too long for 1-byte length")
    stream = bytes([codec]) + data
    tail = bytes([len(reply)]) + reply + struct.pack(">I", zlib.crc32(stream))
    body = stream + tail
    cap = memo_cap - HDR
    chunks = [body[i:i + cap] for i in range(0, len(body), cap)] or [b""]
    if len(chunks) > 3: raise ValueError(f"contribution needs {len(chunks)} memos, max 3")
    memos = [_hdr(cid, KIND_CONTRIB, i, len(chunks), len(c)) + c for i, c in enumerate(chunks)]
    return cid, memos  # each < =512 bytes; wallet zero-pads to 512


def decode_contribution(memos: list[bytes]):
    """memos: raw memo bytes (may be zero-padded to 512 or trimmed). Returns dict or raises."""
    parts = {}
    cid0 = total0 = None
    for m in memos:
        cid, kind, seq, total, ln = _parse_hdr(m)
        if kind != KIND_CONTRIB: raise ValueError("not a contribution memo")
        if cid0 is None: cid0, total0 = cid, total
        if (cid, total) != (cid0, total0): raise ValueError("chunks from different contributions")
        if seq in parts: raise ValueError(f"duplicate chunk {seq}")
        parts[seq] = m[HDR:HDR + ln]
    if sorted(parts) != list(range(total0)): raise ValueError(f"missing chunks: have {sorted(parts)} of {total0}")
    body = b"".join(parts[i] for i in range(total0))
    crc = struct.unpack(">I", body[-4:])[0]
    rest = body[:-4]
    # reply block is right before crc: [reply_len][reply...]
    # find it from the end: we need reply_len; scan backwards is ambiguous, so reply_len is stored as the
    # byte immediately after the stream => stream_len = len(rest) - 1 - reply_len. Try all plausible splits.
    for reply_len in range(0, 256):
        if 1 + reply_len > len(rest): break
        stream = rest[:len(rest) - 1 - reply_len]
        if rest[len(stream)] == reply_len and zlib.crc32(stream) == crc:
            reply = rest[len(stream) + 1:].decode("ascii") if reply_len else None
            return {"contrib_id": cid0, "codec": stream[0], "data": stream[1:], "reply_addr": reply}
    raise ValueError("crc mismatch / malformed reply block")


def encode_reply(cid: int, data: bytes, codec: int = CODEC_TEXT):
    stream = bytes([codec]) + data
    body = stream + struct.pack(">I", zlib.crc32(stream))
    if len(body) > MEMO - HDR: raise ValueError("reply too long")
    return _hdr(cid, KIND_REPLY, 0, 1, len(body)) + body


def decode_reply(m: bytes):
    cid, kind, seq, total, ln = _parse_hdr(m)
    if kind != KIND_REPLY: raise ValueError("not a reply memo")
    body = m[HDR:HDR + ln]
    stream, crc = body[:-4], struct.unpack(">I", body[-4:])[0]
    if zlib.crc32(stream) != crc: raise ValueError("crc mismatch")
    return {"contrib_id": cid, "codec": stream[0], "data": stream[1:]}


def b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


# ---- phone-safe ASCII envelope (added after phone test T3, 2026-10-20) ----
# Mobile wallets sending a ZIP-321 memo treat the bytes as text: every byte >= 0x80 is re-encoded as UTF-8
# (0xFF -> C3 BF). Binary memos therefore arrive mangled (reversible with .decode('utf-8').encode('latin-1'),
# but only if the wallet behaves exactly like that). The robust path for phones is an all-ASCII memo:
#   "GC1:" + base64url(binary memo without padding)      (ASCII < 0xF5 => a valid ZIP-302 text memo)
# Capacity: 508 chars of base64url => 381 binary bytes per memo (vs 512 raw). Renderer accepts both forms.
ASCII_PREFIX = b"GC1:"
ASCII_BIN_CAP = (MEMO - len(ASCII_PREFIX)) * 3 // 4  # 381 binary bytes per ascii memo

def to_ascii_memo(binary_memo: bytes) -> bytes:
    out = ASCII_PREFIX + base64.urlsafe_b64encode(binary_memo).rstrip(b"=")
    if len(out) > MEMO: raise ValueError(f"ascii memo too long ({len(out)} > {MEMO}); shrink payload")
    return out

def normalize_memo(raw: bytes) -> bytes:
    """Return the binary memo whatever form it arrived in: raw binary, ASCII envelope, or UTF-8-mangled binary."""
    m = raw.rstrip(b"\0")
    if m.startswith(ASCII_PREFIX):
        b = m[len(ASCII_PREFIX):]
        return base64.urlsafe_b64decode(b + b"=" * (-len(b) % 4))
    if m[:1] == b"\xff": return m
    if m[:2] == b"\xc3\xbf":  # UTF-8 of 0xFF: a mangled binary memo
        try: return m.decode("utf-8").encode("latin-1")
        except (UnicodeDecodeError, UnicodeEncodeError): pass
    raise ValueError("not a ghost-choir memo")

def encode_contribution_ascii(data: bytes, codec: int, reply_addr, cid=None):
    cid, memos = encode_contribution(data, codec, reply_addr, cid, memo_cap=ASCII_BIN_CAP)
    return cid, [to_ascii_memo(m) for m in memos]


if __name__ == "__main__":
    # self-tests (unit level; NOT proof of on-chain behaviour)
    cid, ms = encode_contribution(b"i never told anyone this", CODEC_TEXT, "zutest1" + "q" * 176)
    assert len(ms) == 1 and len(ms[0]) <= MEMO
    d = decode_contribution([m + b"\0" * (MEMO - len(m)) for m in ms])  # zero-padded like the wallet
    assert d["data"] == b"i never told anyone this" and d["reply_addr"].startswith("zutest1") and d["contrib_id"] == cid
    d2 = decode_contribution([m.rstrip(b"\0") for m in ms])  # trimmed like devtool's DB showed
    assert d2 == d
    cid3, ms3 = encode_contribution(os.urandom(1300), CODEC_C2_700C, None)
    assert len(ms3) == 3 and decode_contribution(ms3[::-1])["data"].__len__() == 1300  # order-independent
    for bad in ([ms3[0], ms3[1]], [ms3[0], ms3[0], ms3[1], ms3[2]]):
        try: decode_contribution(bad); raise SystemExit("should fail")
        except ValueError: pass
    corrupt = bytearray(ms[0]); corrupt[20] ^= 1
    try: decode_contribution([bytes(corrupt)]); raise SystemExit("crc should fail")
    except ValueError: pass
    r = encode_reply(cid, b"you are not alone.")
    assert decode_reply(r) == {"contrib_id": cid, "codec": CODEC_TEXT, "data": b"you are not alone."}
    try: encode_contribution(b"x" * 1600, CODEC_TEXT, None); raise SystemExit("should exceed 3 memos")
    except ValueError: pass
    # ascii envelope + mangled recovery
    cidA, msA = encode_contribution_ascii(b"typed on a phone", CODEC_TEXT, "zutest1" + "q" * 176)
    assert all(b < 0x80 for b in msA[0]) and len(msA[0]) <= MEMO
    assert decode_contribution([normalize_memo(msA[0] + b"\0" * 10)])["contrib_id"] == cidA
    mangled = ms[0].decode("latin-1").encode("utf-8")           # what the phone wallet did in T3
    assert decode_contribution([normalize_memo(mangled)])["contrib_id"] == cid
    assert decode_contribution([normalize_memo(ms[0])])["contrib_id"] == cid
    print("protocol self-tests OK (incl. ascii envelope + mangled recovery)")
    if len(sys.argv) > 1 and sys.argv[1] == "demo":
        print(json.dumps({"contrib_memo_b64url": b64url(ms[0]), "reply_memo_b64url": b64url(r)}, indent=1))
