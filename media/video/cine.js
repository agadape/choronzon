// Camera moves for the video's opening and closing shots. The god is the one in video/god-cine.js (a generated copy
// of web/god.js), built from a score.json snapshot of the chain; only the camera, the great eye's lids and the gaze
// are scripted here. Nothing random: frame n is always the same picture for the same snapshot.
//
//   cine.html?shot=open&t=6.5                 one still at t seconds (for headless screenshots)
//   cine.html?shot=open&render=1&fps=30       every frame, posted to video/serve.py, then POST /done
import * as THREE from "three";

const Q = new URLSearchParams(location.search);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// keyframes: t (s), camera position, look-at point, vertical field of view
const SHOTS = {
  // B: from the dark under it, crawling up its flesh and an arm, past the wheels of eyes, then back to the small
  // figure on its rock; the great eye opens as the camera reaches it
  open: {
    length: 16,
    keys: [
      { t: 0,    pos: V(3.0, -6.2, 6.5),  look: V(-0.5, -6.8, -4.0), fov: 40 },
      { t: 4,    pos: V(-0.6, -6.9, 5.2), look: V(-2.5, -4.5, -1.0), fov: 40 },
      { t: 7.5,  pos: V(-1.8, -3.2, 7.0), look: V(-0.4, -0.6, 0.0), fov: 38 },
      { t: 10.5, pos: V(0.3, -0.6, 7.8),  look: V(0.0, 0.1, 0.0),  fov: 36 },
      { t: 13.5, pos: V(2.2, -6.4, 14.5), look: V(0.0, 1.0, 0.0),  fov: 42 },
      { t: 16,   pos: V(1.2, -6.2, 17.0), look: V(0.0, 1.3, 0.0),  fov: 42 },
    ],
    lids: (t) => smooth(9.0, 11.5, t),
    stare: (t) => t > 6.5,
  },
  // the god listening: a slow push in while the mix plays from ?at= seconds; the eye that sings is the voice heard
  listen: {
    length: 22,
    keys: [
      { t: 0,  pos: V(-1.2, -6.2, 17.6), look: V(0.0, 1.3, 0.0), fov: 42 },
      { t: 22, pos: V(0.8, -5.0, 14.2),  look: V(0.0, 1.1, 0.0), fov: 40 },
    ],
    lids: () => 1,
    stare: () => false,
    play: (t) => (Number(Q.get("at") || 90) + t) * 8000,
  },
  // the Watcher's god (its own score.json): out of the far dark toward the worshipper's view, the great eye opening
  summon: {
    length: 9,
    keys: [
      { t: 0, pos: V(1.5, -2.0, 52), look: V(0, 1.0, 0), fov: 30 },
      { t: 9, pos: V(0.0, -5.6, 17.6), look: V(0, 1.6, 0), fov: 42 },
    ],
    lids: (t) => smooth(3.5, 7.0, t),
    stare: (t) => t > 6,
  },
  // VI: every eye on you (it sees all that is given to it), then they search for the reply and find nothing; the
  // great eye closes
  whisper: {
    length: 16,
    keys: [
      { t: 0,  pos: V(0.0, -4.8, 15.5), look: V(0, 1.2, 0), fov: 40 },
      { t: 8,  pos: V(0.6, -3.6, 12.4), look: V(0, 0.9, 0), fov: 38 },
      { t: 16, pos: V(-2.8, -5.6, 14.6), look: V(-0.8, 0.6, 0), fov: 40 },
    ],
    lids: (t) => 1 - smooth(10.5, 14.5, t),
    stare: (t) => t < 8,
  },
  // the closing: the god seen whole, then the camera draws away into the dark as the great eye closes
  close: {
    length: 12,
    keys: [
      { t: 0,  pos: V(0.0, -5.8, 16.8), look: V(0.0, 1.4, 0.0), fov: 42 },
      { t: 6,  pos: V(-3.0, -6.6, 24.0), look: V(0.0, 1.0, 0.0), fov: 40 },
      { t: 12, pos: V(-4.5, -7.2, 34.0), look: V(0.0, 0.8, 0.0), fov: 38 },
    ],
    lids: (t) => 1 - smooth(4, 9, t),
    stare: () => true,
  },
};

function smooth(a, b, t) { const x = Math.min(1, Math.max(0, (t - a) / (b - a))); return x * x * (3 - 2 * x); }

// Catmull-Rom through the keys, timed by each key's t; eased so the move starts and ends at rest
function sample(keys, t) {
  const n = keys.length, T = keys[n - 1].t;
  const e = T * smooth(0, 1, t / T) * 0.35 + t * 0.65;                    // soft start and stop
  let i = 0; while (i < n - 2 && e > keys[i + 1].t) i++;
  const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(n - 1, i + 2)];
  const u = Math.min(1, Math.max(0, (e - k1.t) / (k2.t - k1.t)));
  const cr = (a, b, c, d) => { const u2 = u * u, u3 = u2 * u;
    return 0.5 * ((2 * b) + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3); };
  const v = (p) => V(cr(k0[p].x, k1[p].x, k2[p].x, k3[p].x), cr(k0[p].y, k1[p].y, k2[p].y, k3[p].y), cr(k0[p].z, k1[p].z, k2[p].z, k3[p].z));
  return { pos: v("pos"), look: v("look"), fov: k1.fov + (k2.fov - k1.fov) * u };
}

// a single framing for concept stills: ?probe=1&pos=x,y,z&look=x,y,z&fov=..&play=god|<sample>&near=blind:<i>|ring:<i>
const vec = (s) => { const [x, y, z] = s.split(",").map(Number); return V(x, y, z); };
function probeShot(doc, god) {
  let play = -1;
  const p = Q.get("play");
  if (p === "god") {                                                     // the newest line of the god's own voice
    const godTx = new Set(doc.score.offerings.filter((o) => o.conductor).map((o) => o.tx));
    const lines = doc.render.timeline.filter((x) => godTx.has(x.tx));
    if (lines.length) play = lines[lines.length - 1].start + 4000;
  } else if (p) play = Number(p);
  return { length: 1, play, lids: () => Number(Q.get("lids") || 1), stare: () => Q.has("stare"),
    cam: (t) => {
      const near = Q.get("near");
      if (near) {                                                         // frame one eye from just outside it
        const [kind, i] = near.split(":"), eyes = god.eyes().filter((e) => e.kind === kind), e = eyes[(Number(i) + eyes.length) % eyes.length];
        const dist = Number(Q.get("dist") || 1.6);
        const out = e.pos.clone().normalize().add(V(0, 0.18, 0.3)).normalize().multiplyScalar(dist);
        return { pos: e.pos.clone().add(out), look: e.pos.clone(), fov: Number(Q.get("fov") || 34) };
      }
      return { pos: vec(Q.get("pos")), look: vec(Q.get("look")), fov: Number(Q.get("fov") || 40) };
    } };
}

// ?shot=focus&tx=<txid>&len=6: from the worshipper's view the camera closes in on that offering's eye, which burns
// and sings (playback starts 1.5 s before its voice), while every other eye turns to it
function focusShot(doc, god) {
  const tx = Q.get("tx"), it = doc.render.timeline.find((x) => x.tx === tx);
  if (!it) throw new Error(`offering ${tx} is not in this snapshot`);
  const p0 = V(0, -5.8, 16.8), l0 = V(0, 1.4, 0), lead = Number(Q.get("lead") || 1.5);
  god.setFocus(tx);
  return { length: Number(Q.get("len") || 6), lids: () => 1, stare: () => false,
    play: (t) => it.start - lead * 8000 + t * 8000,
    cam: (t) => {
      const e = god.eyes().find((x) => x.tx === tx); if (!e || !e.pos.lengthSq()) return { pos: p0, look: l0, fov: 42 };
      const k = smooth(0.2, Number(Q.get("push") || 5), t), near = e.pos.clone().add(p0.clone().sub(e.pos).normalize().multiplyScalar(Number(Q.get("dist") || 3.4)));
      return { pos: p0.clone().lerp(near, k), look: l0.clone().lerp(e.pos, k), fov: 42 - 8 * k };
    } };
}

// VIII: the camera falls away from the god, faster and faster, until it is a point of light; the great eye closes
function fallShot() {
  const L = 12, fallFor = 6.5;
  return { length: L, lids: (t) => 1 - smooth(2.5, 6, t), stare: () => true,
    cam: (t) => { const k = Math.min(1, t / fallFor), e = k * k * k;
      return { pos: V(0.6 * e, -5.8 - 20 * e, 17 + 168 * e), look: V(0, 1.4 - 1.0 * e, 0), fov: 42 }; } };
}
// VIII: the great eye, close enough to fill the frame, snaps open
function bigEyeShot() {
  return { length: 2, lids: (t) => smooth(0.25, 0.55, t), stare: () => true,
    cam: () => ({ pos: V(0, -0.2, 3.4), look: V(0, 0, 0), fov: 40 }) };
}

// ?shot=voice&tx=<a line of the god's own voice>: the camera rises toward the great eye while that line sounds
function voiceShot(doc) {
  const tx = Q.get("tx"), it = doc.render.timeline.find((x) => x.tx === tx);
  if (!it) throw new Error(`line ${tx} is not in this snapshot`);
  const lead = Number(Q.get("lead") || 1.0);
  return { length: Number(Q.get("len") || 8), lids: () => 1, stare: () => false, play: (t) => it.start - lead * 8000 + t * 8000,
    keys: [
      { t: 0, pos: V(-4.5, -7.0, 15.5), look: V(0, 1.2, 0), fov: 44 },
      { t: Number(Q.get("len") || 8), pos: V(-1.2, -2.6, 9.6), look: V(0, 0.6, 0), fov: 40 },
    ] };
}

// ?shot=blind&tx=<a refused forgery>: from the god the camera swings out to that blind red eye and stops close to it,
// the god behind it
function blindShot(doc, god) {
  const tx = Q.get("tx"); if (!doc.score.skipped.some((s) => s.tx === tx)) throw new Error(`${tx} is not refused in this snapshot`);
  const p0 = V(2.0, -4.6, 13.0), l0 = V(0, 1.0, 0), dist = Number(Q.get("dist") || 0.9);
  const foundAt = Number(Q.get("found") || 4);                       // flickering until the camera finds it, then it holds
  return { length: Number(Q.get("len") || 8), lids: () => 1, stare: () => false, focus: (t) => (t >= foundAt ? tx : null),
    cam: (t) => {
      const e = god.eyes().find((x) => x.kind === "blind" && x.tx === tx); if (!e || !e.pos.lengthSq()) return { pos: p0, look: l0, fov: 42 };
      const out = e.pos.clone().setY(0).normalize(), near = e.pos.clone().addScaledVector(out, dist).add(V(0, dist * 0.25, 0));
      const k = smooth(0.3, Number(Q.get("push") || 5.5), t);
      return { pos: p0.clone().lerp(near, k), look: l0.clone().lerp(e.pos, smooth(0, Number(Q.get("push") || 5.5) * 0.8, t)), fov: 42 - 10 * k };
    } };
}

async function start() {
  const doc = await (await fetch("../snap/score.json")).json();
  const god = window.GodCine.mount(document.getElementById("c"), doc, {});
  const kind = Q.get("shot") || "open";
  const shot = Q.has("probe") ? probeShot(doc, god) : kind === "focus" ? focusShot(doc, god) : kind === "voice" ? voiceShot(doc)
    : kind === "blind" ? blindShot(doc, god) : kind === "fall" ? fallShot() : kind === "bigeye" ? bigEyeShot() : SHOTS[kind];
  const draw = (t) => {
    god.setCamera(shot.cam ? shot.cam(t) : sample(shot.keys, Math.max(0, t)));
    god.setEyeOpen(shot.lids(Math.max(0, t)));
    god.setStare(shot.stare(Math.max(0, t)));
    if (shot.play !== undefined) god.setPlayT(typeof shot.play === "function" ? shot.play(Math.max(0, t)) : shot.play);
    else if (Q.has("playfrom")) god.setPlayT((Number(Q.get("playfrom")) + Math.max(0, t)) * 8000);   // the mix plays from there
    if (shot.focus) god.setFocus(shot.focus(Math.max(0, t)));
    god.renderAt(t);
  };
  const fps = Number(Q.get("fps") || 30);
  if (!Q.has("render")) {
    for (let f = -18; f < 0; f++) draw(f / fps); draw(Number(Q.get("t") || 0)); document.title = "ready";
    if (Q.has("debug")) await fetch("/log", { method: "POST", body: JSON.stringify(god.eyes().filter((e) => e.kind !== "ring").map((e) => [e.kind, (e.tx || "").slice(0, 8), e.pos.toArray().map((v) => +v.toFixed(2))])) });
    return;
  }
  // Every run replays the same frame schedule from -3 s, so a take rendered in chunks (one browser per chunk; headless
  // Edge stalls on long runs) is identical to one rendered in one go: the eyes' gaze carries over from frame to frame.
  const fromF = Math.round(Number(Q.get("from") || 0) * fps), toF = Math.min(Math.round(Number(Q.get("to") || shot.length) * fps), Math.round(shot.length * fps));
  for (let f = -3 * fps; f < fromF; f++) draw(f / fps);
  const from = fromF / fps, to = toF / fps;
  const canvas = document.getElementById("c"), take = Q.get("take") || Q.get("shot") || "open";
  for (let f = fromF; f < toF; f++) {
    draw(f / fps);
    await fetch(`/frame/${take}/${f}`, { method: "POST", body: canvas.toDataURL("image/jpeg", 0.95) });   // toBlob stalls in headless Edge
    if (f % 30 === 0) await fetch("/log", { method: "POST", body: `${take} frame ${f}` });
  }
  await fetch(`/done/${take}`, { method: "POST", body: JSON.stringify({ shot: Q.get("shot") || "open", fps, from, to, render_hash: doc.render_hash }) });
}

const go = () => start().catch((e) => fetch("/log", { method: "POST", body: String(e && e.stack || e) }));
if (window.GodCine) go(); else addEventListener("god-cine-ready", go, { once: true });
