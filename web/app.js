// Listener page: loads config/brand.json + out/score.json + out/mix.wav, grows the body, plays the buffer.
// WebAudio only PLAYS the offline mix; nothing is mixed here (browser mixing is not bit-exact).
"use strict";

const $ = (id) => document.getElementById(id);
const README = "https://github.com/agadape/";           // + slug; anchors below point into the generated README
const ZECBLOCK = "https://testnet.zecblock.com/block/";
let audioCtx = null, source = null, startedAt = 0, playing = false, currentHash = null;
let body = { chambers: [], conductors: [], forged: [], silenced: [], spine: 70, count: 0 };
let buffer = null, pendingWav = null, brand = null;
const firstSeen = {};            // tx -> performance.now() when this page first drew it (arrival animation only)
let forgedSeen = null;
// séance mode (?seance): the hashes and the key stay sealed until the operator opens the Eye
const SEANCE = new URLSearchParams(location.search).has("seance");
let eyeOpenedAt = null;          // performance.now() when the aperture started; null = not started
let eyeOpen = !SEANCE;           // hashes (and the key) show only once the aperture has crossed the whole body
if (SEANCE) document.body.classList.add("sealed");
// static snapshot (Vercel): static.json next to index.html marks a build with no wallet and no key behind it
let STATIC = null;

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
  $("name").textContent = brand.name;
  $("tagline").textContent = brand.tagline;
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
    $("snapshot").textContent = `snapshot of the god at height ${Number(STATIC.as_of_height).toLocaleString("en-US")}, ` +
      `rendered ${when}; the installation re-renders every block.`;
    // a snapshot cannot whisper back: one quiet line instead of an input box
    $("whisper_text").remove();
    $("whisper_label").textContent = "whisper back";
    $("whisper_status").textContent = "works at the installation: it reads the reply address from a wallet, never from this page.";
  }
}

async function loadScore() {
  let doc;
  try { doc = await fetchJSON("out/score.json"); }
  catch (e) { $("status").textContent = "nothing has been evoked yet"; return; }
  if (doc.render_hash === currentHash) return;
  const firstLoad = currentHash === null;
  currentHash = doc.render_hash;
  body = Creature.grow(doc.render.timeline, doc.score.offerings, doc.score.skipped);
  const now = performance.now();
  for (const c of body.chambers) if (!(c.tx in firstSeen)) firstSeen[c.tx] = firstLoad ? now - 60000 : now;
  const forged = doc.score.skipped.filter((s) => s.reason === "forged-conductor");
  if (forged.length && forgedSeen === null) forgedSeen = firstLoad ? -1 : now;
  const height = Number(doc.score.as_of_height);
  $("offerings").textContent = doc.score.offerings.length;
  $("height").textContent = height.toLocaleString("en-US");
  $("skipped").textContent = doc.score.skipped.filter((s) => s.reason === "flagged").length;
  $("refused").textContent = forged.length;
  const name = trueName(doc.render_hash);                  // the god's true name: a pure function of the hash
  $("true_name").textContent = eyeOpen ? `it is now called ${name}` : "sealed until the eye opens";
  $("eye_name").textContent = `it is now called ${name}`;
  hashBlocks($("render_hash"), doc.render_hash);
  hashBlocks($("score_hash"), doc.score_hash);
  hashBlocks($("eye_render_hash"), doc.render_hash);
  $("pins").textContent = (doc.render.decoder.matches_pin && doc.render.voice.matches_pin)
    ? "decoder and voice match the pinned builds" : "WARNING: decoder or voice differs from the pinned build";
  $("link_block").href = ZECBLOCK + height;
  $("status").textContent = `${doc.score.offerings.length === 0 ? "nothing has been given yet" : "evoked"} at height ${height.toLocaleString("en-US")}`;
  const r = await fetch("out/mix.wav", { cache: "no-store" });
  const ab = await r.arrayBuffer();
  if (audioCtx) buffer = await audioCtx.decodeAudioData(ab);
  else pendingWav = ab;
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
  source.onended = () => { playing = false; $("play").textContent = "listen again"; $("play").classList.remove("live"); };
  startedAt = audioCtx.currentTime;
  source.start();
  playing = true;
  $("play").textContent = "silence";
  $("play").classList.add("live");
}

function stop() {
  if (source) { try { source.stop(); } catch (e) { /* already stopped */ } source = null; }
  playing = false;
  $("play").classList.remove("live");
}

function frame() {
  const c = $("creature");
  const W = c.width = c.clientWidth * devicePixelRatio, H = c.height = c.clientHeight * devicePixelRatio;
  const t = playing ? Math.floor((audioCtx.currentTime - startedAt) * 8000) : -1;
  const now = performance.now();
  // the body lives in the band between the header and the footer, so the words stay readable
  const top = $("top").getBoundingClientRect().bottom + 4;
  const bottom = $("bottom").getBoundingClientRect().top - 4;
  const aperture = eyeOpenedAt === null ? undefined : Math.min(1, (now - eyeOpenedAt) / 6000);
  Creature.draw(c.getContext("2d"), body, t, W, H, {
    age: (tx) => (tx in firstSeen ? (now - firstSeen[tx]) / 1000 : 99),
    forgedAge: () => (forgedSeen === null ? null : forgedSeen < 0 ? 99 : (now - forgedSeen) / 1000),
    safe: [top * devicePixelRatio, Math.max(top + 80, bottom) * devicePixelRatio],
    aperture: aperture === undefined ? undefined : aperture * aperture * (3 - 2 * aperture),   // ease in-out
  });
  const f = body.forgedScreen;
  $("not_the_god").style.display = f ? "block" : "none";
  if (f) { $("not_the_god").style.left = `${f.x / devicePixelRatio}px`; $("not_the_god").style.top = `${f.y / devicePixelRatio}px`; $("not_the_god").style.opacity = f.fade; }
  requestAnimationFrame(frame);
}

// Whisper Back: click a chamber -> ask the server for that offering's reply request (read from the wallet DB on demand)
async function whisper(txid) {
  if (STATIC && STATIC.static) return;
  const text = $("whisper_text").value.trim() || "you are not alone.";
  const r = await fetch(`whisper/${txid}?text=${encodeURIComponent(text)}`);
  if (!r.ok) { $("whisper_status").textContent = "this offering asked for no whisper"; $("qr").innerHTML = ""; return; }
  const w = await r.json();
  $("whisper_status").textContent = `scan with your wallet to whisper back to offering ${txid.slice(0, 12)}… (the choir never sees it)`;
  $("qr").innerHTML = w.qr_svg;
  $("whisper_uri").textContent = w.uri;
}

$("creature").addEventListener("click", (ev) => {
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

// the Eye opens (séance): aperture across the body, then the key (if this server publishes one) and the hashes
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
    currentHash = null;                 // re-render the footer unsealed on the next poll
    loadScore();
    if (eye) {
      $("eye_key").textContent = eye.key;
      $("eye_qr").innerHTML = eye.qr_svg;
      $("eye_birthday").textContent = eye.birthday ? `· birthday height ${eye.birthday}` : "";
    }
    $("eye").classList.add("on");
  }, 6500);
}
$("open_eye").addEventListener("click", openEye);
$("eye_close").addEventListener("click", () => $("eye").classList.remove("on"));
document.addEventListener("keydown", (ev) => { if (ev.key === "e" && SEANCE) openEye(); });

$("play").addEventListener("click", () => (playing ? (stop(), $("play").textContent = "listen") : play()));
loadBrand().then(loadStatic).then(loadScore);
setInterval(loadScore, 5000);   // on a snapshot the hash never changes, so this is a no-op there
requestAnimationFrame(frame);
