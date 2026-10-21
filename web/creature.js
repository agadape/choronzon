// The creature: a deterministic body grown from the ordered offerings. G_n = F(G_{n-1}, A_n, I_n).
// A_n = integer features from score.json (energy, zero_crossings, samples); I_n = contrib_id.
// No Math.random() anywhere: the same score.json draws the same body on every machine.
"use strict";

const TAU = Math.PI * 2;

// Integer hash of contrib_id -> a few deterministic "genes" (angle, length, curl) for each limb.
function genes(contribId, n) {
  let h = (contribId ^ (n * 0x9e3779b1)) >>> 0;
  const out = [];
  for (let i = 0; i < 4; i++) {
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
    out.push(((h ^ (h >>> 16)) >>> 0) / 4294967296);
  }
  return out;
}

// Grow the body: one limb per offering, each attached to the previous state's frontier.
function grow(timeline) {
  const limbs = [];
  let frontierAngle = -TAU / 4;      // start growing upward
  let mass = 0;
  timeline.forEach((p, n) => {
    const [gA, gL, gC, gS] = genes(p.contrib_id, n);
    const loud = Math.min(1, p.energy / 2500);            // 0..1
    const bright = Math.min(1, p.zero_crossings / 4000);  // 0..1
    const seconds = p.samples / 8000;
    const parent = limbs.length ? limbs[(n * 7 + Math.floor(gS * n)) % limbs.length] : null;
    const angle = (parent ? parent.angle : frontierAngle) + (gA - 0.5) * TAU / 3;
    const length = 40 + seconds * 18 + loud * 60;
    const limb = {
      n, tx: p.tx, start: p.start, end: p.start + p.samples, silent: p.silent,
      x0: parent ? parent.x1 : 0, y0: parent ? parent.y1 : 0,
      angle, length, curl: (gC - 0.5) * 1.6, width: 3 + loud * 10,
      eye: bright > 0.45, hue: 200 + bright * 120, pan: p.pan,
    };
    limb.x1 = limb.x0 + Math.cos(angle) * length;
    limb.y1 = limb.y0 + Math.sin(angle) * length;
    limbs.push(limb);
    frontierAngle = angle;
    mass += length;
  });
  return { limbs, mass };
}

function draw(ctx, body, t, W, H) {
  // t = playback position in samples (or -1 when not playing)
  ctx.clearRect(0, 0, W, H);
  if (!body.limbs.length) {
    ctx.fillStyle = "#1a1620";
    ctx.beginPath(); ctx.arc(W / 2, H / 2, 6, 0, TAU); ctx.fill();
    return;
  }
  // fit the body into the canvas
  let minX = 0, maxX = 0, minY = 0, maxY = 0;
  for (const l of body.limbs) {
    minX = Math.min(minX, l.x0, l.x1); maxX = Math.max(maxX, l.x0, l.x1);
    minY = Math.min(minY, l.y0, l.y1); maxY = Math.max(maxY, l.y0, l.y1);
  }
  const scale = Math.min((W * 0.8) / Math.max(1, maxX - minX), (H * 0.8) / Math.max(1, maxY - minY), 2.5);
  const ox = W / 2 - ((minX + maxX) / 2) * scale, oy = H / 2 - ((minY + maxY) / 2) * scale;
  const breath = 1 + 0.04 * Math.sin((t >= 0 ? t : 0) / 8000 * TAU / 4);

  ctx.lineCap = "round";
  for (const l of body.limbs) {
    const singing = t >= l.start && t < l.end;
    const pulse = singing ? 1 + 0.35 * Math.sin((t - l.start) / 8000 * TAU * 2) : 1;
    const x0 = ox + l.x0 * scale, y0 = oy + l.y0 * scale;
    const x1 = ox + l.x1 * scale * breath, y1 = oy + l.y1 * scale * breath;
    l.sx1 = x1; l.sy1 = y1;   // screen position of the tip, for click hit-testing (Whisper Back)
    const cx = (x0 + x1) / 2 + Math.cos(l.angle + TAU / 4) * l.curl * l.length * scale * 0.5;
    const cy = (y0 + y1) / 2 + Math.sin(l.angle + TAU / 4) * l.curl * l.length * scale * 0.5;
    ctx.strokeStyle = l.silent ? "#3a3340" : `hsl(${l.hue} ${singing ? 80 : 35}% ${singing ? 62 : 38}%)`;
    ctx.lineWidth = l.width * scale * pulse;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, cy, x1, y1); ctx.stroke();
    if (l.eye) {
      ctx.fillStyle = singing ? "#f5e9c8" : "#8a8070";
      ctx.beginPath(); ctx.arc(x1, y1, (2 + l.width * 0.4) * scale * pulse, 0, TAU); ctx.fill();
      ctx.fillStyle = "#0b0a0f";
      ctx.beginPath(); ctx.arc(x1, y1, 1.2 * scale, 0, TAU); ctx.fill();
    }
  }
}

window.Creature = { grow, draw };
