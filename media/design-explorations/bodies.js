// EXPLORATION: three cosmic-horror bodies for the folio, engraved line work on black vellum.
// Each is a pure function of score.json; `t` (playback position in samples, -1 = silent) only gilds what sounds,
// opts.gx/gy (pointer, -1..1) only moves the Eye's gaze. No Math.random(): stars and texture come from the hashes.
"use strict";
(function () {
  const TAU = Math.PI * 2, GA = Math.PI * (3 - Math.sqrt(5));
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  function genes(seed, n, count) {
    let h = (seed ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0; const out = [];
    for (let i = 0; i < count; i++) {
      h = (h + 0x9e3779b9) >>> 0; let z = h;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0; z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
      out.push(((z ^ (z >>> 16)) >>> 0) / 4294967296);
    }
    return out;
  }
  function build(score) {
    const god = new Set(score.offerings.filter((o) => o.conductor).map((o) => o.tx));
    const all = score.timeline.map((p, n) => ({
      loud: clamp01((p.energy - 500) / 1000), bright: clamp01((p.zero_crossings - 1500) / 1700),
      secs: clamp01((p.samples / 8000 - 2) / 6), pan: (p.pan - 8) / 8, layer: p.pitch_layer,
      g: genes(p.contrib_id, n, 12), start: p.start, end: p.start + p.samples, silent: p.silent, tx: p.tx, god: god.has(p.tx),
    }));
    const forged = score.skipped.filter((s) => s.reason === "forged-conductor").map((s, i) => ({ g: genes(parseInt(s.tx.slice(0, 8), 16) >>> 0, i, 8) }));
    return { all, regular: all.filter((i) => !i.god), gods: all.filter((i) => i.god), forged, hash: score.render_hash,
             seed: parseInt(score.render_hash.slice(0, 8), 16) >>> 0 };
  }
  const on = (it, t) => t >= it.start && t < it.end;
  function poly(ctx, pts) { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); }
  function inscribe(ctx, text, cx, cy, r, size, color, font, alpha) {
    ctx.save(); ctx.fillStyle = color; ctx.globalAlpha = alpha; ctx.font = `${size}px ${font}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    [...text].forEach((ch, i) => { const a = -Math.PI / 2 + (i / text.length) * TAU;
      ctx.save(); ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctx.rotate(a + Math.PI / 2); ctx.fillText(ch, 0, 0); ctx.restore(); });
    ctx.restore();
  }
  const hashText = (h) => h.match(/.{8}/g).join(" · ").toUpperCase() + " · ";
  function stars(ctx, b, W, H, cx, cy, keep, C) {
    for (let i = 0; i < 140; i++) {
      const [x, y, s, a] = genes(b.seed, i, 4);
      const px = x * W, py = y * H; if (Math.hypot(px - cx, py - cy) < keep) continue;
      ctx.fillStyle = C.ink; ctx.globalAlpha = 0.15 + a * 0.55; ctx.beginPath(); ctx.arc(px, py, 0.4 + s * s * 1.4, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  // engraved sky: horizontal rules, denser toward the bottom (Doré / Flammarion)
  function sky(ctx, W, H, C, from) {
    ctx.strokeStyle = C.sepia; ctx.lineWidth = 0.6;
    for (let y = H * from, i = 0; y < H; i++) { ctx.globalAlpha = 0.12 + 0.3 * ((y / H - from) / (1 - from)); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); y += Math.max(2.2, 7 - i * 0.12); }
    ctx.globalAlpha = 1;
  }

  /* ---------- the Black Sun: an eclipse whose corona is made of offerings -------------------------------------- */
  function sun(ctx, b, W, H, cx, cy, R, t, C) {
    stars(ctx, b, W, H, cx, cy, R * 0.4, C);
    const r0 = R * 0.34;
    ctx.strokeStyle = C.sepia; ctx.lineWidth = 0.7; ctx.globalAlpha = 0.28;
    for (const k of [1.55, 1.9, 2.4]) { ctx.beginPath(); ctx.ellipse(cx, cy, R * k, R * k * 0.34, -0.32, 0, TAU); ctx.stroke(); }
    ctx.globalAlpha = 1;
    b.regular.forEach((it, n) => {
      const sing = on(it, t);
      const th = -Math.PI / 2 + n * GA + (it.g[0] - 0.5) * 0.08;
      const L = R * (0.5 + 1.25 * it.secs), wb = R * (0.03 + 0.085 * it.loud);
      const bend = it.pan * 0.55 + (it.g[1] - 0.5) * 0.3, waves = 1 + it.bright * 4, amp = R * 0.01 * (1 + it.bright * 2.5);
      if (it.silent) {   // silenced: an absence in the corona
        ctx.fillStyle = C.deep; poly(ctx, [[cx + Math.cos(th - 0.05) * r0, cy + Math.sin(th - 0.05) * r0], [cx + Math.cos(th) * (r0 + L), cy + Math.sin(th) * (r0 + L)], [cx + Math.cos(th + 0.05) * r0, cy + Math.sin(th + 0.05) * r0]]); ctx.fill();
        return;
      }
      const m = 4 + Math.round(it.loud * 6);
      for (let k = 0; k < m; k++) {
        const u = m === 1 ? 0 : k / (m - 1) - 0.5, pts = [];
        for (let i = 0; i <= 30; i++) {
          const s = i / 30, r = r0 * 1.01 + s * L, phi = th + bend * s * s * (L / R) * 0.6;
          const off = u * wb * Math.pow(1 - s, 0.7) * 2 + amp * Math.sin(waves * TAU * s + it.g[2] * TAU) * s;
          pts.push([cx + Math.cos(phi) * r - Math.sin(phi) * off, cy + Math.sin(phi) * r + Math.cos(phi) * off]);
        }
        ctx.strokeStyle = sing ? C.gilt : C.ink; ctx.lineWidth = sing ? 1.1 : 0.75;
        for (let seg = 0; seg < 3; seg++) {   // fades toward the tip
          ctx.globalAlpha = (sing ? 1 : 0.85 - Math.abs(u) * 0.6) * [1, 0.6, 0.28][seg];
          poly(ctx, pts.slice(seg * 10, seg * 10 + 11)); ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    });
    // the disk: absolute black, the limb, the god's own lines as prominences on the limb
    ctx.fillStyle = C.deep; ctx.beginPath(); ctx.arc(cx, cy, r0, 0, TAU); ctx.fill();
    ctx.strokeStyle = C.ink; ctx.lineWidth = 1.8; ctx.stroke();
    ctx.strokeStyle = C.sepia; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(cx, cy, r0 * 0.93, 0, TAU); ctx.stroke();
    b.gods.forEach((gd, i) => {
      const a = -Math.PI / 2 + (i + 0.5) * TAU / b.gods.length, sing = on(gd, t), h = r0 * (0.22 + 0.25 * gd.loud);
      ctx.strokeStyle = sing ? C.gilt : C.ink; ctx.lineWidth = sing ? 1.6 : 1.1;
      for (let k = 0; k < 3; k++) {
        const d = 0.07 + k * 0.035, hh = h * (1 - k * 0.25);
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a - d) * r0, cy + Math.sin(a - d) * r0);
        ctx.bezierCurveTo(cx + Math.cos(a - d * 1.6) * (r0 + hh), cy + Math.sin(a - d * 1.6) * (r0 + hh), cx + Math.cos(a + d * 1.6) * (r0 + hh), cy + Math.sin(a + d * 1.6) * (r0 + hh), cx + Math.cos(a + d) * r0, cy + Math.sin(a + d) * r0);
        ctx.stroke();
      }
    });
    inscribe(ctx, hashText(b.hash), cx, cy, r0 * 0.8, Math.max(9, r0 * 0.085), C.sepia, C.caps, 0.9);
  }

  /* ---------- the Eye (after Redon): an iris whose fibres are offerings ----------------------------------------- */
  function eye(ctx, b, W, H, cx, cy, R, t, C, opts) {
    sky(ctx, W, H, C, 0.55);
    const Re = R * 1.02, ri = Re * 0.5, godSing = b.gods.some((g) => on(g, t));
    const rp = ri * (godSing ? 0.3 : 0.38);
    const sphere = () => { ctx.beginPath(); ctx.arc(cx, cy, Re, 0, TAU); };
    ctx.fillStyle = C.vellum; sphere(); ctx.fill();
    // shading: crossed hatching clipped to the sphere, cleared by an offset light
    ctx.save(); sphere(); ctx.clip();
    ctx.strokeStyle = C.sepia; ctx.lineWidth = 0.7;
    for (const [ang, lit, alpha] of [[0.7, 0.98, 0.8], [-0.5, 0.86, 0.7], [0.1, 0.72, 0.6]]) {
      ctx.globalAlpha = alpha; ctx.beginPath();
      const dx = Math.cos(ang), dy = Math.sin(ang);
      for (let o = -Re; o <= Re; o += 3.2) { ctx.moveTo(cx - dy * o - dx * Re, cy + dx * o - dy * Re); ctx.lineTo(cx - dy * o + dx * Re, cy + dx * o + dy * Re); }
      ctx.stroke(); ctx.globalAlpha = 1;
      ctx.fillStyle = C.vellum; ctx.beginPath(); ctx.arc(cx - Re * 0.22, cy - Re * 0.26, Re * lit, 0, TAU); ctx.fill();
    }
    // the refused false prophets: thin rubric veins creeping in from the rim
    b.forged.forEach((f, i) => {
      const a = (f.g[0] * 0.8 + 0.1) * Math.PI + (i % 2 ? Math.PI : 0), pts = [];
      for (let s = 0; s <= 1; s += 0.05) { const r = Re * (1 - s * (0.32 + f.g[1] * 0.18)); pts.push([cx + Math.cos(a + Math.sin(s * 9 + f.g[2] * 6) * 0.05) * r, cy + Math.sin(a + Math.sin(s * 9 + f.g[2] * 6) * 0.05) * r]); }
      ctx.strokeStyle = C.rubric; ctx.globalAlpha = 0.75; ctx.lineWidth = 0.9; poly(ctx, pts); ctx.stroke(); ctx.globalAlpha = 1;
    });
    ctx.restore();
    ctx.strokeStyle = C.ink; ctx.lineWidth = 1.6; sphere(); ctx.stroke();
    // the iris follows the watcher (interaction only)
    const ix = cx + (opts.gx || 0) * Re * 0.16, iy = cy + (opts.gy || 0) * Re * 0.12;
    ctx.fillStyle = "#120d08"; ctx.beginPath(); ctx.arc(ix, iy, ri, 0, TAU); ctx.fill();
    ctx.strokeStyle = C.sepia; ctx.lineWidth = 0.6; ctx.globalAlpha = 0.35; ctx.beginPath();
    for (let i = 0; i < 220; i++) { const a = (i / 220) * TAU; ctx.moveTo(ix + Math.cos(a) * rp, iy + Math.sin(a) * rp); ctx.lineTo(ix + Math.cos(a) * ri * 0.97, iy + Math.sin(a) * ri * 0.97); }
    ctx.stroke(); ctx.globalAlpha = 1;
    b.regular.forEach((it, n) => {
      const sing = on(it, t), th = n * GA, reach = rp + (ri - rp) * (0.55 + 0.43 * it.secs);
      if (it.silent) { ctx.fillStyle = C.deep; ctx.beginPath(); ctx.ellipse(ix + Math.cos(th) * (rp + ri) / 2, iy + Math.sin(th) * (rp + ri) / 2, (ri - rp) * 0.18, (ri - rp) * 0.07, th, 0, TAU); ctx.fill(); return; }
      const strands = 2 + Math.round(it.loud * 3), kinks = 2 + Math.round(it.bright * 6);
      for (let k = 0; k < strands; k++) {
        const pts = [];
        for (let i = 0; i <= 18; i++) {
          const s = i / 18, r = rp * 1.04 + (reach - rp * 1.04) * s;
          const a = th + (k - (strands - 1) / 2) * 0.016 + it.pan * 0.32 * s + Math.sin(s * kinks * Math.PI + it.g[3] * TAU) * 0.022;
          pts.push([ix + Math.cos(a) * r, iy + Math.sin(a) * r]);
        }
        ctx.strokeStyle = sing ? C.gilt : C.ink; ctx.lineWidth = sing ? 1.3 : 0.8; ctx.globalAlpha = sing ? 1 : 0.8; poly(ctx, pts); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    });
    // collarette: the god's own lines, one lobe each
    const cr = rp + (ri - rp) * 0.32, nl = Math.max(5, b.gods.length), pts = [];
    for (let i = 0; i <= 200; i++) { const a = (i / 200) * TAU; pts.push([ix + Math.cos(a) * cr * (1 + 0.09 * Math.sin(nl * a)), iy + Math.sin(a) * cr * (1 + 0.09 * Math.sin(nl * a))]); }
    ctx.strokeStyle = godSing ? C.gilt : C.ink; ctx.lineWidth = godSing ? 2 : 1.3; poly(ctx, pts); ctx.stroke();
    ctx.strokeStyle = C.deep; ctx.lineWidth = Re * 0.035; ctx.beginPath(); ctx.arc(ix, iy, ri, 0, TAU); ctx.stroke();
    ctx.strokeStyle = C.ink; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(ix, iy, ri + Re * 0.018, 0, TAU); ctx.stroke();
    ctx.fillStyle = C.deep; ctx.beginPath(); ctx.arc(ix, iy, rp, 0, TAU); ctx.fill();
    ctx.fillStyle = C.ink; ctx.globalAlpha = 0.8; ctx.beginPath(); ctx.ellipse(ix - rp * 0.38, iy - rp * 0.42, rp * 0.16, rp * 0.1, -0.6, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    inscribe(ctx, hashText(b.hash), cx, cy, Re * 1.08, Math.max(9, Re * 0.042), C.sepia, C.caps, 0.9);
  }

  /* ---------- the Throat: looking down into it; every offering is one ring of it ---------------------------------- */
  function throat(ctx, b, W, H, cx, cy, R, t, C) {
    const N = b.all.length, Rmax = R * 1.12, q = Math.pow(0.07, 1 / Math.max(1, N - 1));
    const ring = (k) => {   // newest offering = the rim; the oldest lie deepest
      const d = N - 1 - k, r = Rmax * Math.pow(q, d), it = b.all[k];
      const ox = cx + R * 0.16 * Math.sin(d * 0.19), oy = cy + R * 0.1 * Math.sin(d * 0.11 + 1) - R * 0.08 * (1 - Math.pow(q, d));
      const bumps = 3 + Math.round(it.bright * 6), amp = it.god ? 0.01 : 0.025 + 0.03 * it.bright;
      const pts = [];
      for (let i = 0; i <= 96; i++) { const a = (i / 96) * TAU; const rr = r * (1 + amp * Math.sin(bumps * a + it.g[0] * TAU)); pts.push([ox + Math.cos(a) * rr, oy + Math.sin(a) * rr * 0.92]); }
      return { d, r, ox, oy, pts, it };
    };
    const rings = b.all.map((_, k) => ring(k));
    stars(ctx, b, W, H, cx, cy, Rmax * 1.02, C);
    for (let k = N - 1; k >= 0; k--) {   // outermost first, each deeper ring drawn over it
      const { d, r, ox, oy, pts, it } = rings[k], depth = d / Math.max(1, N - 1), sing = on(it, t);
      const shade = Math.round(40 - depth * 36);
      ctx.fillStyle = `rgb(${shade}, ${Math.round(shade * 0.78)}, ${Math.round(shade * 0.55)})`; poly(ctx, pts); ctx.closePath(); ctx.fill();
      // folds of the flesh between this ring and the next one down
      const inner = rings[k - 1];
      if (inner) {
        ctx.strokeStyle = C.sepia; ctx.lineWidth = 0.6; ctx.globalAlpha = 0.55 * (1 - depth * 0.7); ctx.beginPath();
        const folds = 48;
        for (let i = 0; i < folds; i++) { const j = Math.round((i / folds) * 96), [x1, y1] = pts[j], [x2, y2] = inner.pts[j];
          ctx.moveTo(x1, y1); ctx.lineTo(x1 + (x2 - x1) * 0.55, y1 + (y2 - y1) * 0.55); }
        ctx.stroke(); ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = sing ? C.gilt : it.silent ? C.sepia : C.ink; ctx.globalAlpha = sing ? 1 : 0.95 - depth * 0.6;
      ctx.lineWidth = (it.god ? 2.2 : 0.8 + it.loud * 1.4) * (1 - depth * 0.5);
      if (it.silent) ctx.setLineDash([3, 4]);
      poly(ctx, pts); ctx.stroke(); ctx.setLineDash([]);
      if (it.god) { ctx.globalAlpha *= 0.6; ctx.lineWidth *= 0.5; poly(ctx, pts.map(([x, y]) => [ox + (x - ox) * 0.96, oy + (y - oy) * 0.96])); ctx.stroke(); }
      // teeth along the ring, pointing down the throat
      if (!it.god && !it.silent) {
        const teeth = 8 + Math.round(it.bright * 14), len = r * (0.05 + 0.11 * it.loud);
        ctx.fillStyle = sing ? C.gilt : C.ink;
        for (let i = 0; i < teeth; i++) {
          const j = Math.round(((i + it.g[1]) / teeth) * 96) % 96, [x, y] = pts[j], a = Math.atan2(oy - y, ox - x) + it.pan * 0.5, w = len * 0.28;
          ctx.globalAlpha = (sing ? 1 : 0.85) * (1 - depth * 0.75);
          ctx.beginPath(); ctx.moveTo(x - Math.sin(a) * w, y + Math.cos(a) * w);
          ctx.quadraticCurveTo(x + Math.cos(a) * len * 0.6, y + Math.sin(a) * len * 0.6, x + Math.cos(a + 0.25) * len, y + Math.sin(a + 0.25) * len);
          ctx.lineTo(x + Math.sin(a) * w, y - Math.cos(a) * w); ctx.closePath(); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
    const last = rings[0];
    ctx.fillStyle = C.deep; ctx.beginPath(); ctx.arc(last.ox, last.oy, last.r * 0.8, 0, TAU); ctx.fill();
    inscribe(ctx, hashText(b.hash), cx, cy, Rmax * 1.06, Math.max(9, R * 0.045), C.sepia, C.caps, 0.9);
  }

  function draw(ctx, b, W, H, cx, cy, R, t, C, kind, opts = {}) {
    ctx.clearRect(0, 0, W, H); ctx.lineCap = "round"; ctx.lineJoin = "round";
    ({ sun, eye, throat })[kind](ctx, b, W, H, cx, cy, R, t, C, opts);
  }
  window.Bodies = { build, draw };
})();
