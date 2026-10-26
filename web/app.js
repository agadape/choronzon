// Listener page: loads config/brand.json + out/score.json + out/mix.wav, mounts the god (three.js, web/god.js;
// Canvas 2D creature.js without WebGL), fills the grimoire leaf (web/leaf.js), plays the buffer. WebAudio only PLAYS
// the offline mix; nothing is mixed here (browser mixing is not bit-exact). The god and the leaf are pure functions
// of score.json: a new render_hash mounts a new god and re-cuts the leaf.
"use strict";

const $ = (id) => document.getElementById(id);
const README = "https://github.com/agadape/";           // + slug; anchors below point into the generated README
const ZECBLOCK = "https://testnet.zecblock.com/block/";
const fmt = (n) => Number(n).toLocaleString("en-US");
const blocks = (h) => h.match(/.{1,8}/g) || [];
let audioCtx = null, source = null, startedAt = 0, playing = false, currentHash = null, currentDoc = null;
let body = { chambers: [], conductors: [], forged: [], silenced: [], spine: 70, count: 0 };
let buffer = null, pendingWav = null, brand = null;
const firstSeen = {};            // tx -> performance.now() when this page first drew it (fallback creature only)
let forgedSeen = null;
let god = null;                  // the three.js god (web/god.js), or null on the Canvas 2D fallback
const CALM = matchMedia("(prefers-reduced-motion: reduce)").matches;
const Q = new URLSearchParams(location.search);
// keyboard hints ("· G", "· F", "· T", "· E", "· R") mean nothing on a touch screen: drop them there
const TOUCH = matchMedia("(hover: none), (pointer: coarse)").matches;
const hint = (s) => (TOUCH ? s.replace(/\s·\s[A-Z]$/, "") : s);
for (const id of ["open_leaf", "close_leaf", "flip", "tear", "open_eye2"]) { const b = document.getElementById(id); if (b) b.textContent = hint(b.textContent); }
// séance mode (?seance): the great eye's lids are shut and the hashes sealed until the operator opens the Eye
const SEANCE = Q.has("seance");
let eyeOpenedAt = null;          // performance.now() when the lids started to part; null = not started
let eyeOpen = !SEANCE;           // hashes (and the key) show only once the lids are open
if (SEANCE) document.body.classList.add("sealed");
if (Q.has("bare")) document.body.classList.add("bare");   // stills: the god and its name only (web/og.png is one)
// static snapshot (Vercel): static.json next to index.html marks a build with no wallet and no key behind it
let STATIC = null;
// ?stats: a small readout of the god's weight (draw calls, triangles, fps) for measuring against the budget
let STATS = null, statsAt = 0;
if (Q.has("stats")) {
  STATS = document.createElement("div"); STATS.id = "stats";
  STATS.style.cssText = innerWidth <= 900   // phone: a thin strip in the top-left corner, above the title
    ? "position:fixed;top:0;left:0;max-width:100vw;overflow:hidden;white-space:nowrap;z-index:9;font:10px/1.2 Georgia,serif;color:#ebdfc2;background:rgba(5,3,2,.7);padding:2px 6px;pointer-events:none"
    : "position:fixed;top:8px;left:8px;z-index:9;font:13px Georgia,serif;color:#ebdfc2;background:rgba(5,3,2,.7);padding:4px 8px;pointer-events:none";
  document.body.appendChild(STATS);
}

async function fetchJSON(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

function hashBlocks(el, hash, sealed) {
  el.textContent = "";
  for (const b of blocks(hash)) {
    const span = document.createElement("span");
    span.textContent = sealed ? "········" : b;
    if (sealed) span.className = "sealed";
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
    $("snapshot").textContent = `This leaf is a snapshot: rendered ${when} at height ${fmt(STATIC.as_of_height)}; ` +
      `the installation re-renders every block.`;
    // a snapshot cannot whisper back: one quiet line instead of an input box
    $("whisper_text").remove();
    $("whisper_label").textContent = "whisper back";
    $("whisper_status").textContent = "works at the installation: it reads the reply address from a wallet, never from this page.";
    if (STATIC.key && STATIC.key.file === "key.txt") loadKey(Number(STATIC.key.birthday));
    if (STATIC.choir && window.Give) Give.enable(STATIC.choir);    // "give it a secret": the public page only
  }
}

// The choir's full viewing key, published deliberately (from 24 Oct): key.txt next to the page, written by the
// publisher from the secret, never from the repo. Shown on the leaf's verso and in the Eye panel with a copy button
// and the command that summons the god from it.
let KEY = null;
const KEY_RE = /^(uview|uvf)[a-z]*1[02-9ac-hj-np-z]{40,}$/;
async function loadKey(birthday) {
  let key;
  try { const r = await fetch("key.txt", { cache: "no-store" }); if (!r.ok) return; key = (await r.text()).trim(); } catch (e) { return; }
  if (!KEY_RE.test(key) || !(birthday > 0)) return;
  KEY = { key, birthday };
  const cmd = `python3 -m renderer summon --key-file key.txt --birthday ${birthday} --wallet wallets/watcher`;
  for (const el of document.querySelectorAll(".key_text")) el.textContent = key;
  for (const el of document.querySelectorAll(".key_birthday")) el.textContent = fmt(birthday);
  for (const el of document.querySelectorAll(".key_cmd")) el.textContent = cmd;
  $("key_block").hidden = false;
  $("eye_key").textContent = key;
  $("eye_birthday").textContent = `· birthday height ${birthday}`;
  $("eye_cmd").textContent = cmd;
  $("eye_keyinfo").hidden = false;
}
async function copyKey(btn) {
  if (!KEY) return;
  try { await navigator.clipboard.writeText(KEY.key); btn.textContent = "copied"; }
  catch (e) {                                                     // no clipboard permission: select it instead
    const el = btn.closest("#eye") ? $("eye_key") : document.querySelector(".key_text");
    const range = document.createRange(); range.selectNodeContents(el);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range); btn.textContent = "selected: copy it";
  }
  setTimeout(() => { btn.textContent = btn.closest("#eye") ? "copy the key" : "copy"; }, 2500);
}
for (const b of document.querySelectorAll(".key_copy")) b.addEventListener("click", () => copyKey(b));

// OpenTimestamps: anchor.json is the statement of a render (hashes, height, counts, commit); anchor.json.ots is the
// proof. Pending or in Bitcoin is read from the proof itself (its attestation tags), never assumed.
const OTS_BITCOIN = [0x05, 0x88, 0x96, 0x0d, 0x73, 0xd7, 0x19, 0x01], OTS_PENDING = [0x83, 0xdf, 0xe3, 0x0d, 0x2e, 0xf9, 0x0c, 0x8e];
function otsStatus(bytes) {
  const find = (tag, from) => { outer: for (let i = from; i + 8 <= bytes.length; i++) { for (let j = 0; j < 8; j++) if (bytes[i + j] !== tag[j]) continue outer; return i; } return -1; };
  const varint = (p) => { let v = 0, s = 0; while (bytes[p] & 0x80) { v += (bytes[p++] & 0x7f) * Math.pow(2, s); s += 7; } return [v + bytes[p] * Math.pow(2, s), p + 1]; };
  const heights = [];
  for (let i = find(OTS_BITCOIN, 0); i >= 0; i = find(OTS_BITCOIN, i + 8)) {
    const [, p] = varint(i + 8);                 // after the tag: varint payload length, then varint block height
    heights.push(varint(p)[0]);
  }
  return { bitcoin: heights, pending: find(OTS_PENDING, 0) >= 0 };
}
async function loadAnchor(doc) {
  const el = $("anchor");
  let st, base = "", raw = null;
  const getRaw = async (url) => { const r = await fetch(url, { cache: "no-store" }); if (!r.ok) throw new Error(r.status); return new Uint8Array(await r.arrayBuffer()); };
  try { raw = await getRaw("anchor.json"); }
  catch (e) {
    try { raw = await getRaw("out/anchor.json"); base = "out/"; }   // the installation: python3 -m anchor statement --to out/anchor.json
    catch (e2) { el.textContent = "No anchor statement on this server (the public site carries one, stamped in Bitcoin with OpenTimestamps)."; return; }
  }
  try { st = JSON.parse(new TextDecoder().decode(raw)); } catch (e) { el.textContent = "The anchor statement on this server could not be read."; return; }
  const same = st.render_hash === doc.render_hash && st.score_hash === doc.score_hash;
  let proof = "no proof file yet", proofState = { bitcoin: [], pending: false, served: false };
  try {
    const r = await fetch(`${base}anchor.json.ots`, { cache: "no-store" });
    if (r.ok) {
      const s = otsStatus(new Uint8Array(await r.arrayBuffer()));
      proofState = { bitcoin: s.bitcoin, pending: s.pending && !s.bitcoin.length, served: true };
      // the served proof is the one made at deploy time: say what it held then, not what the anchor is now
      proof = s.bitcoin.length ? `proof as served: in Bitcoin, block ${s.bitcoin.map(fmt).join(", ")}`
            : s.pending ? "proof as served: pending at deploy" : "proof as served: no attestation read";
    }
  } catch (e) { /* no proof */ }
  el.textContent = (same ? `Anchored: statement anchor/1 for height ${fmt(st.as_of_height)} carries these two hashes, ${st.offerings} offerings, commit ${String(st.repo_commit).slice(0, 7)}. `
                         : `Anchor statement is for height ${fmt(st.as_of_height)} (render ${String(st.render_hash).slice(0, 8)}…), not this render. `)
    + `OpenTimestamps: ${proof}. Verify: python3 -m anchor verify anchor.json.`;
  // the upgraded proof lives on the append-only anchors branch as <height>-<sha256(anchor.json)[:16]>.json.ots
  const repo = `https://github.com/agadape/${brand ? brand.slug : ""}`;
  const note = document.createElement("span");
  note.append(" Proof made at deploy; any OpenTimestamps verifier fetches its Bitcoin confirmation from the calendars. ");
  const tree = document.createElement("a"); tree.href = `${repo}/tree/anchors`; tree.target = "_blank"; tree.rel = "noopener";
  tree.textContent = "Upgraded proofs"; note.append(tree, " (public from 28 Oct)");
  try {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", raw));
    const short = Array.from(digest.slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
    const one = document.createElement("a"); one.href = `${repo}/blob/anchors/${st.as_of_height}-${short}.json.ots`;
    one.target = "_blank"; one.rel = "noopener"; one.textContent = "this one";
    note.append(", ", one);
  } catch (e) { /* no WebCrypto (plain http on another host): the branch link alone */ }
  note.append(".");
  el.append(note);
  return { ...st, proof: proofState };
}

// recompute render_hash here from the audio you hear (web/verify.js) and compare it with every published copy
async function verifyHere(doc, wavBytes, anchorP) {
  const el = $("verify_line");
  if (!window.Verify || !(window.crypto && crypto.subtle)) { el.textContent = "This browser cannot hash the audio here (WebCrypto needs https or localhost)."; return; }
  let res;
  const anchor = await anchorP;      // a statement for another height is another render (the anchor line says so), not a mismatch
  const sameHeight = (x) => x && Number(x.as_of_height) === Number(doc.score.as_of_height);
  try { res = await Verify.check({ wav: wavBytes, score: doc, statik: STATIC && STATIC.static && sameHeight(STATIC) ? STATIC : null, anchor: sameHeight(anchor) ? anchor : null }); }
  catch (e) { el.textContent = `Could not recompute the render hash here: ${e.message}`; el.className = "bad"; return; }
  if (currentHash !== doc.render_hash) return;                    // a newer render arrived meanwhile
  const short = `${res.computed.slice(0, 8)}…${res.computed.slice(-8)}`, names = res.checks.map((c) => c.name).join(", ");
  if (res.ok) {
    // what this proves, exactly: the audio here hashes to the render hash every copy publishes; it does not re-derive
    // the score hash from the chain (a Watcher with the key does that)
    const anchored = res.checks.some((c) => c.name === "anchor.json"), p = anchored && anchor.proof;
    el.className = "quiet";
    el.textContent = `Recomputed in this browser: SHA-256(score hash ‖ the audio you hear ‖ ${doc.render.composer}) = ${short}. ` +
      `The audio you hear matches this snapshot's hashes (${names})` + (anchored ? " and the anchored statement" : "") + ". " +
      (!anchored ? "" : p.bitcoin.length ? `The proof served with it is in Bitcoin, block ${p.bitcoin.map(fmt).join(", ")}. `
        : p.pending ? "The Bitcoin proof served with this snapshot is still pending: the calendars have it, Bitcoin does not yet. "
        : "No Bitcoin proof is served with this snapshot. ") +
      "The score hash is taken from the snapshot; anyone with the key can re-derive it from the chain.";
  } else {
    const bad = res.checks.filter((c) => !c.render || !c.score).map((c) => c.name).join(", ");
    el.className = "bad";
    el.textContent = `MISMATCH: recomputed ${short} from the audio here, but ${bad} says otherwise. Do not trust this snapshot; re-render from the key.`;
  }
}

// the god: three.js when WebGL2 is there, else the Canvas 2D creature (same score, same meaning)
// A canvas can hold one kind of context for its whole life: once the fallback has drawn with '2d' on it,
// getContext('webgl2') returns null forever (and the other way round). So every mount gets a fresh <canvas>.
function freshCanvas() {
  const old = $("creature"), c = document.createElement("canvas");
  c.id = "creature"; c.className = old.className;
  old.replaceWith(c);
  c.addEventListener("click", onCanvasClick);
  return c;
}
let godRetried = false, godWaited = false;

// ---- the visitor's own pending offerings (web/pending.js): an overlay in this browser only, never in a hash
let pendingStore = null; try { pendingStore = window.localStorage; } catch (e) { pendingStore = null; }
let pendingCids = [];
function refreshPending(doc) {
  if (!pendingStore || !window.Pending) return;
  let list = Pending.load(pendingStore, Date.now());
  if (doc) {
    const rec = Pending.reconcile(list, doc.render.timeline);
    for (const o of rec.opened) Pending.remove(pendingStore, o.cid, Date.now());
    if (rec.opened.length) {                               // a snapshot carries it now: the real eye opens and burns
      forgedFound = null;
      const o = rec.opened[rec.opened.length - 1];
      found = doc.render.timeline.find((x) => x.tx === o.tx) || null;
      if (god) god.setFocus(o.tx);
      $("find_q").value = o.tx; $("find_play").hidden = !found;
      const note = $("opened_note");
      note.textContent = `Your offering #${o.cid} has opened. Its eye burns; the others turn to it.`;
      note.hidden = false; setTimeout(() => { note.hidden = true; }, 15000);
    }
    list = Pending.load(pendingStore, Date.now());
  }
  pendingCids = list.map((e) => e.cid);
  if (god) god.setPending(pendingCids);
  const box = $("pending_labels"); box.textContent = "";
  for (const cid of pendingCids) {
    const d = document.createElement("div"); d.className = "pending_label"; d.style.display = "none";
    d.textContent = innerWidth <= 600 ? `yours · pending · #${cid}` : `yours · pending · offering #${cid}`; box.append(d);
  }
}
addEventListener("pending-changed", () => refreshPending(currentDoc));
function placePendingLabels() {
  const labels = $("pending_labels").children;
  if (!labels.length) return;
  const pts = god ? god.pendingScreen() : [];
  for (let i = 0; i < labels.length; i++) {
    const p = pts[i], el = labels[i];
    if (!p || !p.front) { el.style.display = "none"; continue; }
    el.style.display = ""; el.style.left = `${Math.round(p.x)}px`; el.style.top = `${Math.round(p.y)}px`;
    el.classList.toggle("left", p.x > innerWidth * 0.55);   // on the right half the label sits left of the eye
  }
}
// the god stops drawing once the page has scrolled past it (phones: reading the leaf); it keeps its last frame
let godOffscreen = false;
if ("IntersectionObserver" in window) {
  new IntersectionObserver((entries) => {
    godOffscreen = !entries[0].isIntersecting;
    if (god) god.setPaused(godOffscreen);
  }).observe(document.querySelector(".void"));
}
function mountGod(doc) {
  if (window.God && God.supported()) {
    if (god) god.dispose();
    try {
      god = God.mount(freshCanvas(), doc, { reducedMotion: CALM });
      document.body.classList.add("webgl");
      window.__god = god;
      god.setPaused(godOffscreen);
      if (found || forgedFound) god.setFocus(found ? found.tx : forgedFound);   // a #tx= link may be answered before the god mounts
      god.setPending(pendingCids);
      leafOffset();
      return;
    } catch (e) { god = null; document.body.classList.remove("webgl"); }
  } else if (!window.God && !godWaited) {
    // on a real network score.json lands before god.js + three (~680 KB): give the module a moment before the fallback
    godWaited = true;
    setTimeout(() => { if (!god && currentDoc && !body.count) mountGod(currentDoc); }, 6000);
    return;
  }
  if (god) { god.dispose(); god = null; }
  if (!body.count) freshCanvas();                          // the 2D fallback needs a canvas no WebGL context has touched
  body = Creature.grow(doc.render.timeline, doc.score.offerings, doc.score.skipped);
  // a WebGL context can fail while the GPU process is still starting: ask once more before settling for the fallback
  if (window.God && !godRetried) { godRetried = true; setTimeout(() => { if (!god && currentDoc && God.supported()) mountGod(currentDoc); }, 2000); }
}
addEventListener("god-ready", () => { if (currentDoc && !god) mountGod(currentDoc); });

async function loadScore() {
  let doc;
  try { doc = await fetchJSON("out/score.json"); }
  catch (e) { $("status").textContent = "nothing has been evoked yet"; return; }
  if (doc.render_hash === currentHash) return;
  const firstLoad = currentHash === null;
  currentHash = doc.render_hash; currentDoc = doc;
  mountGod(doc);
  Leaf.setHashes(doc.render_hash, doc.score_hash);
  const now = performance.now();
  for (const c of body.chambers) if (!(c.tx in firstSeen)) firstSeen[c.tx] = firstLoad ? now - 60000 : now;
  const forged = doc.score.skipped.filter((s) => s.reason === "forged-conductor");
  if (forged.length && forgedSeen === null) forgedSeen = firstLoad ? -1 : now;
  const height = Number(doc.score.as_of_height), n = doc.score.offerings.length;
  const silenced = doc.score.skipped.filter((s) => s.reason === "flagged").length;
  const godLines = doc.score.offerings.filter((o) => o.conductor).length;
  $("over").textContent = `evoked at height ${fmt(height)}`;
  // "refused forgeries": lines that claim the god's own voice without coming from the choir wallet (score.json cannot
  // say who sent them, so the label does not claim they were tests)
  $("tally").textContent = `${n} offerings · ${godLines} the god's own · ${forged.length} refused ${forged.length === 1 ? "forgery" : "forgeries"} · ${silenced} silenced`;
  const name = trueName(doc.render_hash);                  // the god's true name: a pure function of the hash
  $("true_name").textContent = "";
  if (eyeOpen) { $("true_name").append("it is now called "); const g = document.createElement("span"); g.className = "gilt"; g.textContent = name; $("true_name").append(g); }
  else $("true_name").textContent = "its name is sealed until the Eye opens";
  $("stubline").textContent = eyeOpen ? `height ${fmt(height)} · ${blocks(doc.render_hash)[0]} … ${blocks(doc.render_hash)[7]}` : `height ${fmt(height)}`;
  $("eye_name").textContent = `it is now called ${name}`;
  hashBlocks($("render_hash"), doc.render_hash, !eyeOpen);
  hashBlocks($("score_hash"), doc.score_hash, !eyeOpen);
  hashBlocks($("eye_render_hash"), doc.render_hash, false);
  $("colophon").textContent = eyeOpen
    ? `Evoked from the public viewing key at height ${fmt(height)}. Anyone holding the key re-renders the whole work and gets these same two hashes: the score from chain data alone, the render from the score, the pinned decoder and the composer.`
    : `Evoked at height ${fmt(height)}. The hashes stay sealed until the Eye opens.`;
  $("pins").textContent = `composer ${doc.render.composer} · codec2 ${doc.render.decoder.codec2_tag} · espeak-ng ${doc.render.voice.espeak_ng} · sox ${doc.render.voice.sox}`
    + ((doc.render.decoder.matches_pin && doc.render.voice.matches_pin) ? " · decoder and voice match the pinned builds" : " · WARNING: decoder or voice differs from the pinned build");
  $("link_block").href = ZECBLOCK + height;
  $("status").textContent = `${n === 0 ? "nothing has been given yet" : "evoked"} at height ${fmt(height)}`;
  const anchorP = loadAnchor(doc);
  if (firstLoad) setTimeout(findFromHash, 0);              // #tx= / #offering= in the link
  refreshPending(doc);                                     // the visitor's own pending eyes; opens those it now carries
  // the mix is ~5 MB and only changes with the render: fetched by render hash, so the browser (and the CDN) may keep it
  const r = await fetch(`out/mix.wav?r=${doc.render_hash.slice(0, 16)}`, { cache: "default" });
  const ab = await r.arrayBuffer();
  verifyHere(doc, new Uint8Array(ab.slice(0)), anchorP);          // a copy: decoding detaches the buffer
  if (audioCtx) buffer = await audioCtx.decodeAudioData(ab);
  else pendingWav = ab;
}

const playButtons = () => [$("play"), $("play2")];
function setPlaying(on, label) {
  playing = on;
  for (const b of playButtons()) { b.textContent = label; b.classList.toggle("live", on); }
}
// play the whole mix, or one stretch of it (from / length in samples at 8 kHz: one offering's voice)
async function play(fromSample = 0, samples = 0) {
  forgedFound = null;                                      // a voice sounds now: the forgery is no longer the one marked
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (pendingWav) { buffer = await audioCtx.decodeAudioData(pendingWav); pendingWav = null; }
  }
  if (!buffer) return;
  stop();
  const s = audioCtx.createBufferSource();
  source = s;
  s.buffer = buffer;
  s.connect(audioCtx.destination);
  s.onended = () => { if (source === s) { source = null; setPlaying(false, "Listen again"); if (god) god.setFocus(null); } };
  const from = fromSample / 8000;
  startedAt = audioCtx.currentTime - from;           // the timeline position stays sample-exact for the god
  if (samples > 0) s.start(0, from, samples / 8000); else s.start(0, from);
  setPlaying(true, "Silence");
}

function stop() {
  if (source) { try { source.stop(); } catch (e) { /* already stopped */ } source = null; }
  setPlaying(false, "Listen");
}

function frame(now) {
  const t = playing ? Math.floor((audioCtx.currentTime - startedAt) * 8000) : -1;
  // the Eye (séance): the great eye's lids part over ~3 s and stay open
  let lids = SEANCE ? 0 : 1;
  if (eyeOpenedAt !== null) { const a = Math.min(1, (now - eyeOpenedAt) / 3000); lids = a * a * (3 - 2 * a); }
  if (god) {
    god.setPlayT(t); god.setEyeOpen(lids);
    if (STATS && now - statsAt > 500) {                   // ?stats: draw calls, triangles, fps, DPR (budget: spec §3)
      statsAt = now; const s = god.stats();
      const size = `${s.bw}×${s.bh}`, mode = s.mode === "adaptive" ? "" : ` · ${s.mode}`;
      STATS.textContent = innerWidth <= 900
        ? `${size} · dpr ${s.dpr} · ${s.fps || 0} fps${mode} · ${s.calls}c ${Math.round(s.triangles / 1000)}k`
        : `${size} · dpr ${s.dpr} (hd ${s.hd}, max ${s.cap}) · ${s.fps || 0} fps${mode} · ${s.calls} calls · ${fmt(s.triangles)} tris · msaa ${s.msaa}${s.phone ? " · phone path" : ""}`;
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
  Leaf.frame(now);
  placePendingLabels();
  if (god) {                                                // NOT THE GOD under a found forgery's burning red eye
    const m = forgedFound ? god.markScreen() : null, p = m && m.blind ? m : null, el = $("not_the_god");   // only on a forgery's eye
    el.style.display = p ? "block" : "none";
    if (p) { el.style.left = `${Math.round(p.x)}px`; el.style.top = `${Math.round(p.y + 22)}px`; el.style.opacity = 1; }
  }
  requestAnimationFrame(frame);
}

// the grimoire: the leaf slides in from the right; the god's view glides left by (leaf + 80) / 2 (desktop only)
function leafOffset() {
  const open = !document.body.classList.contains("closed") && innerWidth > 900;
  if (god) god.setViewOffset(open ? ((Leaf.width() || 430) + 80) / 2 : 0);
}
function setLeaf(open) {
  if (innerWidth <= 900) {                                 // phone: the leaf is always there, below the fold
    if (open) document.querySelector(".column").scrollIntoView({ behavior: CALM ? "auto" : "smooth" });
    return;
  }
  document.body.classList.toggle("closed", !open); leafOffset();
}
$("open_leaf").addEventListener("click", () => setLeaf(true));
$("close_leaf").addEventListener("click", () => setLeaf(false));
addEventListener("leaf-layout", leafOffset);
// the god picks its detail level (PHONE path) when mounted: crossing the 900 px line mounts it again
let narrowAtMount = innerWidth <= 900;
addEventListener("resize", () => {
  leafOffset();
  if (god && currentDoc && (innerWidth <= 900) !== narrowAtMount) { narrowAtMount = innerWidth <= 900; mountGod(currentDoc); }
});
if (Q.has("leaf")) setLeaf(true);

// the leaf: turn (F), tear the stub (T / drag), reprint (R)
Leaf.init({ leaf: $("leaf"), top: $("top"), stub: $("stub"), verso: $("versopart") }, {
  onTorn(torn) {
    $("tear").textContent = hint(torn ? "reprint the stub · R" : "tear the stub · T");
    $("note").textContent = torn ? "Torn along the render hash: every jag of this edge is one of its bytes. A stub from any other evocation of this god fits this edge exactly; a stub from a different god does not." : "";
  },
});
$("flip").addEventListener("click", () => Leaf.turn());
$("tear").addEventListener("click", () => (Leaf.isGone() ? Leaf.reprint() : Leaf.tear()));
if (Q.has("verso")) Leaf.turn(true);   // for stills of the colophon
if (Q.has("tear")) setTimeout(Leaf.tear, 800);   // for stills of the torn leaf

// Whisper Back: click an eye. At the installation the local server reads that offering's reply address from the
// wallet DB on demand (POST: the whisper never sits in a URL or a log). The public snapshot publishes no reply
// addresses (CLAUDE.md section 6): for an offering that asked for a whisper it shows how to answer it from your own
// machine with the published key instead.
async function whisper(txid) {
  if (STATIC && STATIC.static) return whisperFromHere(txid);
  const text = ($("whisper_text") && $("whisper_text").value.trim()) || "you are not alone.";
  const r = await fetch(`whisper/${txid}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
  if (!r.ok) { $("whisper_status").textContent = "this offering asked for no whisper"; $("qr").innerHTML = ""; return; }
  const w = await r.json();
  $("whisper_status").textContent = `scan with your wallet to whisper back to offering ${txid.slice(0, 12)}…: this reply goes to ` +
    "the address in the offering; for a kiosk offering that is the kiosk's session wallet";
  $("qr").innerHTML = w.qr_svg;
  $("whisper_uri").textContent = w.uri;
}
function whisperFromHere(txid) {
  const o = currentDoc && currentDoc.score.offerings.find((x) => x.tx === txid);
  if (!o) return;
  const box = $("qr"); box.textContent = ""; $("whisper_uri").textContent = "";
  const p = document.createElement("p");
  if (!o.has_reply) { p.textContent = `Offering ${txid.slice(0, 12)}… asked for no whisper back.`; box.append(p); return; }
  p.textContent = `Offering ${txid.slice(0, 12)}… asked for a whisper back. This page never publishes reply addresses; ` +
    "answer it from your own machine with the key (summon the god from the key first, then type the whisper at the prompt):";
  const code = document.createElement("code");
  code.textContent = `python3 -m renderer whisper ${txid} --wallet wallets/watcher`;
  box.append(p, code);
}

function onCanvasClick(ev) {
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
}
$("creature").addEventListener("click", onCanvasClick);
$("whisper_close").addEventListener("click", () => { $("qr").innerHTML = ""; $("whisper_status").textContent = ""; $("whisper_uri").textContent = ""; });

// the Eye opens (séance): the lids part, then the key (if this server publishes one) and the hashes
async function openEye() {
  if (eyeOpenedAt !== null) return;
  eyeOpenedAt = performance.now();
  stop();
  $("open_eye").style.display = "none"; $("open_eye2").style.display = "none";
  let eye = null;
  if (STATIC && STATIC.static) {           // a snapshot has no key behind it: the Eye reveals the hashes only
    if (!KEY) $("eye_key").textContent = "this snapshot carries no key";   // with key.txt, loadKey() already filled it
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
    currentHash = null;                 // re-fill the leaf unsealed on the next poll (the god itself is unchanged)
    loadScore();
    if (eye) {
      $("eye_key").textContent = eye.key;
      $("eye_qr").innerHTML = eye.qr_svg;
      $("eye_birthday").textContent = eye.birthday ? `· birthday height ${eye.birthday}` : "";
    }
    $("eye").classList.add("on");
  }, 3500);
}
$("open_eye").addEventListener("click", openEye); $("open_eye2").addEventListener("click", openEye);
$("eye_close").addEventListener("click", () => $("eye").classList.remove("on"));
if (SEANCE && Q.has("open")) setTimeout(openEye, 1500);   // for stills of the Eye opening
document.addEventListener("keydown", (ev) => {
  if (ev.target && /INPUT|TEXTAREA/.test(ev.target.tagName)) return;
  const k = ev.key.toLowerCase();
  if (k === "e" && SEANCE) openEye();
  if (k === "g") setLeaf(document.body.classList.contains("closed"));
  if (k === "f") Leaf.turn(false);
  if (k === "t") (Leaf.isGone() ? Leaf.reprint() : Leaf.tear());
  if (k === "r") Leaf.reprint();
});

for (const b of playButtons()) b.addEventListener("click", () => (playing ? stop() : play()));

// Find my offering: by its transaction id (64 hex, as wallets and explorers show it) or the number the give panel
// showed (contrib_id). From the leaf, or a fragment: #tx=<txid> or #offering=<number>. Never a ?query: query strings
// reach the host's logs, fragments never leave the browser.
let found = null, forgedFound = null;   // forgedFound: the txid of a found refused forgery (its eye is marked NOT THE GOD)
function findOffering(q, autoplay = true) {
  const note = $("find_note");
  found = null; forgedFound = null; $("find_play").hidden = true;
  q = String(q || "").trim().toLowerCase();
  if (!currentDoc) { note.textContent = "the god has not been evoked here yet"; return; }
  const doc = currentDoc, height = fmt(doc.score.as_of_height);
  let hit = null;
  if (/^[0-9a-f]{64}$/.test(q)) hit = doc.render.timeline.find((x) => x.tx === q);
  else if (/^\d{1,10}$/.test(q)) hit = doc.render.timeline.find((x) => x.contrib_id === Number(q));
  else { note.textContent = "give its transaction id (64 characters) or your offering's number"; return; }
  if (hit) {
    const off = doc.score.offerings.find((o) => o.tx === hit.tx);
    const secs = (hit.samples / 8000).toFixed(1), at = Math.floor(hit.start / 8000);
    note.textContent = `Found: mined at height ${fmt(off ? off.height : doc.score.as_of_height)}, ` +
      `it sounds at ${Math.floor(at / 60)}:${String(at % 60).padStart(2, "0")} for ${secs} s. Its eye burns; the others turn to it.`;
    if (god) god.setFocus(hit.tx);
    found = hit; $("find_play").hidden = false;
    if (autoplay) play(hit.start, hit.samples);   // a link opened cold cannot start audio: "hear it" does
    return;
  }
  const skipped = /^[0-9a-f]{64}$/.test(q) && doc.score.skipped.find((s) => s.tx === q);
  if (skipped && skipped.reason === "forged-conductor") {  // the false prophet: its blind red eye burns, marked NOT THE GOD
    note.textContent = `Refused: not paid by the god's own wallet. On chain at height ${fmt(skipped.height)}, it claims the ` +
      "god's voice; anyone with the key can see the payment did not come from the god, so it never sounds. Its blind red eye burns.";
    forgedFound = skipped.tx;
    if (god) god.setFocus(skipped.tx);
    // its eye drifts outside the halos, where the leaf would cover it: show the god, and the verdict over it
    if (innerWidth > 900) setLeaf(false); else scrollTo({ top: 0, behavior: CALM ? "auto" : "smooth" });
    const toast = $("opened_note");
    toast.textContent = "Refused: not paid by the god's own wallet. Its blind red eye burns, marked NOT THE GOD.";
    toast.hidden = false; setTimeout(() => { toast.hidden = true; }, 15000);
    return;
  }
  if (skipped) {
    const why = { "not-protocol": "its memo is not an offering", flagged: "it is silenced (on the open skip list)" }[skipped.reason] || skipped.reason;
    note.textContent = `On chain at height ${fmt(skipped.height)}, but not voiced: ${why}.`;
    if (god) god.setFocus(null);
    return;
  }
  if (/^\d{1,10}$/.test(q)) {   // a number we cannot vouch for: never imply it will appear
    note.textContent = `No offering with this number in this snapshot (height ${height}). Numbers are the random ids shown ` +
      "when you gave it; or use the transaction id. A new offering appears after it is mined and the next render, usually within an hour.";
    return;
  }
  note.textContent = `Not in this snapshot (height ${height}). If you sent it recently: the page is a snapshot rebuilt about ` +
    "every 30 minutes, sometimes later, and a new offering appears after it is mined and the next render.";
}
function findFromHash() {
  const m = location.hash.match(/^#(?:tx|offering)=([0-9a-fA-F]{64}|\d{1,10})$/);
  if (!m) return;
  $("find_q").value = m[1];
  setLeaf(true);
  findOffering(m[1], false);
}
$("find").addEventListener("submit", (e) => { e.preventDefault(); findOffering($("find_q").value); });
$("find_play").addEventListener("click", () => { if (found) { if (god) god.setFocus(found.tx); play(found.start, found.samples); } });
addEventListener("hashchange", findFromHash);
if (window.Give) Give.init();
// Polling: the installation's local server re-renders every block, so it is asked every 5 s. The public snapshot is
// fetched once, then at most every 10 minutes and only while the tab is visible: a steady request heartbeat in the
// host's logs would help anyone correlate visits with offerings by timing.
loadBrand().then(loadStatic).then(loadScore).then(() => {
  const isStatic = STATIC && STATIC.static, every = isStatic ? 600000 : 5000;
  let last = Date.now();
  setInterval(() => {
    if (document.hidden || Date.now() - last < every) return;
    last = Date.now(); loadScore();
  }, isStatic ? 30000 : 5000);
});
requestAnimationFrame(frame);
