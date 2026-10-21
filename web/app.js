// Listener page: loads config/brand.json + out/score.json + out/mix.wav, grows the creature, plays the buffer.
// WebAudio only PLAYS the offline mix; nothing is mixed here (browser mixing is not bit-exact).
"use strict";

const $ = (id) => document.getElementById(id);
let audioCtx = null, source = null, startedAt = 0, playing = false, currentHash = null, body = { limbs: [], mass: 0 };
let buffer = null;

async function fetchJSON(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

async function loadBrand() {
  const b = await fetchJSON("config/brand.json");
  document.title = b.name;
  $("name").textContent = b.name;
  $("tagline").textContent = b.tagline;
}

async function loadScore() {
  let doc;
  try { doc = await fetchJSON("out/score.json"); }
  catch (e) { $("status").textContent = "waiting for the renderer (out/score.json)"; return; }
  if (doc.render_hash === currentHash) return;
  currentHash = doc.render_hash;
  body = Creature.grow(doc.render.timeline);
  $("offerings").textContent = doc.score.offerings.length;
  $("height").textContent = doc.score.as_of_height.toLocaleString("en-US");
  $("skipped").textContent = doc.score.skipped.length;
  $("render_hash").textContent = doc.render_hash;
  $("score_hash").textContent = doc.score_hash;
  $("pins").textContent = (doc.render.decoder.matches_pin && doc.render.voice.matches_pin)
    ? "decoder + voice match the pinned builds" : "WARNING: decoder or voice differs from the pinned build";
  $("status").textContent = `evoked at height ${doc.score.as_of_height}`;
  const r = await fetch("out/mix.wav", { cache: "no-store" });
  const ab = await r.arrayBuffer();
  if (audioCtx) buffer = await audioCtx.decodeAudioData(ab);
  else pendingWav = ab;
}
let pendingWav = null;

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
  source.onended = () => { playing = false; $("play").textContent = "evoke again"; };
  startedAt = audioCtx.currentTime;
  source.start();
  playing = true;
  $("play").textContent = "silence";
}

function stop() {
  if (source) { try { source.stop(); } catch (e) { /* already stopped */ } source = null; }
  playing = false;
}

function frame() {
  const c = $("creature");
  const W = c.width = c.clientWidth * devicePixelRatio, H = c.height = c.clientHeight * devicePixelRatio;
  const t = playing ? Math.floor((audioCtx.currentTime - startedAt) * 8000) : -1;
  Creature.draw(c.getContext("2d"), body, t, W, H);
  requestAnimationFrame(frame);
}

// Whisper Back: click a limb -> ask the server for that offering's reply request (read from the wallet DB on demand)
let hasReply = {};
const origLoad = loadScore;
async function whisper(txid) {
  const text = $("whisper_text").value.trim() || "you are not alone.";
  const r = await fetch(`whisper/${txid}?text=${encodeURIComponent(text)}`);
  if (!r.ok) { $("whisper_status").textContent = "this offering asked for no whisper"; $("qr").innerHTML = ""; return; }
  const w = await r.json();
  $("whisper_status").textContent = `scan with your wallet to whisper back to offering ${txid.slice(0, 12)}… (the choir never sees it)`;
  $("qr").innerHTML = w.qr_svg;
  $("whisper_uri").textContent = w.uri;
}

$("creature").addEventListener("click", (ev) => {
  if (!body.limbs.length) return;
  const c = $("creature"), r = c.getBoundingClientRect();
  const x = (ev.clientX - r.left) * devicePixelRatio, y = (ev.clientY - r.top) * devicePixelRatio;
  let best = null, bestD = 40 * devicePixelRatio;
  for (const l of body.limbs) {
    if (l.sx1 === undefined) continue;
    const d = Math.hypot(l.sx1 - x, l.sy1 - y);
    if (d < bestD) { best = l; bestD = d; }
  }
  if (best) whisper(best.tx);
});
$("whisper_close").addEventListener("click", () => { $("qr").innerHTML = ""; $("whisper_status").textContent = ""; $("whisper_uri").textContent = ""; });

$("play").addEventListener("click", () => (playing ? (stop(), $("play").textContent = "evoke") : play()));
loadBrand().then(loadScore);
setInterval(loadScore, 5000);
requestAnimationFrame(frame);
