// Two evocations, one god: the chirograph. Left: this machine's out/score.json. Right: another machine's, fetched
// from its own server (?right=http://<ip>:8765/out/score.json). Each leaf is cut from its own hashes (Leaf.cuts:
// deckle = score hash, tear line = render hash). The comparison is of the real hashes: nothing is scrambled,
// predicted or shown before it is loaded. Once both are here the hashes light up block by block, both stubs tear,
// and the right stub is laid against the left leaf's edge: the same render hash fits exactly; a different one
// leaves a gap, drawn in rubric. Then the silent hold. Without ?right= the right side explains the proof instead.
"use strict";

const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const EXPLAIN = !q.get("right");
const SRC = { left: q.get("left") || "out/score.json", right: q.get("right") || "" };
const sides = {
  left: { doc: null, cuts: null, leaf: $("left_leaf"), top: $("left_top"), stub: $("left_stub"), hashEl: $("left_hash"), nameEl: $("left_name"), lineEl: $("left_line"), nameH: $("left_name_h"), over: $("left_over") },
  right: { doc: null, cuts: null, leaf: $("right_leaf"), top: $("right_top"), stub: $("right_stub"), hashEl: $("right_hash"), nameEl: $("right_name"), lineEl: $("right_line"), nameH: $("right_name_h"), over: $("right_over") },
};
let verdict = null, verdictAt = 0, laid = false, brand = null, W = 0, H = 0, CUT = 0;
const fmt = (n) => Number(n).toLocaleString("en-US");
const blocks = (h) => h.match(/.{1,8}/g) || [];
$("left_src").textContent = SRC.left === "out/score.json" ? "this machine" : SRC.left;
if (EXPLAIN) {
  $("right").hidden = true;
  $("explain").hidden = false;
  $("stage").classList.add("explaining");
} else {
  $("right_src").textContent = SRC.right;
}

fetch("config/brand.json").then((r) => r.json()).then((b) => {
  brand = b;
  document.title = `${b.name}: two evocations`;
  // the CI run that re-evoked the main god from its key alone; a community god (its own repo_url) has no such run
  if (b.repo_url) $("ci_line").hidden = true;
  else $("ci_link").href = `https://github.com/agadape/${b.slug}/actions/runs/39727405735`;
  for (const s of Object.values(sides)) s.nameH.textContent = b.name;
});

function layout() {
  const vw = document.documentElement.clientWidth || innerWidth, narrow = vw <= 760;
  W = narrow ? Math.min(vw - 32, 400) : Math.min(380, Math.floor((vw - 200) / 2));
  H = Math.round(W * 1.3); CUT = H - 96;
  for (const s of Object.values(sides)) {
    s.leaf.style.setProperty("--W", W + "px"); s.leaf.style.setProperty("--H", H + "px"); s.leaf.style.setProperty("--cut", CUT + "px");
    if (s.doc) {
      s.cuts = Leaf.cuts(s.doc.render_hash, s.doc.score_hash, W, H, CUT);
      s.top.style.clipPath = s.cuts.top; s.stub.style.clipPath = s.cuts.stub;
    } else { s.top.style.clipPath = ""; s.stub.style.clipPath = ""; }
  }
  if (laid) lay(true);
}
addEventListener("resize", layout);

async function load(name) {
  const s = sides[name];
  try {
    const r = await fetch(SRC[name], { cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    const doc = await r.json();
    // the right-hand score.json comes from another machine: validate before anything touches the DOM
    if (!/^[0-9a-f]{64}$/.test(doc.render_hash) || !/^[0-9a-f]{64}$/.test(doc.score_hash) || !Array.isArray(doc.render?.timeline) ||
        !Array.isArray(doc.score?.offerings) || !Array.isArray(doc.score?.skipped)) throw new Error("not a score.json");
    if (s.doc && s.doc.render_hash === doc.render_hash) return;
    s.doc = doc;
    s.hashEl.textContent = "";
    for (const b of blocks(doc.render_hash)) {
      const span = document.createElement("span");
      span.textContent = b;
      if (EXPLAIN) span.className = "lit";
      s.hashEl.appendChild(span);
    }
    s.over.textContent = `${name === "left" ? "this evocation" : "another evocation"} · height ${fmt(doc.score.as_of_height)}`;
    s.lineEl.textContent = `height ${fmt(doc.score.as_of_height)} · ${blocks(doc.render_hash)[0]} … ${blocks(doc.render_hash)[7]}`;
    if (EXPLAIN && name === "left") {
      s.nameEl.textContent = `it is now called ${trueName(doc.render_hash)}`;
      $("explain_hash").textContent = doc.render_hash;
      $("explain_name").textContent = `it is now called ${trueName(doc.render_hash)}`;
    } else s.nameEl.textContent = "";                        // the name appears with the verdict, not before
    verdict = null; laid = false; unlay();
    layout();
  } catch (e) {
    s.hashEl.textContent = "";
    const w = document.createElement("span"); w.className = "wait"; w.textContent = `waiting for an evocation (${e.message})`;
    s.hashEl.appendChild(w);
  }
}

function compare(now) {
  const L = sides.left.doc, R = sides.right.doc;
  if (EXPLAIN || !L || !R || verdict !== null) return;
  verdict = L.render_hash === R.render_hash ? "same" : "different";
  verdictAt = now;
}

// the right stub is laid against the left leaf's edge (same leaf coordinates: a fitting edge coincides exactly)
function lay(instant) {
  const l = sides.left.leaf.getBoundingClientRect(), r = sides.right.leaf.getBoundingClientRect();
  const st = sides.right.stub.style;
  if (instant) st.transition = "none";
  st.transform = `translate(${(l.left - r.left).toFixed(1)}px, ${(l.top - r.top).toFixed(1)}px)`;
  st.zIndex = 3;
  if (instant) { void st.offsetHeight; st.transition = ""; }
  laid = true;
}
function unlay() {
  const st = sides.right.stub.style; st.transform = ""; st.opacity = ""; st.zIndex = "";
  sides.left.stub.style.opacity = ""; sides.left.stub.style.transform = "";
  $("verdict").className = ""; $("verdict").textContent = "";
  const g = $("gap"); g.width = g.height = 0;
  for (const s of Object.values(sides)) s.nameEl.className = "tn";
}

// the gap between two edges that do not fit, drawn in rubric over the left leaf
function drawGap() {
  const g = $("gap"), dpr = devicePixelRatio || 1;
  g.style.width = W + "px"; g.style.height = H + "px"; g.width = W * dpr; g.height = H * dpr;
  const ctx = g.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  const a = sides.left.cuts.cut, b = sides.right.cuts.cut;
  ctx.fillStyle = "#c8431f"; ctx.globalAlpha = 0.9;
  ctx.beginPath(); ctx.moveTo(a[0][0], a[0][1]);
  for (const [x, y] of a) ctx.lineTo(x, y);
  for (let i = b.length - 1; i >= 0; i--) ctx.lineTo(b[i][0], b[i][1]);
  ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
}

function frame() {
  const now = performance.now();
  compare(now);
  if (verdict !== null) {
    // reveal the hashes block by block, synchronised on both sides (one block every 350 ms)
    const n = Math.min(8, Math.floor((now - verdictAt) / 350));
    const lb = sides.left.hashEl.children, rb = sides.right.hashEl.children;
    for (let i = 0; i < n && i < lb.length; i++) {
      const same = lb[i].textContent === (rb[i] && rb[i].textContent);
      lb[i].className = same ? "lit" : "bad"; if (rb[i]) rb[i].className = same ? "lit" : "bad";
      if (!same) break;
    }
    if (n >= 8) {   // the true names: identical on a match, visibly different (and rubric) otherwise
      for (const s of Object.values(sides)) {
        s.nameEl.textContent = `it is now called ${trueName(s.doc.render_hash)}`;
        s.nameEl.className = verdict === "same" ? "tn" : "tn bad";
      }
    }
    const t = now - verdictAt - 3200;
    if (t > 0 && !laid) {                                   // both stubs tear; the left one falls away, the right one travels
      sides.left.stub.style.opacity = 0; sides.left.stub.style.transform = "translateY(30px) rotate(-3deg)";
      lay(false);
    }
    if (t > 1900) {                                         // the silent hold
      const v = $("verdict");
      if (verdict === "same") { v.textContent = "two evocations. one god."; v.className = "on"; }
      else { if (!g_drawn) { drawGap(); g_drawn = true; } v.textContent = "the evocations differ."; v.className = "on bad"; }
    }
  }
  requestAnimationFrame(frame);
}
let g_drawn = false;

layout();
load("left"); if (!EXPLAIN) load("right");
setInterval(() => { load("left"); if (!EXPLAIN) load("right"); }, 5000);
requestAnimationFrame(frame);
