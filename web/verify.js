// Verify in the browser: recompute render_hash from the files this page already loaded, with WebCrypto, exactly as
// renderer/hashes.py does: render_hash v1 = SHA-256( score_hash (32 bytes) || PCM || composer version ), where PCM
// is the data chunk of out/mix.wav (interleaved int16 LE stereo, 8 kHz: the audio you hear) and the composer version
// is score.json's render.composer. The score_hash itself needs the raw on-chain memos (a Watcher with the key
// recomputes it); here it is taken from score.json and checked against static.json and anchor.json.
// Pure: no DOM, no network; `subtle` is crypto.subtle (the browser's, or node's webcrypto in the tests).
(function (root) {
  "use strict";
  // the payload of the RIFF "data" chunk (chunks are walked, never assumed at a fixed offset)
  function wavData(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength), tag = (o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
    if (b.length < 12 || tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("not a WAV file");
    for (let o = 12; o + 8 <= b.length;) {
      const id = tag(o), size = v.getUint32(o + 4, true);
      if (id === "data") { if (o + 8 + size > b.length) throw new Error("WAV data chunk is truncated"); return b.subarray(o + 8, o + 8 + size); }
      o += 8 + size + (size & 1);
    }
    throw new Error("WAV file has no data chunk");
  }
  const hex = (buf) => Array.from(new Uint8Array(buf), (x) => x.toString(16).padStart(2, "0")).join("");
  const unhex = (h) => Uint8Array.from(h.match(/../g), (x) => parseInt(x, 16));
  async function renderHash(wavBytes, scoreHashHex, composerVersion, subtle) {
    if (!/^[0-9a-f]{64}$/.test(scoreHashHex)) throw new Error("score_hash is not 64 hex digits");
    const pcm = wavData(wavBytes), comp = new TextEncoder().encode(composerVersion);
    const all = new Uint8Array(32 + pcm.length + comp.length);
    all.set(unhex(scoreHashHex), 0); all.set(pcm, 32); all.set(comp, 32 + pcm.length);
    return hex(await (subtle || root.crypto.subtle).digest("SHA-256", all));
  }
  // compare one recomputation with every published copy of the hashes; returns { ok, computed, checks: [...] }
  async function check({ wav, score, statik, anchor, subtle }) {
    const computed = await renderHash(wav, score.score_hash, score.render.composer, subtle);
    const checks = [["score.json", score.render_hash, score.score_hash]];
    if (statik && statik.render_hash) checks.push(["static.json", statik.render_hash, statik.score_hash]);
    if (anchor && anchor.render_hash) checks.push(["anchor.json", anchor.render_hash, anchor.score_hash]);
    const rows = checks.map(([name, r, s]) => ({ name, render: r === computed, score: s === score.score_hash }));
    return { ok: rows.every((x) => x.render && x.score), computed, checks: rows };
  }
  const api = { wavData, renderHash, check };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Verify = api;
})(typeof window !== "undefined" ? window : globalThis);
