// Listener page: loads config/brand.json + out/score.json + out/mix.wav, mounts the god (three.js, web/god.js;
// Canvas 2D creature.js without WebGL), plays the buffer. WebAudio only PLAYS the offline mix; nothing is mixed
// here (browser mixing is not bit-exact). The god is a pure function of score.json: a new render_hash mounts a new one.
"use strict";

const $ = (id) => document.getElementById(id);
const README = "https://github.com/agadape/";           // + slug; anchors below point into the generated README
const ZECBLOCK = "https://testnet.zecblock.com/block/";
const fmt = (n) => Number(n).toLocaleString("en-US");
let audioCtx = null, source = null, startedAt = 0, playing = false, currentHash = null, currentDoc = null;
let body = { chambers: [], conductors: [], forged: [], silenced: [], spine: 70, count: 0 };
let buffer = null, pendingWav = null, brand = null;
const firstSeen = {};            // tx -> performance.now() when this page first drew it (fallback creature only)
let forgedSeen = null;
let god = null;                  // the three.js god (web/god.js), or null on the Canvas 2D fallback
const CALM = matchMedia("(prefers-reduced-motion: reduce)").matches;
// séance mode (?seance): the great eye's lids are shut and the hashes sealed until the operator opens the Eye
const SEANCE = new URLSearchParams(location.search).has("seance");
let eyeOpenedAt = null;          // performance.now() when the lids started to part; null = not started
let eyeOpen = !SEANCE;           // hashes (and the key) show only once the lids are open
if (SEANCE) document.body.classList.add("sealed");
// static snapshot (Vercel): static.json next to index.html marks a build with no wallet and no key behind it
let STATIC = null;
// ?stats: a small readout of the god's weight (draw calls, triangles, fps) for measuring against the budget
let STATS = null, statsAt = 0;
if (new URLSearchParams(location.search).has("stats")) {
  STATS = document.createElement("div"); STATS.id = "stats";
  STATS.style.cssText = "position:fixed;top:8px;left:8px;z-index:9;font:13px Georgia,serif;color:#ebdfc2;background:rgba(5,3,2,.7);padding:4px 8px;pointer-events:none";
  document.body.appendChild(STATS);
}

async function fetchJSON(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

function hashBlocks(el, hash) {
  el.textContent = "";
  for (const b of (hash.match(/.{1,8}/g) || [])) {
    const span = document.createElement("span");
    span.textContent = b;
    span.className = "lit";
    el.appendChild(span);
  }
}

async function loadBrand() {
  brand = await fetchJSON("config/brand.json");
  document.title = brand.name;
  for (const id of ["name", "m_name"]) $(id).textContent = brand.name;
  for (const id of ["tagline", "m_tag"]) $(id).textContent = brand.tagline;
  $("lede").textContent = brand.one_liner;
  for (const sel of ['meta[name="description"]', 'meta[property="og:description"]'])
    document.querySelector(sel).setAttribute("content", brand.one_liner);
  document.querySelector('meta[property="og:title"]').setAttribute("content", `${brand.name}: ${brand.tagline}`);
  $("link_readme").href = `${README}${brand.slug}#determinism-the-blockchain-is-the-score`;
}

async function loadStatic() {
  try {
    const r = await fetch("static.json", { cache: "no-store" });
    if (r.ok) STATIC = await r.json();
  } catch (e) { STATIC = null; }
  if (STATIC && STATIC.static) {
    const when = new Date(STATIC.rendered_at).toISOString().replace("T", " ").slice(0, 16) + " UTC";
    $("snapshot").textContent = `snapshot of the god at height ${fmt(STATIC.as_of_height)}, ` +
      `rendered ${when}; the installation re-renders every block.`;
    // a snapshot cannot whisper back: one quiet line instead of an input box
    $("whisper_text").remove();
    $("whisper_label").textContent = "whisper back";
    $("whisper_status").textContent = "works at the installation: it reads the reply address from a wallet, never from this page.";
  }
}

// the god: three.js when WebGL2 is there, else the Canvas 2D creature (same score, same meaning)
function mountGod(doc) {
  const canvas = $("creature");
  if (window.God && God.supported()) {
    if (god) god.dispose();
    try {
      god = God.mount(canvas, doc, { reducedMotion: CALM });
      document.body.classList.add("webgl");
      window.__god = god;
      leafOffset();
      return;
    } catch (e) { god = null; document.body.classList.remove("webgl"); }
  }
  body = Creature.grow(doc.render.timeline, doc.score.offerings, doc.score.skipped);
  // a WebGL context can fail while the GPU process is still starting: ask once more before settling for the fallback
  if (window.God && !godRetried) { godRetried = true; setTimeout(() => { if (!god && currentDoc && God.supported()) mountGod(currentDoc); }, 2000); }
}
let godRetried = false;
addEventListener("god-ready", () => { if (currentDoc && !god) mountGod(currentDoc); });

async function loadScore() {
  let doc;
  try { doc = await fetchJSON("out/score.json"); }
  catch (e) { $("status").textContent = "nothing has been evoked yet"; return; }
  if (doc.render_hash === currentHash) return;
  const firstLoad = currentHash === null;
  currentHash = doc.render_hash; currentDoc = doc;
  mountGod(doc);
  const now = performance.now();
  for (const c of body.chambers) if (!(c.tx in firstSeen)) firstSeen[c.tx] = firstLoad ? now - 60000 : now;
  const forged = doc.score.skipped.filter((s) => s.reason === "forged-conductor");
  if (forged.length && forgedSeen === null) forgedSeen = firstLoad ? -1 : now;
  const height = Number(doc.score.as_of_height);
  $("offerings").textContent = doc.score.offerings.length;
  $("height").textContent = fmt(height);
  $("skipped").textContent = doc.score.skipped.filter((s) => s.reason === "flagged").length;
  $("refused").textContent = forged.length;
  $("over").textContent = `evoked at height ${fmt(height)}`;
  const name = trueName(doc.render_hash);                  // the god's true name: a pure function of the hash
  $("true_name").textContent = "";
  if (eyeOpen) { $("true_name").append("it is now called "); const g = document.createElement("span"); g.className = "gilt"; g.textContent = name; $("true_name").append(g); }
  else $("true_name").textContent = "sealed until the eye opens";
  $("eye_name").textContent = `it is now called ${name}`;
  hashBlocks($("render_hash"), doc.render_hash);
  hashBlocks($("score_hash"), doc.score_hash);
  hashBlocks($("eye_render_hash"), doc.render_hash);
  $("pins").textContent = ((doc.render.decoder.matches_pin && doc.render.voice.matches_pin)
    ? "decoder and voice match the pinned builds" : "WARNING: decoder or voice differs from the pinned build")
    + ` · composer ${doc.render.composer}`;
  $("link_block").href = ZECBLOCK + height;
  $("status").textContent = `${doc.score.offerings.length === 0 ? "nothing has been given yet" : "evoked"} at height ${fmt(height)}`;
  const r = await fetch("out/mix.wav", { cache: "no-store" });
  const ab = await r.arrayBuffer();
  if (audioCtx) buffer = await audioCtx.decodeAudioData(ab);
  else pendingWav = ab;
}

const playButtons = () => [$("play"), $("play2")];
function setPlaying(on, label) {
  playing = on;
  for (const b of playButtons()) { b.textContent = label; b.classList.toggle("live", on); }
}
async function play() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (pendingWav) { buffer = await audioCtx.decodeAudioData(pendingWav); pendingWav = null; }
  }
  if (!buffer) return;
  stop();
  source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(audioCtx.destination);
  source.onended = () => setPlaying(false, "Listen again");
  startedAt = audioCtx.currentTime;
  source.start();
  setPlaying(true, "Silence");
}

function stop() {
  if (source) { try { source.stop(); } catch (e) { /* already stopped */ } source = null; }
  setPlaying(false, "Listen");
}

function frame() {
  const t = playing ? Math.floor((audioCtx.currentTime - startedAt) * 8000) : -1;
  const now = performance.now();
  // the Eye (séance): the great eye's lids part over ~3 s and stay open
  let lids = SEANCE ? 0 : 1;
  if (eyeOpenedAt !== null) { const a = Math.min(1, (now - eyeOpenedAt) / 3000); lids = a * a * (3 - 2 * a); }
  if (god) {
    god.setPlayT(t); god.setEyeOpen(lids);
    if (STATS && now - statsAt > 500) {                   // ?stats: draw calls, triangles, fps, DPR (budget: spec §3)
      statsAt = now; const s = god.stats();
      STATS.textContent = `${s.calls} calls · ${fmt(s.triangles)} tris · ${s.fps || 0} fps · dpr ${s.dpr}${s.phone ? " · phone path" : ""}`;
    }
  } else {
    const c = $("creature");
    const W = c.width = c.clientWidth * devicePixelRatio, H = c.height = c.clientHeight * devicePixelRatio;
    const topEl = document.querySelector(".masthead"), top = topEl.getBoundingClientRect().bottom + 4;
    const bottom = innerWidth > 900 ? innerHeight - 90 : innerHeight * 0.86;
    Creature.draw(c.getContext("2d"), body, t, W, H, {
      age: (tx) => (tx in firstSeen ? (now - firstSeen[tx]) / 1000 : 99),
      forgedAge: () => (forgedSeen === null ? null : forgedSeen < 0 ? 99 : (now - forgedSeen) / 1000),
      safe: [top * devicePixelRatio, Math.max(top + 80, bottom) * devicePixelRatio],
      aperture: eyeOpenedAt === null ? undefined : lids,
    });
    const f = body.forgedScreen;
    $("not_the_god").style.display = f ? "block" : "none";
    if (f) { $("not_the_god").style.left = `${f.x / devicePixelRatio}px`; $("not_the_god").style.top = `${f.y / devicePixelRatio}px`; $("not_the_god").style.opacity = f.fade; }
  }
  requestAnimationFrame(frame);
}

// the grimoire: the column slides in from the right; the god's view glides left to make room (desktop only)
function leafOffset() {
  const open = !document.body.classList.contains("closed") && innerWidth > 900;
  if (god) god.setViewOffset(open ? (document.querySelector(".column").offsetWidth + 80) / 2 : 0);
}
function setLeaf(open) { document.body.classList.toggle("closed", !open); leafOffset(); }
$("open_leaf").addEventListener("click", () => setLeaf(true));
$("close_leaf").addEventListener("click", () => setLeaf(false));
// the god picks its detail level (PHONE path) when mounted: crossing the 900 px line mounts it again
let narrowAtMount = innerWidth <= 900;
addEventListener("resize", () => {
  leafOffset();
  if (god && currentDoc && (innerWidth <= 900) !== narrowAtMount) { narrowAtMount = innerWidth <= 900; mountGod(currentDoc); }
});
if (new URLSearchParams(location.search).has("leaf")) setLeaf(true);

// Whisper Back: click an eye -> ask the server for that offering's reply request (read from the wallet DB on demand)
async function whisper(txid) {
  if (STATIC && STATIC.static) return;
  const text = ($("whisper_text") && $("whisper_text").value.trim()) || "you are not alone.";
  const r = await fetch(`whisper/${txid}?text=${encodeURIComponent(text)}`);
  if (!r.ok) { $("whisper_status").textContent = "this offering asked for no whisper"; $("qr").innerHTML = ""; return; }
  const w = await r.json();
  $("whisper_status").textContent = `scan with your wallet to whisper back to offering ${txid.slice(0, 12)}… (the choir never sees it)`;
  $("qr").innerHTML = w.qr_svg;
  $("whisper_uri").textContent = w.uri;
}

$("creature").addEventListener("click", (ev) => {
  if (god) { if (god.wasDrag()) return; const tx = god.pick(ev.clientX, ev.clientY); if (tx) whisper(tx); return; }
  const c = $("creature"), r = c.getBoundingClientRect();
  const x = (ev.clientX - r.left) * devicePixelRatio, y = (ev.clientY - r.top) * devicePixelRatio;
  let best = null, bestD = 48 * devicePixelRatio;
  for (const ch of [...body.chambers, ...body.conductors]) {
    if (ch.sx === undefined) continue;
    const d = Math.hypot(ch.sx - x, ch.sy - y);
    if (d < bestD) { best = ch; bestD = d; }
  }
  if (best) whisper(best.tx);
});
$("whisper_close").addEventListener("click", () => { $("qr").innerHTML = ""; $("whisper_status").textContent = ""; $("whisper_uri").textContent = ""; });

// the Eye opens (séance): the lids part, then the key (if this server publishes one) and the hashes
async function openEye() {
  if (eyeOpenedAt !== null) return;
  eyeOpenedAt = performance.now();
  stop();
  $("open_eye").style.display = "none";
  let eye = null;
  if (STATIC && STATIC.static) {           // a snapshot has no key behind it: the Eye reveals the hashes only
    $("eye_key").textContent = "the key is published at the installation when the Eye opens there, never by this snapshot";
  } else {
    try {
      await fetch("eye/open", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const r = await fetch("eye", { cache: "no-store" });
      if (r.ok) eye = await r.json();
    } catch (e) { /* no key on this server: hashes only */ }
  }
  setTimeout(() => {
    eyeOpen = true;
    document.body.classList.remove("sealed");
    currentHash = null;                 // re-render the leaf unsealed on the next poll (the god itself is unchanged)
    loadScore();
    if (eye) {
      $("eye_key").textContent = eye.key;
      $("eye_qr").innerHTML = eye.qr_svg;
      $("eye_birthday").textContent = eye.birthday ? `· birthday height ${eye.birthday}` : "";
    }
    $("eye").classList.add("on");
  }, 3500);
}
$("open_eye").addEventListener("click", openEye);
$("eye_close").addEventListener("click", () => $("eye").classList.remove("on"));
document.addEventListener("keydown", (ev) => {
  if (ev.target && /INPUT|TEXTAREA/.test(ev.target.tagName)) return;
  const k = ev.key.toLowerCase();
  if (k === "e" && SEANCE) openEye();
  if (k === "g") setLeaf(document.body.classList.contains("closed"));
});

for (const b of playButtons()) b.addEventListener("click", () => (playing ? stop() : play()));
loadBrand().then(loadStatic).then(loadScore);
setInterval(loadScore, 5000);   // on a snapshot the hash never changes, so this is a no-op there
requestAnimationFrame(frame);
