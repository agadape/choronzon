// The reliquary organism: a body made of chambers, grown deterministically from the ordered offerings.
// G_n = F(G_{n-1}, A_n, I_n): every offering adds one sealed chamber to the existing anatomy and never leaves.
// Three visual states: permanent structure (all chambers), active structure (the one chamber whose voice is
// sounding), exceptional structure (conductor = the central membrane, forged = a refused outline, silenced =
// an opaque sealed chamber). No Math.random(): the same score.json draws the same body on every machine.
"use strict";

const TAU = Math.PI * 2;
const K = 24;                       // contour samples per chamber (bounded detail per offering)
const RANGES = { energy: 2500, zc: 4000, seconds: 8 };   // normalisation caps: one loud offering must not dominate

// deterministic 0..1 values from contrib_id (integer hash, splitmix-style)
function genes(seed, n, count) {
  let h = (seed ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0;
  const out = [];
  for (let i = 0; i < count; i++) {
    h = (h + 0x9e3779b9) >>> 0;
    let z = h;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    out.push(((z ^ (z >>> 16)) >>> 0) / 4294967296);
  }
  return out;
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// One chamber's contour: an organic lobe around centre (cx, cy), long axis `len` along `angle`, half-width `thick`.
function lobe(cx, cy, angle, len, thick, g) {
  const pts = [];
  for (let i = 0; i < K; i++) {
    const th = (i / K) * TAU;
    // seeded wobble: three low harmonics, bounded so the lobe stays convex-ish
    const w = 1 + 0.10 * Math.sin(2 * th + g[0] * TAU) + 0.06 * Math.sin(3 * th + g[1] * TAU) + 0.04 * Math.sin(5 * th + g[2] * TAU);
    const lx = Math.cos(th) * (len / 2) * w, ly = Math.sin(th) * thick * w;
    pts.push([cx + lx * Math.cos(angle) - ly * Math.sin(angle), cy + lx * Math.sin(angle) + ly * Math.cos(angle)]);
  }
  return pts;
}

// Grow the body from the timeline (+ offerings for the conductor flag, + skipped for forged / silenced).
function grow(timeline, offerings, skipped) {
  const flags = {};
  for (const o of offerings || []) flags[o.tx] = o;
  const chambers = [], conductors = [];
  const rootKids = { left: 0, right: 0 };
  let spine = 70 + Math.min(timeline.length, 24) * 5;   // the central membrane grows with the body
  const w0 = 34 + Math.min(timeline.length, 24) * 1.2;  // its half-width
  const rootX = (y) => w0 * Math.sqrt(Math.max(0, 1 - (y / spine) ** 2)) * 0.98;   // root surface at height y
  timeline.forEach((p, n) => {
    const g = genes(p.contrib_id, n, 8);
    const loud = clamp01(p.energy / RANGES.energy), bright = clamp01(p.zero_crossings / RANGES.zc);
    const secs = clamp01(p.samples / 8000 / RANGES.seconds);
    const base = { n, tx: p.tx, start: p.start, end: p.start + p.samples, silent: p.silent, pan: p.pan, g };
    if (flags[p.tx] && flags[p.tx].conductor) {           // the god's own voice: a band of the central membrane
      conductors.push({ ...base, y: -spine + 20 + conductors.length * 34, thick: 10 + loud * 14, ribs: 2 + Math.round(bright * 5) });
      spine += 17;
      return;
    }
    // attachment: the side of the root membrane with fewer chambers, or an earlier chamber on that side that has
    // the fewest children (never the two most recent ones, so the body branches instead of forming a chain)
    const side = p.pan < 8 ? -1 : p.pan > 8 ? 1 : (g[3] < 0.5 ? -1 : 1);
    const sideKey = side < 0 ? "left" : "right";
    const candidates = chambers.slice(0, Math.max(0, chambers.length - 2)).filter((c) => c.side === side && c.depth < 2 && c.kids < 2);
    let parent = null;
    if (candidates.length && rootKids[sideKey] >= 3) {       // the first chambers of each side sit on the membrane
      const minKids = Math.min(...candidates.map((c) => c.kids));
      if (g[4] < 0.7) {
        const pool = candidates.filter((c) => c.kids === minKids);
        parent = pool[Math.floor(g[5] * pool.length) % pool.length];
      }
    }
    const len = 46 + secs * 100 + loud * 18, thick = 12 + loud * 22;
    let ax, ay, angle, depth = 0;
    if (!parent) {
      // root chambers take evenly spaced slots along the spine (top to bottom, alternating around the middle),
      // so they never pile up; pitch_layer only nudges the slot
      const slot = rootKids[sideKey]++;
      const order = [0, 4, 2, 6, 1, 5, 3, 7, 8, 9, 10, 11];
      const pos = (order[slot % order.length] + 0.5) / 8 + Math.floor(slot / 12) * 0.04;
      ay = (pos * 2 - 1) * spine * 0.86 + (p.pitch_layer - 1) * 6;
      ax = side * rootX(ay);                                 // on the membrane's surface, not inside it
      angle = (side > 0 ? 0 : Math.PI) + (ay / spine) * side * 0.55 + (g[7] - 0.5) * 0.5;
    } else {
      parent.kids++;
      depth = parent.depth + 1;
      angle = parent.angle + (parent.kids === 1 ? -1 : 1) * (0.55 + g[7] * 0.45);
      if (Math.cos(angle) * side < 0.15) angle = parent.angle + (parent.kids === 1 ? 1 : -1) * 0.6;   // keep growing outward
      ax = parent.cx + Math.cos(parent.angle) * (parent.len / 2) * 0.85 + Math.cos(angle) * 3;
      ay = parent.cy + Math.sin(parent.angle) * (parent.len / 2) * 0.85 + Math.sin(angle) * 3;
    }
    // bounded, deterministic collision pass: rotate away from chambers that would overlap, then shrink a little
    let cx = ax + Math.cos(angle) * (len / 2), cy = ay + Math.sin(angle) * (len / 2);
    let L = len;
    const gap = 10;
    const hits = () => chambers.some((c) => Math.hypot(c.cx - cx, c.cy - cy) < (c.len + L) / 4 + (c.thick + thick) / 2 + gap)
                       || Math.abs(cx) < rootX(Math.max(-spine, Math.min(spine, cy))) + L / 4;
    for (let tries = 0; tries < 10 && hits(); tries++) {
      angle += (tries % 2 === 0 ? 1 : -1) * (0.36 * (tries + 1)) * (g[5] < 0.5 ? 1 : -1);
      if (tries >= 6) L *= 0.9;
      cx = ax + Math.cos(angle) * (L / 2); cy = ay + Math.sin(angle) * (L / 2);
    }
    const lenFinal = L;
    chambers.push({ ...base, parent, side, depth, kids: 0, ax, ay, cx, cy, angle, len: lenFinal, thick,
                    ribs: 2 + Math.round(bright * 7), outer: lobe(cx, cy, angle, lenFinal, thick, g),
                    inner: lobe(cx, cy, angle, lenFinal * 0.58, thick * 0.55, g) });
  });
  const forged = (skipped || []).filter((s) => s.reason === "forged-conductor");
  const silenced = (skipped || []).filter((s) => s.reason === "flagged").map((s, i) => {
    const g = genes(parseInt(s.tx.slice(0, 8), 16) >>> 0, i, 8);
    const angle = Math.PI / 2 + (g[0] - 0.5) * 1.2, len = 40, thick = 14;
    const cx = Math.cos(angle) * (spine + 10), cy = Math.sin(angle) * (spine + 10);
    return { tx: s.tx, outer: lobe(cx, cy, angle, len, thick, g) };
  });
  return { chambers, conductors, forged, silenced, spine, w0, count: timeline.length };
}

function tokens() {
  const s = getComputedStyle(document.documentElement);
  const v = (name, fallback) => (s.getPropertyValue(name) || fallback).trim();
  return { void: v("--void", "#171916"), bone: v("--bone", "#E4DFD0"), ash: v("--ash", "#777F79"), anomaly: v("--anomaly", "#FF6338") };
}

function path(ctx, pts, close = true, fraction = 1) {
  // smooth closed curve through midpoints; `fraction` < 1 draws only the first part (a chamber still forming)
  const n = Math.max(2, Math.floor(pts.length * fraction));
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = pts[i % pts.length], b = pts[(i + 1) % pts.length];
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    if (i === 0) ctx.moveTo(mx, my); else ctx.quadraticCurveTo(a[0], a[1], mx, my);
  }
  if (close && fraction >= 1) ctx.closePath();
}

// draw(ctx, body, t, W, H, opts): t = playback position in samples (-1 = silent); opts.age(tx) = seconds since
// the page first saw this chamber (arrival animation), opts.forgedAge = seconds since a forgery was first seen,
// opts.safe = [top, bottom] in device px: the band between header and footer that the body must fit into.
function draw(ctx, body, t, W, H, opts = {}) {
  const T = tokens();
  const dpr = devicePixelRatio || 1;
  ctx.fillStyle = T.void; ctx.fillRect(0, 0, W, H);
  const spine = body.spine || 70, w0b = body.w0 || 12;
  const items = [...body.chambers.map((c) => c.outer), ...body.silenced.map((s) => s.outer),
                 [[-w0b, -spine], [w0b, spine]]];
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const pts of items) for (const [x, y] of pts) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  // fit into the safe band (between header and footer), never larger than ~1.4 CSS px per body unit
  const [top, bottom] = opts.safe || [0, H];
  const boxW = W * 0.9, boxH = Math.max(80, (bottom - top) * 0.96);
  let scale = Math.min(boxW / Math.max(1, maxX - minX), boxH / Math.max(1, maxY - minY), 2.0 * dpr);
  if (!isFinite(scale) || scale <= 0) scale = dpr;
  const ox = W / 2 - ((minX + maxX) / 2) * scale, oy = (top + bottom) / 2 - ((minY + maxY) / 2) * scale;
  const X = (x) => ox + x * scale, Y = (y) => oy + y * scale;
  const alive = body.count > 0;
  const sp = spine, w0 = alive ? w0b : 12;
  body.scale = scale;
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  const sec = t >= 0 ? t / 8000 : 0;
  // the Eye opens: a thin aperture widens across the body (opts.aperture 0..1); outside it the body is only a trace
  ctx.save();
  if (opts.aperture !== undefined && opts.aperture < 1) {
    const cy = (top + bottom) / 2, half = Math.max(2 * dpr, (bottom - top) * 0.6 * opts.aperture);
    // the sealed body, barely there: drawBody manages its own alpha, so dim it through the colours instead
    const dim = { ...T, bone: "#2c2e2a", ash: "#232522" };
    drawBody(ctx, body, t, W, H, dim, dpr, X, Y, w0, sp, sec, { ...opts, forgedAge: () => 99 });
    ctx.beginPath(); ctx.rect(0, cy - half, W, 2 * half); ctx.clip();
    ctx.fillStyle = T.void; ctx.fillRect(0, cy - half, W, 2 * half);
    drawBody(ctx, body, t, W, H, T, dpr, X, Y, w0, sp, sec, opts);
    ctx.restore();
    ctx.strokeStyle = T.bone; ctx.globalAlpha = 0.5; ctx.lineWidth = 1 * dpr;
    ctx.beginPath(); ctx.moveTo(0, cy - half); ctx.lineTo(W, cy - half); ctx.moveTo(0, cy + half); ctx.lineTo(W, cy + half); ctx.stroke();
    ctx.globalAlpha = 1;
    body.forgedScreen = null;
    return;
  }
  ctx.restore();
  drawBody(ctx, body, t, W, H, T, dpr, X, Y, w0, sp, sec, opts);
}

function drawBody(ctx, body, t, W, H, T, dpr, X, Y, w0, sp, sec, opts) {
  const alive = body.count > 0;

  // --- the central membrane: nearly nothing before the first offering, a continuous body after -----------------
  const root = [];
  for (let i = 0; i < 2 * K; i++) {
    const th = (i / (2 * K)) * TAU;
    const wob = 1 + 0.05 * Math.sin(3 * th + 1.3) + 0.03 * Math.sin(7 * th);
    root.push([Math.cos(th) * w0 * wob, Math.sin(th) * sp * wob]);
  }
  const rootPts = root.map(([x, y]) => [X(x), Y(y)]);
  ctx.globalAlpha = 1; ctx.fillStyle = T.void; path(ctx, rootPts); ctx.fill();   // the membrane occludes what is behind
  ctx.strokeStyle = alive ? T.bone : T.ash; ctx.globalAlpha = alive ? 1 : 0.5;
  ctx.lineWidth = (alive ? 2.8 : 1.2) * dpr;
  if (alive) { ctx.shadowColor = T.bone; ctx.shadowBlur = 10 * dpr; }
  path(ctx, rootPts); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = T.ash; ctx.lineWidth = 1.3 * dpr; ctx.globalAlpha = alive ? 0.9 : 0.35;
  path(ctx, root.map(([x, y]) => [X(x * 0.6), Y(y * 0.88)])); ctx.stroke();
  ctx.globalAlpha = 1;

  // the god's own lines: bands of the central membrane; the sounding band contracts
  for (const c of body.conductors) {
    const singing = t >= c.start && t < c.end;
    const squeeze = singing ? 1 - 0.25 * (0.5 + 0.5 * Math.sin((sec - c.start / 8000) * TAU * 1.6)) : 1;
    ctx.strokeStyle = singing ? T.bone : T.ash; ctx.lineWidth = (singing ? 2.4 : 1.4) * devicePixelRatio;
    ctx.beginPath();
    ctx.moveTo(X(-w0 * 0.78 * squeeze), Y(c.y - c.thick / 2));
    ctx.bezierCurveTo(X(-w0 * 0.3), Y(c.y - c.thick), X(w0 * 0.3), Y(c.y - c.thick), X(w0 * 0.78 * squeeze), Y(c.y - c.thick / 2));
    ctx.moveTo(X(-w0 * 0.78 * squeeze), Y(c.y + c.thick / 2));
    ctx.bezierCurveTo(X(-w0 * 0.3), Y(c.y + c.thick), X(w0 * 0.3), Y(c.y + c.thick), X(w0 * 0.78 * squeeze), Y(c.y + c.thick / 2));
    ctx.stroke();
    c.sx = X(0); c.sy = Y(c.y);
  }

  // --- chambers: drawn root-first; each chamber is filled with the void so nearer ones occlude what is behind ---
  // depth gives weight and opacity (generation 0 heaviest), the sounding chamber glows; time only modulates
  const weights = [2.4, 1.9, 1.5], alphas = [1, 0.85, 0.7];
  for (const c of body.chambers) {
    const singing = t >= c.start && t < c.end;
    const age = opts.age ? opts.age(c.tx) : 99;
    const forming = Math.min(1, age / 1.6);                       // arrival: the contour is drawn from its attachment
    const phase = singing ? (sec - c.start / 8000) * TAU * 1.8 : 0;
    const d0 = Math.min(c.depth, 2);
    // the active chamber: a single inward pressure wave travelling along the contour
    const outer = c.outer.map(([x, y], i) => {
      if (!singing) return [X(x), Y(y)];
      const d = 0.07 * c.thick * Math.max(0, Math.sin(phase - i * (TAU / K)));
      return [X(x + (c.cx - x) / c.thick * d), Y(y + (c.cy - y) / c.thick * d)];
    });
    const innerScale = singing ? 1 - 0.18 * (0.5 + 0.5 * Math.sin(phase)) : 1;
    const inner = c.inner.map(([x, y]) => [X(c.cx + (x - c.cx) * innerScale), Y(c.cy + (y - c.cy) * innerScale)]);
    // attachment: a short neck from the parent surface to the chamber
    ctx.strokeStyle = T.ash; ctx.lineWidth = 1.3 * dpr; ctx.globalAlpha = 0.8 * alphas[d0];
    ctx.beginPath(); ctx.moveTo(X(c.ax), Y(c.ay)); ctx.lineTo(X(c.cx - Math.cos(c.angle) * c.len * 0.38), Y(c.cy - Math.sin(c.angle) * c.len * 0.38)); ctx.stroke();
    // body of the chamber: void fill (occludes lines behind it), a faint inner warmth when it sings
    if (forming >= 1) {
      ctx.globalAlpha = 1; ctx.fillStyle = T.void; path(ctx, outer); ctx.fill();
      if (singing) { ctx.fillStyle = T.bone; ctx.globalAlpha = 0.10 + 0.06 * Math.sin(phase); path(ctx, outer); ctx.fill(); }
      if (c.silent) { ctx.fillStyle = T.ash; ctx.globalAlpha = 0.18; path(ctx, outer); ctx.fill(); }
    }
    // outer contour, with a soft deterministic glow for the sounding chamber
    ctx.strokeStyle = c.silent ? T.ash : T.bone; ctx.globalAlpha = c.silent ? 0.55 : alphas[d0];
    ctx.lineWidth = (singing ? weights[d0] + 1.0 : weights[d0]) * dpr;
    if (singing) { ctx.shadowColor = T.bone; ctx.shadowBlur = 18 * dpr; }
    path(ctx, outer, true, forming); ctx.stroke();
    ctx.shadowBlur = 0;
    if (forming >= 1) {
      // inner membrane + ribs between the membranes (detail for close viewing)
      ctx.strokeStyle = T.ash; ctx.lineWidth = 1.2 * dpr; ctx.globalAlpha = (c.silent ? 0.35 : 0.85) * alphas[d0];
      path(ctx, inner); ctx.stroke();
      ctx.globalAlpha = (singing ? 1 : 0.6) * alphas[d0];
      for (let r = 0; r < c.ribs; r++) {
        const i = Math.floor(((r + 0.5) / c.ribs) * (K / 2));           // ribs on the far half of the lobe
        const [x1, y1] = outer[(i + K - K / 4) % K], [x2, y2] = inner[(i + K - K / 4) % K];
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 + (x2 - x1) * 0.8, y1 + (y2 - y1) * 0.8); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    c.sx = X(c.cx); c.sy = Y(c.cy);
  }

  // --- silenced: sealed, opaque, no pulse ---------------------------------------------------------------------------
  for (const s of body.silenced) {
    const pts = s.outer.map(([x, y]) => [X(x), Y(y)]);
    ctx.fillStyle = T.ash; ctx.globalAlpha = 0.25; path(ctx, pts); ctx.fill();
    ctx.strokeStyle = T.ash; ctx.globalAlpha = 0.8; ctx.lineWidth = 1.4 * devicePixelRatio; path(ctx, pts); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // --- forged: a disconnected outline that cannot join the body, then gone -----------------------------------------
  const fa = opts.forgedAge ? opts.forgedAge() : null;
  if (body.forged.length && fa !== null && fa < 9) {
    const fade = fa < 7 ? 1 : (9 - fa) / 2;
    const g = genes(parseInt(body.forged[0].tx.slice(0, 8), 16) >>> 0, 0, 4);
    const cx = w0 + 150 + g[0] * 40, cy = -sp * 0.95 + g[1] * 40;
    const pts = lobe(cx, cy, -0.45, 120, 30, g).map(([x, y]) => [X(x), Y(y)]);
    ctx.strokeStyle = T.ash; ctx.globalAlpha = 0.9 * fade; ctx.lineWidth = 1.6 * devicePixelRatio;
    path(ctx, pts, false, 0.78); ctx.stroke();                     // the contour never closes
    ctx.strokeStyle = T.anomaly; ctx.lineWidth = 1.8 * devicePixelRatio;
    const [fx, fy] = pts[Math.floor(K * 0.78)];
    ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + 9 * devicePixelRatio, fy - 14 * devicePixelRatio); ctx.lineTo(fx + 4 * devicePixelRatio, fy - 24 * devicePixelRatio); ctx.stroke();
    ctx.globalAlpha = 1;
    body.forgedScreen = { x: X(cx), y: Y(cy + 30), fade };
  } else body.forgedScreen = null;
}

window.Creature = { grow, draw };
