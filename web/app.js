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

$("play").addEventListener("click", () => (playing ? (stop(), $("play").textContent = "evoke") : play()));
loadBrand().then(loadScore);
setInterval(loadScore, 5000);
requestAnimationFrame(frame);
