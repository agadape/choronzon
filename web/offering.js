// "Give it a secret" from the public page: a JS port of the phone path of `python3 -m kiosk qr` (text codec, v1
// header, GC1: envelope, ZIP-321 URI). Everything happens in this browser: the text never leaves it except inside
// the payment request the visitor's own wallet sends. Pure (no DOM, no network); the golden-vector test in
// web/tests/test_offering.py checks that it produces the same URI as kiosk qr, byte for byte.
//
// Wire format (protocol/memo.py, protocol/envelope.py):
//   header (12 B, big-endian): FF 'G' 01 | contrib_id u32 | kind=1 | seq | total | len u16
//   body: [codec=10][UTF-8 text] [reply_len][reply address ASCII] [crc32(codec+text) u32], split into chunks of
//   369 bytes (381 - 12) so that each memo fits the ASCII envelope: "GC1:" + base64url(header+chunk), no padding.
//   ZIP-321: zcash:?address=<choir>&amount=0.00001&memo=<base64url(envelope)>[&address.1=…&amount.1=…&memo.1=…]
(function (root) {
  "use strict";
  const MEMO_SIZE = 512, HEADER_SIZE = 12, ASCII_BINARY_CAP = ((MEMO_SIZE - 4) * 3) >> 2, MAX_CHUNKS = 3;
  const CODEC_TEXT = 10, KIND_CONTRIBUTION = 1;

  // ---- crc32 (zlib) ---------------------------------------------------------------------------------------------
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(bytes) { let c = 0xffffffff; for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

  // ---- bech32m unified-address check (protocol/address.py) -------------------------------------------------------
  const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l", GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  const UA_HRPS = new Set(["u", "zu", "tu", "utest", "zutest", "tutest"]);
  function polymod(values) {
    let chk = 1;
    for (const v of values) { const top = chk >>> 25; chk = (((chk & 0x1ffffff) << 5) ^ v) >>> 0; for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk = (chk ^ GEN[i]) >>> 0; }
    return chk;
  }
  function bech32mDecode(s) {
    if (!s || (s.toLowerCase() !== s && s.toUpperCase() !== s) || [...s].some((c) => c.charCodeAt(0) < 33 || c.charCodeAt(0) > 126)) return null;
    s = s.toLowerCase();
    const pos = s.lastIndexOf("1");
    if (pos < 1 || s.length - pos - 1 < 6) return null;
    const hrp = s.slice(0, pos), rest = s.slice(pos + 1);
    if ([...rest].some((c) => !CHARSET.includes(c))) return null;
    const data = [...rest].map((c) => CHARSET.indexOf(c));
    const exp = [...hrp].map((c) => c.charCodeAt(0) >> 5).concat([0], [...hrp].map((c) => c.charCodeAt(0) & 31));
    if (polymod(exp.concat(data)) !== 0x2bc830a3) return null;
    return { hrp, data: data.slice(0, -6) };
  }
  function isUnifiedAddress(s) { const d = s ? bech32mDecode(s) : null; return !!d && UA_HRPS.has(d.hrp) && d.data.length > 0; }
  // the visitor's own reply address: a unified address of the choir's network (kiosk/session.py check_reply_to)
  function checkReplyTo(address, network) {
    address = (address || "").trim();
    if (!isUnifiedAddress(address)) throw new Error("that address does not parse as a unified address (check it was copied whole)");
    if (bech32mDecode(address).hrp.endsWith("test") !== (network === "test"))
      throw new Error(`that address is not a ${network === "test" ? "testnet" : "mainnet"} address`);
    return address;
  }

  // ---- encoding ------------------------------------------------------------------------------------------------
  const b64url = (bytes) => { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
  const utf8 = (s) => new TextEncoder().encode(s);
  function header(cid, seq, total, len) {
    const h = new Uint8Array(HEADER_SIZE), v = new DataView(h.buffer);
    h[0] = 0xff; h[1] = 0x47; h[2] = 1; v.setUint32(3, cid >>> 0); h[7] = KIND_CONTRIBUTION; h[8] = seq; h[9] = total; v.setUint16(10, len);
    return h;
  }
  // text -> binary memos (each header + chunk, no padding), as protocol.encode_contribution with the envelope's cap
  function encodeText(text, replyAddr, contribId) {
    if (!(Number.isInteger(contribId) && contribId >= 0 && contribId <= 0xffffffff)) throw new Error("contrib_id must be a u32");
    const data = utf8(text), reply = new TextEncoder().encode(replyAddr || "");
    if (reply.length > 255) throw new Error("reply address too long for a 1-byte length");
    const stream = new Uint8Array(1 + data.length); stream[0] = CODEC_TEXT; stream.set(data, 1);
    const crc = crc32(stream);
    const body = new Uint8Array(stream.length + 1 + reply.length + 4);
    body.set(stream, 0); body[stream.length] = reply.length; body.set(reply, stream.length + 1);
    new DataView(body.buffer).setUint32(stream.length + 1 + reply.length, crc);
    const cap = ASCII_BINARY_CAP - HEADER_SIZE, chunks = [];
    for (let i = 0; i < body.length; i += cap) chunks.push(body.slice(i, i + cap));
    if (chunks.length > MAX_CHUNKS) throw new Error(`too long: needs ${chunks.length} memos, at most ${MAX_CHUNKS}`);
    return chunks.map((c, i) => { const m = new Uint8Array(HEADER_SIZE + c.length); m.set(header(contribId, i, chunks.length, c.length)); m.set(c, HEADER_SIZE); return m; });
  }
  const envelope = (binaryMemo) => "GC1:" + b64url(binaryMemo);
  function zatToZec(zat) { const s = `${Math.floor(zat / 1e8)}.${String(zat % 1e8).padStart(8, "0")}`; return s.replace(/0+$/, "").replace(/\.$/, "") || "0"; }
  function paymentUri(choir, envelopes) {
    const amount = zatToZec(choir.amount_zat);
    return "zcash:?" + envelopes.map((e, i) => { const sfx = i ? `.${i}` : ""; return `address${sfx}=${choir.address}&amount${sfx}=${amount}&memo${sfx}=${b64url(utf8(e))}`; }).join("&");
  }
  // the whole phone offering: { contribId, memos (envelopes), uri, bytes (text), chunks }
  function makeOffering(choir, text, replyAddr, contribId) {
    text = (text || "").trim();
    if (!text) throw new Error("nothing to give");
    const reply = replyAddr ? checkReplyTo(replyAddr, choir.network) : null;
    const memos = encodeText(text, reply, contribId).map(envelope);
    return { contribId, memos, uri: paymentUri(choir, memos), bytes: utf8(text).length, chunks: memos.length, hasReply: !!reply };
  }
  // how many text bytes still fit into ONE memo (one memo = one scannable QR), given the reply address length
  function oneMemoRoom(replyLen) { return ASCII_BINARY_CAP - HEADER_SIZE - 1 - 1 - (replyLen || 0) - 4; }
  // a fresh contrib_id: input, not render, so it comes from the browser's CSPRNG
  function newContribId(cryptoObj) { const a = new Uint32Array(1); (cryptoObj || root.crypto).getRandomValues(a); return a[0]; }

  const api = { makeOffering, encodeText, envelope, paymentUri, checkReplyTo, isUnifiedAddress, crc32, zatToZec, oneMemoRoom, newContribId, utf8 };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Offering = api;
})(typeof window !== "undefined" ? window : globalThis);
