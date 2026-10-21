// Listener page: loads config/brand.json + out/score.json + out/mix.wav, grows the body, plays the buffer.
// WebAudio only PLAYS the offline mix; nothing is mixed here (browser mixing is not bit-exact).
"use strict";

const $ = (id) => document.getElementById(id);
let audioCtx = null, source = null, startedAt = 0, playing = false, currentHash = null;
let body = { chambers: [], conductors: [], forged: [], silenced: [], spine: 70, count: 0 };
let buffer = null, pendingWav = null;
const firstSeen = {};            // tx -> performance.now() when this page first drew it (arrival animation only)
let forgedSeen = null;

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
  catch (e) { $("status").textContent = "nothing has been evoked yet (out/score.json)"; return; }
  if (doc.render_hash === currentHash) return;
  const firstLoad = currentHash === null;
  currentHash = doc.render_hash;
  body = Creature.grow(doc.render.timeline, doc.score.offerings, doc.score.skipped);
  const now = performance.now();
  for (const c of body.chambers) if (!(c.tx in firstSeen)) firstSeen[c.tx] = firstLoad ? now - 60000 : now;
  const forged = doc.score.skipped.filter((s) => s.reason === "forged-conductor");
  if (forged.length && forgedSeen === null) forgedSeen = firstLoad ? -1 : now;
  $("offerings").textContent = doc.score.offerings.length;
  $("height").textContent = doc.score.as_of_height.toLocaleString("en-US");
  $("skipped").textContent = doc.score.skipped.filter((s) => s.reason === "flagged").length;
  $("refused").textContent = forged.length;
  $("render_hash").textContent = doc.render_hash;
  $("score_hash").textContent = doc.score_hash;
  $("pins").textContent = (doc.render.decoder.matches_pin && doc.render.voice.matches_pin)
    ? "decoder and voice match the pinned builds" : "WARNING: decoder or voice differs from the pinned build";
  $("status").textContent = `evoked at height ${doc.score.as_of_height}`;
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
  const now = performance.now();
  Creature.draw(c.getContext("2d"), body, t, W, H, {
    age: (tx) => (tx in firstSeen ? (now - firstSeen[tx]) / 1000 : 99),
    forgedAge: () => (forgedSeen === null ? null : forgedSeen < 0 ? 99 : (now - forgedSeen) / 1000),
  });
  const f = body.forgedScreen;
  $("not_the_god").style.display = f ? "block" : "none";
  if (f) { $("not_the_god").style.left = `${f.x / devicePixelRatio}px`; $("not_the_god").style.top = `${f.y / devicePixelRatio}px`; $("not_the_god").style.opacity = f.fade; }
  requestAnimationFrame(frame);
}

// Whisper Back: click a chamber -> ask the server for that offering's reply request (read from the wallet DB on demand)
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

$("play").addEventListener("click", () => (playing ? (stop(), $("play").textContent = "evoke") : play()));
loadBrand().then(loadScore);
setInterval(loadScore, 5000);
requestAnimationFrame(frame);
