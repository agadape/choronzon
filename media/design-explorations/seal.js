// EXPLORATION: the Seal, drawn from score.json. A pure function of the data; `t` (playback position in samples,
// -1 = silent) only decides which cells are gilded. No Math.random(). Reference for the web/ implementation.
"use strict";
(function () {
  const TAU = Math.PI * 2;
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  // same splitmix-style integer hash as web/creature.js
  function genes(seed, n, count) {
    let h = (seed ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0; const out = [];
    for (let i = 0; i < count; i++) {
      h = (h + 0x9e3779b9) >>> 0; let z = h;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0; z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
      out.push(((z ^ (z >>> 16)) >>> 0) / 4294967296);
    }
    return out;
  }
  // fixed caps, never relative to the current corpus: an old sigil never changes when new offerings arrive
  function build(score) {
    const god = new Set(score.offerings.filter((o) => o.conductor).map((o) => o.tx));
    const items = score.timeline.map((p, n) => ({
      loud: clamp01((p.energy - 500) / 1000), bright: clamp01((p.zero_crossings - 1500) / 1700),
      secs: clamp01((p.samples / 8000 - 2) / 6), pan: (p.pan - 8) / 8, layer: p.pitch_layer,
      g: genes(p.contrib_id, n, 12), start: p.start, end: p.start + p.samples, silent: p.silent, tx: p.tx, god: god.has(p.tx),
    }));
    return { regular: items.filter((i) => !i.god), gods: items.filter((i) => i.god), hash: score.render_hash };
  }
  // draw(ctx, body, size, t, C): C = colours {ink, sepia, gilt, deep}, fonts {caps}
  function draw(ctx, body, S, t, C) {
    const cx = S / 2, cy = S / 2, R = S * 0.48;
    const on = (it) => t >= it.start && t < it.end;
    ctx.clearRect(0, 0, S, S); ctx.lineCap = "round"; ctx.lineJoin = "round";
    const caps = []; let left = body.regular.length;
    for (let r = 0; left > 0 || r < 2; r++) { caps.push(7 * (r + 1)); left -= 7 * (r + 1); }
    const rim0 = R * 0.86, r0 = R * 0.26, w = (rim0 - r0) / caps.length;
    ctx.strokeStyle = C.ink; ctx.lineWidth = Math.max(1, S / 420);
    for (const rr of [R, R * 0.975, rim0, rim0 - S / 220]) { ctx.beginPath(); ctx.arc(cx, cy, rr, 0, TAU); ctx.stroke(); }
    ctx.strokeStyle = C.sepia; ctx.lineWidth = 1;
    for (let r = 0; r <= caps.length; r++) { ctx.beginPath(); ctx.arc(cx, cy, r0 + r * w, 0, TAU); ctx.stroke(); }
    let k = 0;
    caps.forEach((cap, r) => {
      for (let j = 0; j < cap; j++) {
        const a0 = -Math.PI / 2 + (j / cap) * TAU, a1 = a0 + TAU / cap, am = (a0 + a1) / 2;
        const ri = r0 + r * w, ro = ri + w, rm = (ri + ro) / 2;
        ctx.strokeStyle = C.sepia; ctx.lineWidth = 1; ctx.globalAlpha = 0.8;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a0) * ri, cy + Math.sin(a0) * ri); ctx.lineTo(cx + Math.cos(a0) * ro, cy + Math.sin(a0) * ro); ctx.stroke();
        ctx.globalAlpha = 1;
        const it = body.regular[k++];
        if (!it) {   // a cell not yet written
          ctx.fillStyle = C.sepia; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(cx + Math.cos(am) * rm, cy + Math.sin(am) * rm, 1.2, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
          continue;
        }
        const sing = on(it);
        if (sing) {
          ctx.fillStyle = C.gilt; ctx.globalAlpha = 0.18; ctx.beginPath();
          ctx.arc(cx, cy, ro, a0, a1); ctx.arc(cx, cy, ri, a1, a0, true); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
        }
        if (it.silent) {   // silenced: the cell is sealed with ink, the sigil is not written
          ctx.fillStyle = C.sepia; ctx.globalAlpha = 0.45; ctx.beginPath();
          ctx.arc(cx, cy, ro, a0, a1); ctx.arc(cx, cy, ri, a1, a0, true); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
          continue;
        }
        const arc = rm * (TAU / cap), box = Math.min(w, arc) * (0.48 + 0.3 * it.secs);
        ctx.save(); ctx.translate(cx + Math.cos(am) * rm, cy + Math.sin(am) * rm); ctx.rotate(am + Math.PI / 2 + it.pan * 0.35);
        const n = 3 + Math.round(it.bright * 4), pts = []; let prev = -1;
        for (let i = 0; i < n; i++) {
          let idx = Math.floor(it.g[i] * 9); if (idx === prev) idx = (idx + 4) % 9; prev = idx;
          pts.push([((idx % 3) - 1) * box / 2, (Math.floor(idx / 3) - 1) * box / 2]);
        }
        ctx.strokeStyle = sing ? C.gilt : C.ink; ctx.lineWidth = (0.9 + it.loud * 1.9) * S / 520;
        ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
        ctx.beginPath(); ctx.arc(pts[0][0], pts[0][1], box * 0.09, 0, TAU); ctx.stroke();
        const [ex, ey] = pts[n - 1], [px, py] = pts[n - 2], L = Math.hypot(ex - px, ey - py) || 1;
        ctx.beginPath(); ctx.moveTo(ex - (ey - py) / L * box * 0.12, ey + (ex - px) / L * box * 0.12); ctx.lineTo(ex + (ey - py) / L * box * 0.12, ey - (ex - px) / L * box * 0.12); ctx.stroke();
        ctx.fillStyle = C.sepia;
        for (let d = 0; d < it.layer; d++) { ctx.beginPath(); ctx.arc((d - (it.layer - 1) / 2) * 5, -box * 0.5 - 6, 1.3, 0, TAU); ctx.fill(); }
        ctx.restore();
      }
    });
    const godSing = body.gods.some(on);
    const hv = (i, rr) => [cx + Math.cos(-Math.PI / 2 + i * TAU / 7) * rr, cy + Math.sin(-Math.PI / 2 + i * TAU / 7) * rr];
    ctx.strokeStyle = godSing ? C.gilt : C.ink; ctx.lineWidth = Math.max(1.2, S / 330);
    ctx.beginPath(); for (let i = 0; i <= 7; i++) { const [x, y] = hv(i, r0 * 0.86); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke();
    ctx.beginPath(); for (let i = 0; i <= 7; i++) { const [x, y] = hv(i * 3, r0 * 0.86); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke();
    ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, r0 * 0.3, 0, TAU); ctx.stroke();
    body.gods.forEach((g, i) => {
      const [x, y] = hv(i, r0 * 0.86 + (i >= 7 ? S / 75 : 0));
      ctx.fillStyle = on(g) ? C.gilt : C.ink; ctx.beginPath(); ctx.arc(x, y, S / 160, 0, TAU); ctx.fill();
    });
    ctx.fillStyle = C.deep; ctx.beginPath(); ctx.arc(cx, cy, r0 * 0.12, 0, TAU); ctx.fill(); ctx.stroke();
    // the render hash, inscribed round the rim in 8-character words
    const text = body.hash.match(/.{8}/g).join(" · ").toUpperCase() + " · ";
    ctx.fillStyle = C.ink; ctx.font = `${Math.round(R * 0.05)}px ${C.caps}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const rt = (R * 0.975 + rim0) / 2 + 1;
    [...text].forEach((ch, i) => {
      const a = -Math.PI / 2 + (i / text.length) * TAU;
      ctx.save(); ctx.translate(cx + Math.cos(a) * rt, cy + Math.sin(a) * rt); ctx.rotate(a + Math.PI / 2); ctx.fillText(ch, 0, 0); ctx.restore();
    });
  }
  window.Seal = { build, draw };
})();
