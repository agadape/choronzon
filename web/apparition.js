// Two evocations, one god. Left: this machine's out/score.json. Right: another machine's, fetched from its own
// server (?right=http://<ip>:8765/out/score.json). Each side grows its body from its own score and shows its own
// render_hash. The comparison is of the real hashes: nothing is scrambled, predicted or shown before it is loaded.
// Match: the hashes light up in synchronised blocks, thin lines join the corresponding chambers, everything goes
// still. Mismatch: the first differing block turns the anomaly colour and the lines never appear.
// Without ?right= the right half explains the proof instead of comparing the page with itself.
"use strict";

const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const EXPLAIN = !q.get("right");
const SRC = { left: q.get("left") || "out/score.json", right: q.get("right") || "" };
const sides = {
  left: { doc: null, body: null, canvas: $("left_canvas"), hashEl: $("left_hash"), nameEl: $("left_name") },
  right: { doc: null, body: null, canvas: $("right_canvas"), hashEl: $("right_hash"), nameEl: $("right_name") },
};
let verdict = null, verdictAt = 0;
$("left_src").textContent = SRC.left === "out/score.json" ? "this machine" : SRC.left;
if (EXPLAIN) {
  $("right").hidden = true;
  $("explain").hidden = false;
  $("stage").classList.add("explaining");
  $("divider").style.display = "none";
} else {
  $("right_src").textContent = SRC.right;
}

fetch("config/brand.json").then((r) => r.json()).then((b) => {
  document.title = `${b.name}: two evocations`;
  $("ci_link").href = `https://github.com/agadape/${b.slug}/actions/runs/39727405735`;
});

const blocks = (h) => h.match(/.{1,8}/g) || [];

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
      if (EXPLAIN) span.className = "lit";
      s.hashEl.appendChild(span);
    }
    if (EXPLAIN && name === "left") {
      s.nameEl.textContent = `it is now called ${trueName(doc.render_hash)}`;
      $("explain_hash").textContent = doc.render_hash;
      $("explain_name").textContent = `it is now called ${trueName(doc.render_hash)}`;
    } else s.nameEl.textContent = "";                        // the name appears with the verdict, not before
    verdict = null;
  } catch (e) {
    s.hashEl.textContent = `waiting for an evocation (${e.message})`;
  }
}

function compare(now) {
  const L = sides.left.doc, R = sides.right.doc;
  if (EXPLAIN || !L || !R || verdict !== null) return;
  verdict = L.render_hash === R.render_hash ? "same" : "different";
  verdictAt = now;
}

function frame() {
  const now = performance.now();
  for (const [name, s] of Object.entries(sides)) {
    if (EXPLAIN && name === "right") continue;
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
    if (n >= 8) {   // the true names: identical on a match, visibly different (and anomaly-coloured) otherwise
      for (const s of Object.values(sides)) {
        s.nameEl.textContent = `it is now called ${trueName(s.doc.render_hash)}`;
        s.nameEl.className = verdict === "same" ? "name" : "name bad";
      }
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

load("left"); if (!EXPLAIN) load("right");
setInterval(() => { load("left"); if (!EXPLAIN) load("right"); }, 5000);
requestAnimationFrame(frame);
