// Two evocations, one god. Left: this machine's out/score.json. Right: another machine's, fetched from its own
// server (?right=http://<ip>:8765/out/score.json). Each side grows its body from its own score and shows its own
// render_hash. The comparison is of the real hashes: nothing is scrambled, predicted or shown before it is loaded.
// Match: the hashes light up in synchronised blocks, thin lines join the corresponding chambers, everything goes
// still. Mismatch: the first differing block turns the anomaly colour and the lines never appear.
"use strict";

const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const SRC = { left: q.get("left") || "out/score.json", right: q.get("right") || "out/score.json" };
const sides = {
  left: { doc: null, body: null, canvas: $("left_canvas"), hashEl: $("left_hash") },
  right: { doc: null, body: null, canvas: $("right_canvas"), hashEl: $("right_hash") },
};
let verdict = null, verdictAt = 0, lit = 0;
$("left_src").textContent = SRC.left;
$("right_src").textContent = SRC.right + (SRC.right === SRC.left ? "  (same source: pass ?right=<url> for a second machine)" : "");

fetch("config/brand.json").then((r) => r.json()).then((b) => { document.title = `${b.name}: two evocations`; });

async function load(name) {
  const s = sides[name];
  try {
    const r = await fetch(SRC[name], { cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    const doc = await r.json();
    // the right-hand score.json comes from another machine: validate before anything touches the DOM
    if (!/^[0-9a-f]{64}$/.test(doc.render_hash) || !Array.isArray(doc.render?.timeline) ||
        !Array.isArray(doc.score?.offerings) || !Array.isArray(doc.score?.skipped)) throw new Error("not a score.json");
    if (s.doc && s.doc.render_hash === doc.render_hash) return;
    s.doc = doc;
    s.body = Creature.grow(doc.render.timeline, doc.score.offerings, doc.score.skipped);
    s.hashEl.textContent = "";
    for (const b of blocks(doc.render_hash)) {
      const span = document.createElement("span");
      span.textContent = b;
      s.hashEl.append(span, " ");
    }
    verdict = null; lit = 0;
  } catch (e) {
    s.hashEl.textContent = `waiting for an evocation (${e.message})`;
  }
}
const blocks = (h) => h.match(/.{1,8}/g) || [];

function compare(now) {
  const L = sides.left.doc, R = sides.right.doc;
  if (!L || !R || verdict !== null) return;
  verdict = L.render_hash === R.render_hash ? "same" : "different";
  verdictAt = now;
}

function frame() {
  const now = performance.now();
  for (const s of Object.values(sides)) {
    const c = s.canvas, W = c.width = c.clientWidth * devicePixelRatio, H = c.height = c.clientHeight * devicePixelRatio;
    if (s.body) Creature.draw(c.getContext("2d"), s.body, -1, W, H, { age: () => 99, forgedAge: () => 99, safe: [0, H] });
    else { const ctx = c.getContext("2d"); ctx.fillStyle = "#171916"; ctx.fillRect(0, 0, W, H); }
  }
  compare(now);
  const overlay = $("lines"), OW = overlay.width = innerWidth * devicePixelRatio, OH = overlay.height = innerHeight * devicePixelRatio;
  const ctx = overlay.getContext("2d");
  ctx.clearRect(0, 0, OW, OH);
  if (verdict !== null) {
    // reveal the hashes block by block, synchronised on both sides (one block every 350 ms)
    const n = Math.min(8, Math.floor((now - verdictAt) / 350));
    const lb = sides.left.hashEl.children, rb = sides.right.hashEl.children;
    for (let i = 0; i < n && i < lb.length; i++) {
      const same = lb[i].textContent === (rb[i] && rb[i].textContent);
      lb[i].className = same ? "lit" : "bad"; if (rb[i]) rb[i].className = same ? "lit" : "bad";
      if (!same) break;
    }
    if (verdict === "same" && n >= 8) {
      // thin lines between corresponding chambers: the same anatomy, evoked twice
      const lc = sides.left.canvas.getBoundingClientRect(), rc = sides.right.canvas.getBoundingClientRect();
      const L = sides.left.body.chambers, R = sides.right.body.chambers;
      const k = Math.min(L.length, R.length, Math.floor((now - verdictAt - 2800) / 120));
      ctx.strokeStyle = "#E4DFD0"; ctx.globalAlpha = 0.35; ctx.lineWidth = 1 * devicePixelRatio;
      for (let i = 0; i < k; i++) {
        if (L[i].sx === undefined || R[i].sx === undefined) continue;
        ctx.beginPath();
        ctx.moveTo((lc.left + L[i].sx / devicePixelRatio) * devicePixelRatio, (lc.top + L[i].sy / devicePixelRatio) * devicePixelRatio);
        ctx.lineTo((rc.left + R[i].sx / devicePixelRatio) * devicePixelRatio, (rc.top + R[i].sy / devicePixelRatio) * devicePixelRatio);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (k >= Math.min(L.length, R.length)) {
        $("divider").style.opacity = 0;                      // the silence of agreement
        $("verdict").textContent = "TWO EVOCATIONS. ONE GOD.";
        $("verdict").className = "on";
      }
    } else if (verdict === "different" && n >= 8) {
      $("verdict").textContent = "THE EVOCATIONS DIFFER.";
      $("verdict").className = "on bad";
    }
  }
  requestAnimationFrame(frame);
}

load("left"); load("right");
setInterval(() => { load("left"); load("right"); }, 5000);
requestAnimationFrame(frame);
