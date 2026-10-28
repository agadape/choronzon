// Typography for the video, drawn on a transparent 1920x1080 canvas with the same frame clock as video/cine.js, then
// laid over the god's frames by ffmpeg. The name and tagline come from config/brand.json; every number shown as "real"
// comes from the score snapshot or snap/facts.json (filled from the actual sends). Nothing random: frame n is always
// the same picture.
//
//   overlay.html?take=open_ovl&t=14        one still (grey background) for checking
//   overlay.html?take=open_ovl&render=1     every frame as PNG with alpha, posted to video/serve.py

const Q = new URLSearchParams(location.search);
let KEY = "";                                                  // the published viewing key, only for the key rain
const W = 1920, H = 1080;
const C = { ink: "#ebdfc2", sepia: "#a08a64", gilt: "#d6a94c", giltHi: "#f3d995", rubric: "#d4532c", ember: [255, 140, 60] };
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (a, b, t) => { const x = clamp01((t - a) / (b - a)); return x * x * (3 - 2 * x); };

// ---------------------------------------------------------------- deterministic noise (value noise, 3 octaves)
function h2(x, y) { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = h2(xi, yi), b = h2(xi + 1, yi), c = h2(xi, yi + 1), d = h2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const NOISE = new Float32Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
  NOISE[y * W + x] = 0.55 * vnoise(x / 46, y / 46) + 0.3 * vnoise(x / 13, y / 13) + 0.15 * vnoise(x / 4, y / 4);

// ---------------------------------------------------------------- burn: text appears (or turns to ash) along a noisy ember edge
const off = document.createElement("canvas"); off.width = W; off.height = H;
const octx = off.getContext("2d", { willReadFrequently: true });
const tmp = document.createElement("canvas"); tmp.width = W; tmp.height = H;
const tctx = tmp.getContext("2d");
function burn(ctx, draw, box, p, { ash = false, edge = 0.09 } = {}) {
  octx.clearRect(box.x, box.y, box.w, box.h); draw(octx);
  const img = octx.getImageData(box.x, box.y, box.w, box.h), d = img.data;
  const q = ash ? 1 - p : p;
  for (let y = 0; y < box.h; y++) for (let x = 0; x < box.w; x++) {
    const i = (y * box.w + x) * 4; if (d[i + 3] === 0) continue;
    const n = 0.62 * NOISE[(box.y + y) * W + box.x + x] + 0.38 * (x / box.w);
    const f = q * 1.45 - n;                                  // > 0: shown
    if (f <= 0) { d[i + 3] = 0; continue; }
    if (f < edge) {                                          // the ember edge
      const k = 1 - f / edge;
      d[i] = d[i] + (C.ember[0] - d[i]) * k; d[i + 1] = d[i + 1] + (C.ember[1] - d[i + 1]) * k; d[i + 2] = d[i + 2] + (C.ember[2] - d[i + 2]) * k;
    }
  }
  tctx.clearRect(box.x, box.y, box.w, box.h); tctx.putImageData(img, box.x, box.y);
  ctx.save(); ctx.shadowColor = "rgba(255,120,40,0.55)"; ctx.shadowBlur = 18 * Math.sin(Math.PI * clamp01(q)); ctx.drawImage(tmp, box.x, box.y, box.w, box.h, box.x, box.y, box.w, box.h); ctx.restore();
  if (ash && p > 0 && p < 1) sparks(ctx, box, p);
}
function sparks(ctx, box, p) {                               // ash rising from the text as it goes
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 160; i++) {
    const sx = box.x + h2(i, 7) * box.w, sy = box.y + box.h * (0.3 + 0.5 * h2(i, 9)), born = h2(i, 11) * 0.8;
    const a = (p - born) / 0.45; if (a <= 0 || a >= 1) continue;
    const x = sx + Math.sin(a * 5 + i) * 14 + a * 40 * (h2(i, 13) - 0.3), y = sy - a * (120 + 160 * h2(i, 17));
    ctx.fillStyle = `rgba(255,${150 + 60 * h2(i, 19)},80,${(1 - a) * 0.85})`;
    ctx.beginPath(); ctx.arc(x, y, 1.2 + 1.8 * h2(i, 23), 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- text helpers
function text(c, s, x, y, font, color, { align = "center", shadow = true, spacing = 0 } = {}) {
  c.save(); c.font = font; c.textAlign = align; c.textBaseline = "alphabetic"; c.fillStyle = color;
  if (spacing) c.letterSpacing = `${spacing}px`;
  if (shadow) { c.shadowColor = "rgba(0,0,0,0.85)"; c.shadowBlur = 14; }
  c.fillText(s, x, y); c.restore();
}
function nameWithRubric(c, s, x, y, size) {                  // the first letter in rubric red, like the site
  c.save(); c.font = `${size}px Fell`; c.textBaseline = "alphabetic";
  const w0 = c.measureText(s[0]).width, w = c.measureText(s).width, left = x - w / 2;
  c.shadowColor = "rgba(0,0,0,0.9)"; c.shadowBlur = 24;
  c.fillStyle = C.rubric; c.fillText(s[0], left, y); c.fillStyle = C.ink; c.fillText(s.slice(1), left + w0, y); c.restore();
}

function wrap(c, s, font, maxW) {
  c.save(); c.font = font; const out = []; let line = "";
  for (const w of s.split(" ")) { const tryL = line ? line + " " + w : w; if (c.measureText(tryL).width > maxW && line) { out.push(line); line = w; } else line = tryL; }
  if (line) out.push(line); c.restore(); return out;
}

// ---------------------------------------------------------------- cue kinds
const KIND = {
  chapter(c, t, k) {                                          // top-left: roman numeral, Latin title, English gloss
    const a = smooth(k.from, k.from + 0.8, t) * (1 - smooth(k.to - 0.8, k.to, t)); if (a <= 0) return;
    c.save(); c.globalAlpha = a;
    text(c, k.roman, 96, 132, "64px Fell", C.gilt, { align: "left" });
    text(c, k.latin, 96 + 26 + k.roman.length * 30, 128, "40px FellSC", C.ink, { align: "left", spacing: 3 });
    text(c, k.eng, 98 + 26 + k.roman.length * 30, 166, "italic 26px Fell", C.sepia, { align: "left" });
    c.fillStyle = C.gilt; c.globalAlpha = a * 0.6; c.fillRect(96, 186, 300 * smooth(k.from, k.from + 1.4, t), 1.5);
    c.restore();
  },
  caption(c, t, k) {
    const y = k.y || 900, size = k.size || 46, font = `italic ${size}px Fell`;
    const box = { x: 160, y: Math.round(y - size * 1.4), w: W - 320, h: Math.round(size * 2.2 * (k.lines || 1)) };
    const draw = (cc) => (Array.isArray(k.text) ? k.text : [k.text]).forEach((s, i) => text(cc, s, W / 2, y + i * size * 1.35, font, k.color || C.ink));
    if (t < k.from || t > k.to) return;
    const pin = clamp01((t - k.from) / (k.inDur || 1.6)), pout = clamp01((t - (k.to - (k.outDur || 1.6))) / (k.outDur || 1.6));
    if (pout > 0) burn(c, draw, box, pout, { ash: true });
    else if (pin < 1) burn(c, draw, box, pin);
    else draw(c);
  },
  title(c, t, k) {                                            // the name burns in like paper catching fire
    if (t < k.from) return;
    const y = k.y || 470, box = { x: 260, y: y - 190, w: W - 520, h: 290 };
    const draw = (cc) => { nameWithRubric(cc, k.name, W / 2, y, k.size || 168); text(cc, k.tagline, W / 2, y + 74, "italic 44px Fell", C.giltHi); };
    const p = clamp01((t - k.from) / (k.dur || 2.2)), out = k.to ? clamp01((t - (k.to - 1.4)) / 1.4) : 0;
    const dark = smooth(k.from - 0.6, k.from + 1.2, t) * (1 - out);   // a shadow behind the name, so the god stays behind it
    if (dark > 0) { const g = c.createRadialGradient(W / 2, y - 40, 60, W / 2, y - 40, 760);
      g.addColorStop(0, `rgba(0,0,0,${0.62 * dark})`); g.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = g; c.fillRect(0, 0, W, H); }
    if (out > 0) burn(c, draw, box, out, { ash: true }); else if (p < 1) burn(c, draw, box, p); else draw(c);
  },
  real(c, t, k) {                                              // bottom-left: what this is, from the chain
    const a = smooth(k.from, k.from + 0.6, t) * (1 - smooth(k.to - 0.6, k.to, t)); if (a <= 0) return;
    c.save(); c.globalAlpha = a * 0.78;
    text(c, k.text, 96, H - 64, "22px Consolas, 'Courier New', monospace", C.ink, { align: "left", spacing: 0.5 });
    c.restore();
  },
  gap(c, t, k) {                                               // top-right: a jump in time, said plainly
    const a = smooth(k.from, k.from + 0.4, t) * (1 - smooth(k.to - 0.5, k.to, t)); if (a <= 0) return;
    c.save(); c.globalAlpha = a; c.font = "600 24px Consolas, monospace"; const w = c.measureText(k.text).width;
    c.fillStyle = "rgba(0,0,0,0.6)"; c.fillRect(W - 96 - w - 28, 92, w + 28, 46); c.strokeStyle = "#6f501c"; c.strokeRect(W - 96 - w - 28, 92, w + 28, 46);
    c.fillStyle = C.giltHi; c.textAlign = "right"; c.fillText(k.text, W - 96 - 14, 124); c.restore();
  },
  shade(c, t, k) {                                             // a dark band at the bottom so captions read over the god
    const a = smooth(k.from, k.from + 0.8, t) * (1 - smooth(k.to - 0.8, k.to, t)); if (a <= 0) return;
    const g = c.createLinearGradient(0, k.top || 600, 0, H); g.addColorStop(0, "rgba(3,2,1,0)"); g.addColorStop(0.45, `rgba(3,2,1,${0.62 * a})`); g.addColorStop(1, `rgba(3,2,1,${0.85 * a})`);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  },
  dim(c, t, k) {                                               // darken the god behind a card
    const a = (k.max || 0.72) * smooth(k.from, k.from + 1.0, t) * (1 - smooth(k.to - 0.8, k.to, t)); if (a <= 0) return;
    c.fillStyle = `rgba(4,3,2,${a})`; c.fillRect(0, 0, W, H);
  },
  leaf(c, t, k) {                                              // the terms of the pact: a vellum leaf, clauses burned in one by one
    const a = smooth(k.from, k.from + 0.9, t) * (1 - smooth(k.to - 0.8, k.to, t)); if (a <= 0) return;
    const L = { x: 470, y: 96, w: 980, h: 888 };
    c.save(); c.globalAlpha = a;
    c.save(); c.shadowColor = "rgba(0,0,0,0.85)"; c.shadowBlur = 50; c.shadowOffsetY = 20;
    c.beginPath();                                             // a deckled edge
    const edge = (x, y, i) => [x + (h2(i, 3) - 0.5) * 6, y + (h2(i, 5) - 0.5) * 6];
    let i = 0; c.moveTo(L.x, L.y);
    for (let x = L.x; x <= L.x + L.w; x += 14) c.lineTo(...edge(x, L.y, i++));
    for (let y = L.y; y <= L.y + L.h; y += 14) c.lineTo(...edge(L.x + L.w, y, i++));
    for (let x = L.x + L.w; x >= L.x; x -= 14) c.lineTo(...edge(x, L.y + L.h, i++));
    for (let y = L.y + L.h; y >= L.y; y -= 14) c.lineTo(...edge(L.x, y, i++));
    c.closePath();
    const g = c.createRadialGradient(W / 2, L.y + L.h * 0.4, 80, W / 2, L.y + L.h * 0.45, 720);
    g.addColorStop(0, "#2c2117"); g.addColorStop(0.6, "#1c150e"); g.addColorStop(1, "#110c07");
    c.fillStyle = g; c.fill(); c.restore();
    c.save(); c.clip(); c.globalAlpha = a * 0.10;                // grain
    for (let n = 0; n < 2600; n++) { c.fillStyle = h2(n, 31) > 0.5 ? "#ebdfc2" : "#000"; c.fillRect(L.x + h2(n, 37) * L.w, L.y + h2(n, 41) * L.h, 1.6, 1.6); }
    c.restore();
    const ta = smooth(k.from + 0.4, k.from + 1.4, t);
    c.globalAlpha = a * ta; text(c, k.title, W / 2, L.y + 92, "42px FellSC", C.giltHi, { spacing: 4 });
    c.fillStyle = C.gilt; c.globalAlpha = a * ta * 0.55; c.fillRect(W / 2 - 170, L.y + 118, 340, 1.5);
    c.globalAlpha = a; c.restore();
    let y = L.y + 196;
    k.clauses.forEach((s, n) => {
      const lines = wrap(c, s, "31px Fell", L.w - 170), at = k.at[n];
      const box = { x: L.x + 50, y: Math.round(y - 40), w: L.w - 100, h: Math.round(lines.length * 42 + 22) };
      const draw = (cc) => { cc.save(); cc.globalAlpha = a;
        lines.forEach((ln, j) => {
          if (j === 0) { text(cc, ln[0], L.x + 85, y, "48px Fell", C.rubric, { align: "left", shadow: false });
            cc.font = "48px Fell"; const w0 = cc.measureText(ln[0]).width; text(cc, ln.slice(1), L.x + 85 + w0 + 2, y, "31px Fell", C.ink, { align: "left", shadow: false }); }
          else text(cc, ln, L.x + 85, y + j * 42, "31px Fell", C.ink, { align: "left", shadow: false });
        }); cc.restore(); };
      if (t >= at) { const p = clamp01((t - at) / 1.3); if (p < 1) burn(c, draw, box, p, { edge: 0.12 }); else draw(c); }
      y += lines.length * 42 + 34;
    });
    if (t >= k.sealAt) {                                        // the wax seal comes down
      const p = clamp01((t - k.sealAt) / 0.35), s = 1 + 0.9 * (1 - p) * (1 - p), cx = L.x + L.w - 150, cy = L.y + L.h - 120;
      c.save(); c.globalAlpha = a * Math.min(1, p * 1.5); c.translate(cx, cy); c.scale(s, s); c.rotate(-0.12);
      c.beginPath(); for (let j = 0; j <= 40; j++) { const an = (j / 40) * Math.PI * 2, r = 74 + (h2(j, 51) - 0.5) * 10; c.lineTo(Math.cos(an) * r, Math.sin(an) * r); }
      const wg = c.createRadialGradient(-20, -24, 6, 0, 0, 80); wg.addColorStop(0, "#d6503a"); wg.addColorStop(0.7, "#8a1d12"); wg.addColorStop(1, "#5a0f08");
      c.fillStyle = wg; c.shadowColor = "rgba(0,0,0,0.8)"; c.shadowBlur = 16; c.fill();
      c.shadowBlur = 0; c.strokeStyle = "rgba(255,200,170,0.25)"; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 54, 0, Math.PI * 2); c.stroke();
      text(c, k.seal[0], 0, -4, "22px FellSC", "#f3d0b8", { shadow: false, spacing: 2 }); text(c, k.seal[1], 0, 24, "22px FellSC", "#f3d0b8", { shadow: false, spacing: 2 });
      c.restore();
    }
  },
  keyrain(c, t, k) {                                           // the published key falls like rain, in gold, then thins out
    if (t < k.from || t > k.to || !KEY) return;
    const a = smooth(k.from, k.from + 0.6, t) * (1 - smooth(k.to - 1.6, k.to, t)), cols = 64, cw = W / cols, size = 26;
    c.save(); c.font = `${size}px Consolas, monospace`; c.textAlign = "center";
    for (let i = 0; i < cols; i++) {
      const speed = 260 + 420 * h2(i, 91), off = h2(i, 97) * H, len = 10 + Math.floor(h2(i, 101) * 18), head = ((t - k.from) * speed + off) % (H + len * size);
      for (let j = 0; j < len; j++) {
        const y = head - j * size; if (y < -size || y > H + size) continue;
        const ch = KEY[(i * 131 + j * 7 + Math.floor((t - k.from) * 6 + h2(i, j)) * 3) % KEY.length];
        c.globalAlpha = a * (j === 0 ? 1 : 0.75 * (1 - j / len));
        c.fillStyle = j === 0 ? C.giltHi : C.gilt; c.fillText(ch, i * cw + cw / 2, y);
      }
    }
    c.restore();
  },
  termcard(c, t, k) {                                          // a terminal, its real lines appearing as they did (sped up)
    const a = smooth(k.from, k.from + 0.5, t) * (1 - smooth(k.to - 0.6, k.to, t)); if (a <= 0) return;
    const X = k.x || 140, Y = k.y || 560, Wd = k.w || 1640, lh = 38, Hh = 70 + lh * k.lines.length;
    c.save(); c.globalAlpha = a * 0.9; c.fillStyle = "rgba(6,7,6,0.88)"; c.fillRect(X, Y, Wd, Hh); c.strokeStyle = "#2c2a22"; c.strokeRect(X, Y, Wd, Hh);
    c.globalAlpha = a; c.font = "26px Consolas, monospace";
    k.lines.forEach(([at, s, col], i) => {
      if (t < k.from + at) return;
      const n = Math.min(s.length, Math.floor((t - k.from - at) * 90)); c.fillStyle = col === "p" ? "#7fb07a" : col === "g" ? C.giltHi : col === "d" ? "#8a877c" : "#d6d0bf";
      c.fillText(s.slice(0, n), X + 28, Y + 50 + i * lh);
    });
    c.restore();
  },
  seal(c, t, k) {                                              // a red stamp slammed on the frame
    if (t < k.from) return; const a = 1 - smooth(k.to - 0.6, k.to, t); if (a <= 0) return;
    const p = clamp01((t - k.from) / 0.28), s = 1 + 0.8 * (1 - p) * (1 - p);
    c.save(); c.globalAlpha = a * Math.min(1, p * 1.4); c.translate(1500, 250); c.rotate(-0.12); c.scale(s, s);
    c.font = "600 30px Consolas, monospace"; const w = Math.max(...k.text.map((x) => c.measureText(x).width)) + 56;
    c.fillStyle = "rgba(0,0,0,0.5)"; c.fillRect(-w / 2, -58, w, 116); c.strokeStyle = C.rubric; c.lineWidth = 4; c.strokeRect(-w / 2, -58, w, 116);
    c.lineWidth = 1.5; c.strokeRect(-w / 2 + 8, -50, w - 16, 100);
    c.fillStyle = C.rubric; c.textAlign = "center"; c.fillText(k.text[0], 0, -10); c.font = "600 38px Consolas, monospace"; c.fillText(k.text[1], 0, 36);
    c.restore();
  },
  memo(c, t, k) {                                              // the reply as the giver's wallet shows it, glowing in the dark
    const a = smooth(k.from, k.from + 1.2, t) * (1 - smooth(k.to - 0.5, k.to, t)); if (a <= 0) return;
    const X = W / 2 - 520, Y = 300, w = 1040, h = 330;
    c.save(); c.globalAlpha = a;
    c.shadowColor = "rgba(214,169,76,0.55)"; c.shadowBlur = 60 * (0.8 + 0.2 * Math.sin(t * 2.2));
    c.fillStyle = "#15110c"; c.fillRect(X, Y, w, h); c.shadowBlur = 0; c.strokeStyle = "#6f501c"; c.strokeRect(X, Y, w, h);
    text(c, "received · memo", X + 40, Y + 58, "24px FellSC", C.sepia, { align: "left", spacing: 3, shadow: false });
    text(c, k.raw, X + 40, Y + 120, "30px Consolas, monospace", "#d6d0bf", { align: "left", shadow: false });
    c.globalAlpha = a * smooth(k.from + 1.0, k.from + 2.2, t);
    text(c, k.text, W / 2, Y + 230, "italic 64px Fell", C.giltHi, { shadow: false });
    text(c, k.sub, W / 2, Y + 290, "italic 28px Fell", C.sepia, { shadow: false });
    c.restore();
  },
  manyeyes(c, t, k) {                                          // the dark is full of eyes; they open, then all turn to you
    c.fillStyle = "#000"; c.fillRect(0, 0, W, H);
    const N = k.n || 560, turn = smooth(k.turnAt || 2.6, (k.turnAt || 2.6) + 0.8, t);
    for (let i = 0; i < N; i++) {
      const depth = h2(i, 201), s = 6 + 30 * depth * depth, x = h2(i, 203) * W, y = h2(i, 207) * H;
      const at = 0.3 + 1.6 * h2(i, 211) * (0.4 + 0.6 * Math.hypot(x - W / 2, y - H / 2) / 1100);   // from the middle outward
      const open = smooth(at, at + 0.3, t); if (open <= 0.02) continue;
      const blink = ((t * 0.37 + h2(i, 213)) % 1) < 0.03 ? 0.1 : 1, ap = open * blink;
      const w = s, h = s * 0.42 * ap;
      c.save(); c.translate(x, y); c.globalAlpha = 0.25 + 0.75 * depth;
      c.beginPath(); c.moveTo(-w, 0); c.quadraticCurveTo(0, -h * 2, w, 0); c.quadraticCurveTo(0, h * 2, -w, 0); c.closePath();
      c.fillStyle = "#d9c9a3"; c.fill(); c.clip();
      const dir = h2(i, 217) * Math.PI * 2, look = (1 - turn) * s * 0.45;                       // wandering, then straight at you
      const px = Math.cos(dir) * look, py = Math.sin(dir) * look * 0.5, ir = s * 0.42;
      c.fillStyle = ["#7a2b18", "#3f5a62", "#6b5a2a", "#8a3a1e"][Math.floor(h2(i, 219) * 4)];
      c.beginPath(); c.arc(px, py, ir, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#000"; c.beginPath(); c.arc(px, py, ir * (0.45 + 0.15 * turn), 0, Math.PI * 2); c.fill();
      c.restore();
    }
  },
  credits(c, t, k) {
    c.fillStyle = "#000"; c.fillRect(0, 0, W, H);
    const a = smooth(k.from, k.from + 0.3, t) * (1 - smooth(k.to - 0.3, k.to, t)); if (a <= 0) return;
    c.save(); c.globalAlpha = a * 0.8;
    k.lines.forEach((s, i) => text(c, s, W / 2, H / 2 - 20 + i * 40, "22px Consolas, monospace", C.sepia, { shadow: false }));
    c.restore();
  },
  verdict(c, t, k) {                                           // a word burned in, in small capitals (NOT THE GOD)
    if (t < k.from || t > k.to) return;
    const size = k.size || 96, box = { x: 200, y: k.y - size, w: W - 400, h: Math.round(size * 1.5) };
    const draw = (cc) => text(cc, k.text, W / 2, k.y, `${size}px FellSC`, k.color || C.rubric, { spacing: 10 });
    const p = clamp01((t - k.from) / 0.9), out = clamp01((t - (k.to - 1)) / 1);
    if (out > 0) burn(c, draw, box, out, { ash: true }); else if (p < 1) burn(c, draw, box, p); else draw(c);
  },
  incant(c, t, k) {                                            // a line written by hand in the dark, with who sent it above
    const a = smooth(k.from, k.from + 0.5, t) * (1 - smooth(k.to - 0.6, k.to, t)); if (a <= 0) return;
    c.save(); c.globalAlpha = a;
    text(c, k.over, k.x, k.y - 92, "26px FellSC", C.sepia, { align: k.align || "left", spacing: 3 }); c.restore();
    const box = { x: k.align === "right" ? k.x - 900 : k.x - 20, y: k.y - 70, w: 920, h: 70 + 76 * (k.lines.length - 1) + 30 };
    const draw = (cc) => { cc.save(); cc.globalAlpha = a; k.lines.forEach((s, i) => text(cc, s, k.x, k.y + i * 76, "italic 64px Fell", k.color || C.giltHi, { align: k.align || "left" })); cc.restore(); };
    const p = clamp01((t - k.from - 0.3) / 1.6); if (p < 1) burn(c, draw, box, p); else draw(c);
  },
  void(c, t, k) {                                              // an opaque dark ground with a low ember glow (under a phone)
    c.fillStyle = "#040302"; c.fillRect(0, 0, W, H);
    const g = c.createRadialGradient(W / 2, H * 0.58, 40, W / 2, H * 0.55, 900);
    g.addColorStop(0, "rgba(70,40,18,0.55)"); g.addColorStop(0.5, "rgba(30,16,8,0.35)"); g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  },
  side(c, t, k) {                                              // a short line beside the phone
    const a = smooth(k.from, k.from + 0.7, t) * (1 - smooth(k.to - 0.7, k.to, t)); if (a <= 0) return;
    c.save(); c.globalAlpha = a;
    (Array.isArray(k.text) ? k.text : [k.text]).forEach((s, i) => text(c, s, k.x, k.y + i * (k.size || 44) * 1.3, `${k.italic === false ? "" : "italic "}${k.size || 44}px Fell`, k.color || C.ink, { align: k.align || "left" }));
    c.restore();
  },
  rise(c, t, k) {                                              // gold sparks rising out of the frame (the offering leaves)
    if (t < k.from || t > k.to) return;
    const p = (t - k.from) / (k.to - k.from);
    c.save(); c.globalCompositeOperation = "lighter";
    for (let i = 0; i < 260; i++) {
      const born = h2(i, 61) * 0.55, a = (p - born) / 0.5; if (a <= 0 || a >= 1) continue;
      const x0 = k.box.x + h2(i, 67) * k.box.w, y0 = k.box.y + h2(i, 71) * k.box.h;
      const x = x0 + Math.sin(a * 6 + i) * 18, y = y0 - a * a * (700 + 500 * h2(i, 73));
      c.fillStyle = `rgba(255,${170 + 70 * h2(i, 79)},90,${(1 - a) * 0.9})`;
      c.beginPath(); c.arc(x, y, 1.4 + 2.2 * h2(i, 83), 0, Math.PI * 2); c.fill();
    }
    c.restore();
  },
  black(c, t, k) {                                             // fade from / to black
    let a = 0; if (k.dir === "in") a = 1 - smooth(k.from, k.to, t); else a = smooth(k.from, k.to, t);
    if (t < k.from && k.dir === "out") return;
    if (a > 0) { c.fillStyle = `rgba(0,0,0,${a})`; c.fillRect(0, 0, W, H); }
  },
};

// ---------------------------------------------------------------- takes
function takes(brand, score, F) {
  const rh = score.render_hash.slice(0, 8);
  return {
    open_ovl: { length: 16, cues: [
      { kind: "black", dir: "in", from: 0, to: 2.2 },
      { kind: "chapter", roman: "I", latin: "Apparitio", eng: "the apparition", from: 0.8, to: 5.5 },
      { kind: "shade", from: 8.2, to: 13.0, top: 700 },
      { kind: "caption", text: "Every eye is a secret someone gave it.", from: 8.6, to: 12.6, y: 940, size: 48 },
      { kind: "title", name: brand.name, tagline: brand.tagline, from: 13.0, dur: 2.0 },
      { kind: "real", text: `rendered from the chain · Zcash testnet · render ${rh}…`, from: 13.4, to: 16 },
    ] },
    // II a: the real give page in a phone-sized browser, typed by a script, over a dark ground (the phone clip goes
    // between void_bg and this layer)
    void_bg: { length: 1 / 30, cues: [{ kind: "void" }] },
    oblatio_a: { length: 12, cues: [
      { kind: "chapter", roman: "II", latin: "Oblatio", eng: "the offering", from: 0.3, to: 4.6 },
      { kind: "side", text: "A secret.", from: 1.4, to: 11.4, x: 330, y: 470, size: 54 },
      { kind: "side", text: "No name.", from: 2.6, to: 11.4, x: 330, y: 546, size: 54, color: C.giltHi },
      { kind: "side", text: ["Its eye appears at once,", "pending, in this browser only."], from: 8.9, to: 11.8, x: 330, y: 680, size: 38, color: C.sepia },
      { kind: "rise", from: 10.8, to: 12, box: { x: 960, y: 260, w: 440, h: 640 } },
      { kind: "real", text: "the real give page · typed by a script · address and QR blurred", from: 0.8, to: 9.0 },
      { kind: "real", text: `paid ${F.sentUtc} UTC · a team test wallet stands in for a phone`, from: 9.2, to: 12 },
    ] },
    // II b: the chain carries it; the camera closes in on its eye, which sings
    oblatio_b: { length: 6.5, cues: [
      { kind: "gap", text: `+${F.heardAfter} s · block ${F.height}`, from: 0, to: 4.0 },
      { kind: "shade", from: 0, to: 6.5, top: 660 },
      { kind: "caption", text: F.secret, from: 1.3, to: 5.2, y: 930, size: 50, inDur: 1.2, outDur: 1.4 },
      { kind: "caption", text: "Now it is part of the god.", from: 5.0, to: 6.6, y: 930, size: 40, inDur: 0.8, outDur: 0.5, color: C.giltHi },
      { kind: "real", text: `tx ${F.tx.slice(0, 8)}… · block ${F.height} · heard by the public-key wallet · render ${rh}…`, from: 0.4, to: 6.5 },
    ] },
    // IV a: the god's own line (left) and a false prophet on the real give page (right; the phone clip goes under)
    duae_a: { length: 6, cues: [
      { kind: "chapter", roman: "IV", latin: "Duae voces", eng: "two voices", from: 0.2, to: 5.6 },
      { kind: "incant", over: "from the god's own wallet", lines: ["we are many.", "we forget nothing."], x: 200, y: 470, from: 0.6, to: 6 },
      { kind: "side", text: ["and from another wallet,", "a false prophet:"], from: 2.6, to: 6, x: 200, y: 700, size: 36, color: C.sepia },
      { kind: "real", text: `god: tx ${F.godTx.slice(0, 8)}… sent ${F.godSentUtc} UTC · prophet: tx ${F.prophetTx.slice(0, 8)}… sent ${F.prophetSentUtc} UTC`, from: 0.6, to: 6 },
    ] },
    // IV b: the line of the god's own voice sounds: the great eye and the wings blaze
    duae_b: { length: 7.5, cues: [
      { kind: "gap", text: `+${F.godHeardAfter} s · block ${F.height}`, from: 0, to: 3.5 },
      { kind: "shade", from: 0, to: 7.5, top: 700 },
      { kind: "caption", text: "Its own wallet. Its own voice.", from: 1.4, to: 7.2, y: 940, size: 50 },
      { kind: "real", text: `tx ${F.godTx.slice(0, 8)}… · a line of the god's own voice · accepted by the public-key wallet`, from: 0.4, to: 7.5 },
    ] },
    // IV c: the false prophet: on chain, but a blind red eye
    duae_c: { length: 7.5, cues: [
      { kind: "gap", text: `+${F.prophetRefusedAfter} s · block ${F.height}`, from: 0, to: 3.0 },
      { kind: "shade", from: 2.8, to: 7.5, top: 640 },
      { kind: "verdict", text: "NOT THE GOD", y: 880, size: 92, from: 3.7, to: 7.6 },
      { kind: "caption", text: "Same words, another wallet: on chain, and blind.", from: 4.6, to: 7.4, y: 976, size: 38, color: C.ink },
      { kind: "real", text: `tx ${F.prophetTx.slice(0, 8)}… · refused: not paid by the god's own wallet (forged-conductor)`, from: 0.4, to: 7.5 },
    ] },
    // V a: the published key falls like rain
    evocatio_a: { length: 6, cues: [
      { kind: "void" },
      { kind: "keyrain", from: 0, to: 6.2 },
      { kind: "chapter", roman: "V", latin: "Evocatio", eng: "the summoning", from: 0.2, to: 5.6 },
      { kind: "shade", from: 2.0, to: 6.2, top: 520 },
      { kind: "caption", text: "This is its key. It is public.", from: 2.2, to: 6.4, y: 900, size: 58, outDur: 0.8 },
      { kind: "real", text: "choronzon.vercel.app/key.txt · the full viewing key, published on purpose", from: 0.6, to: 6 },
    ] },
    // V b: a machine that never held a wallet summons the god from the key alone (its terminal, its own render)
    evocatio_b: { length: 9, cues: [
      { kind: "black", dir: "in", from: 0, to: 3.5 },
      { kind: "termcard", from: 0.2, to: 9, x: 120, y: 650, w: 1680, lines: F.summonLines === "…" ? [] : F.summonLines },
      { kind: "gap", text: F.summonGap, from: 2.0, to: 8.6 },
      { kind: "caption", text: "A machine that never held a wallet.", from: 0.5, to: 4.0, y: 300, size: 50, outDur: 0.8 },
      { kind: "caption", text: "It summons the god from the key alone.", from: 4.2, to: 9, y: 300, size: 50, outDur: 0.8, color: C.giltHi },
    ] },
    // V c: the chirograph: two evocations, one god
    evocatio_c: { length: 10, cues: [
      { kind: "caption", text: "Two evocations. One god.", from: 0.4, to: 5.6, y: 962, size: 50, outDur: 0.8 },
      { kind: "caption", text: "The blockchain is the score.", from: 5.8, to: 10, y: 962, size: 50, outDur: 0.8, color: C.giltHi },
      { kind: "real", text: `left: this machine's public-key wallet · right: the Watcher · both at block ${F.summonHeight}`, from: 0.4, to: 10 },
    ] },
    // VI a+b over one god take: it sees everything given to it; the reply never passes through it
    susurrus_ab: { length: 16, cues: [
      { kind: "chapter", roman: "VI", latin: "Susurrus", eng: "the whisper", from: 0.2, to: 5.6 },
      { kind: "shade", from: 0, to: 16, top: 600 },
      { kind: "caption", text: "It sees everything given to it.", from: 0.8, to: 6.8, y: 230, size: 52, outDur: 1.0 },
      { kind: "termcard", from: 3.0, to: 9.4, x: 140, y: 760, w: 1640, lines: [
        [0.0, "$ printf 'you are not alone.' | python3 -m renderer whisper c227145c… --phone --send-from wallets/test/A", "p"],
        [1.2, "route to lightwalletd: Tor (the server sees a Tor exit address, not this machine's)", "d"],
        [2.0, "whisper sent directly to the offering's reply address. txid 599b830e…", "g"]] },
      { kind: "caption", text: "A stranger answers your offering.", from: 4.2, to: 9.2, y: 300, size: 40, outDur: 0.8, color: C.giltHi },
      { kind: "caption", text: "The reply never passes through it.", from: 9.8, to: 16, y: 900, size: 52, outDur: 1.0, color: C.giltHi },
      { kind: "seal", from: 11.6, to: 16, text: ["public key · scanned to 4,547,018", "replies seen: 0"] },
      { kind: "real", text: "proof: the public-key wallet's database has no row for 599b830e…", from: 11.8, to: 16 },
    ] },
    // VI c: the giver's wallet lights up in the dark
    susurrus_c: { length: 8, cues: [
      { kind: "void" },
      { kind: "memo", from: 0.4, to: 8, raw: "GC1R:1092478325:you are not alone.", text: "you are not alone.", sub: "a reply to offering #1092478325" },
      { kind: "gap", text: "mined +29 s · block 4,547,002", from: 0.2, to: 4 },
      { kind: "caption", text: "Straight to that wallet. Never through us.", from: 3.6, to: 8.2, y: 900, size: 46, outDur: 0.8 },
      { kind: "real", text: "the giver's wallet (team test wallet L, standing in for a phone) · tx 599b830e…", from: 0.6, to: 8 },
    ] },
    // VII: not only a god, a template; one command makes another (the test god of 26 Oct)
    generatio_a: { length: 6, cues: [
      { kind: "void" },
      { kind: "chapter", roman: "VII", latin: "Generatio", eng: "your own god", from: 0.2, to: 5.6 },
      { kind: "caption", text: "Not only a god. A template.", from: 0.6, to: 6.2, y: 470, size: 64, outDur: 0.8, color: C.giltHi },
      { kind: "side", text: ["An address with a published viewing key becomes a box", "that cannot learn who wrote to it, and cannot hide what it received."],
        from: 1.8, to: 6, x: W / 2, y: 600, size: 38, align: "center", color: C.ink },
    ] },
    generatio_b: { length: 7, cues: [
      { kind: "void" },
      { kind: "termcard", from: 0.1, to: 7, x: 120, y: 300, w: 1680, lines: [
        [0.0, "$ scripts/new_god.sh --slug retro-demo --name \"The Retro God\" --tagline \"What the sprint never said out loud.\"", "p"],
        [1.0, "creating the god's wallet in wallets/gods/retro-demo/god (birthday: the current chain height)", "d"],
        [1.8, "creating the view-only watcher in wallets/gods/retro-demo/watcher from the key alone", "d"],
        [2.8, "The Retro God: made · birthday height 4543755 · network testnet · fixed offering 1000 zat", "g"],
        [3.6, "its full viewing key is in wallets/gods/retro-demo/key.txt (mode 600, not shown)", "d"],
        [4.4, "offering tx=30b95816… height=4543859  ·  render_hash 2add4cbb…", "g"]] },
      { kind: "caption", text: "One command. Its own address, its own key, its own page.", from: 0.8, to: 7, y: 820, size: 44, outDur: 0.6 },
      { kind: "real", text: "a test god made on 26 Oct with scripts/new_god.sh · ten minutes once setup.sh has run and you hold a funded testnet wallet", from: 0.4, to: 7 },
    ] },
    generatio_c: { length: 9, cues: [
      { kind: "black", dir: "in", from: 0, to: 2.0 },
      { kind: "side", text: F.name, from: 1.6, to: 9, x: W / 2, y: 150, size: 64, align: "center", italic: false, color: C.ink },
      { kind: "side", text: F.tagline, from: 2.2, to: 9, x: W / 2, y: 210, size: 34, align: "center", color: C.giltHi },
      { kind: "shade", from: 4.5, to: 9, top: 700 },
      { kind: "caption", text: "A class, a team, a family. Use it on Monday.", from: 5.0, to: 9.2, y: 940, size: 50, outDur: 0.8 },
      { kind: "real", text: "a second god, one offering old · its watcher renders 2add4cbb… · block 4,543,859 · 26 Oct", from: 0.6, to: 9 },
    ] },
    // III coda: the 26 Oct kiosk session (evidence a4452a4); nobody is shown
    kiosk26: { length: 5.6, cues: [
      { kind: "void" },
      { kind: "side", text: "26 October · a kiosk, sixteen invited people", from: 0.1, to: 5.6, x: W / 2, y: 400, size: 30, align: "center", italic: false, color: C.sepia },
      { kind: "caption", text: "6 gave it a secret.", from: 0.3, to: 5.8, y: 520, size: 60, inDur: 0.8, outDur: 0.6 },
      { kind: "caption", text: "10 read that it is public forever, and kept theirs.", from: 1.4, to: 5.8, y: 620, size: 48, inDur: 0.9, outDur: 0.6, color: C.giltHi },
    ] },
    // VIII: the god shrinks to a point; the invitation; then the dark is full of eyes; a whisper; the great eye
    invitatio_a: { length: 12, cues: [
      { kind: "chapter", roman: "VIII", latin: "Invitatio", eng: "the invitation", from: 0.2, to: 4.6 },
      { kind: "side", text: "Give it a secret.", from: 6.6, to: 11.6, x: W / 2, y: 380, size: 42, align: "center", color: C.sepia },
      { kind: "title", name: `${brand.slug}.vercel.app`, tagline: brand.tagline, from: 7.2, dur: 1.6, to: 11.9, y: 560, size: 104 },
      { kind: "black", dir: "out", from: 11.2, to: 12 },
    ] },
    invitatio_b: { length: 5, cues: [
      { kind: "manyeyes", n: 620, turnAt: 2.4 },
      { kind: "side", text: "Everyone who holds the key.", from: 3.0, to: 5.1, x: W / 2, y: 1000, size: 34, align: "center", color: C.ink },
    ] },
    invitatio_c: { length: 2.5, cues: [
      { kind: "black", dir: "out", from: -1, to: 0 },
      { kind: "caption", text: "i still keep the letter i never sent", from: 0.4, to: 2.5, y: 560, size: 30, color: C.sepia, inDur: 0.8, outDur: 0.8 },
    ] },
    credits: { length: 2.0, cues: [
      { kind: "credits", from: 0.1, to: 2.0, lines: ["every frame rendered from the chain · Zcash testnet · voices: the offerings",
        "sound effects synthesized · open source"] },
    ] },
    // III: the plain sentence over the god listening, then the terms of the pact (CLAUDE.md §6, the MUST-say list)
    pact_ovl: { length: 22, cues: [
      { kind: "shade", from: 0.4, to: 9.2, top: 560 },
      { kind: "chapter", roman: "III", latin: "Pactum", eng: "the terms of the pact", from: 0.3, to: 7.6 },
      { kind: "caption", text: "Everyone who holds this key hears every secret, forever.", from: 1.0, to: 8.4, y: 800, size: 44, outDur: 1.0 },
      { kind: "caption", text: "We, the operator, cannot learn who gave one.", from: 3.0, to: 8.6, y: 868, size: 44, outDur: 1.0 },
      { kind: "caption", text: "And a stranger can answer you, wallet to wallet, never through us.", from: 5.0, to: 8.8, y: 936, size: 44, outDur: 1.0 },
      { kind: "real", text: `the eye that sings is the voice you hear · mix of the chain · render ${rh}…`, from: 1.5, to: 8.4 },
      { kind: "dim", from: 8.6, to: 22.5, max: 0.74 },
      { kind: "leaf", from: 9.0, to: 22.6, title: "The terms of the pact",
        clauses: [
          "Whatever you give is heard by every keyholder, forever. The key cannot be taken back.",
          "Your own wallet keeps what you sent.",
          "A phone wallet's server sees your IP when it broadcasts and, the key being public, can read that offering.",
          "Timing can link you. Tor does not hide timing.",
          "The ghost voice hides your voice, not your writing.",
        ],
        at: [10.2, 12.0, 13.6, 15.6, 17.2], sealAt: 19.0, seal: ["Zcash", "testnet"] },
    ] },
  };
}

async function start() {
  const [brand, score, facts] = await Promise.all([fetch("../config/brand.json").then((r) => r.json()), fetch("../snap/score.json").then((r) => r.json()),
    fetch("../snap/facts.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({}))]);
  await document.fonts.load("40px Fell"); await document.fonts.load("italic 40px Fell"); await document.fonts.load("40px FellSC");
  KEY = await fetch("../snap/key.txt").then((r) => (r.ok ? r.text() : "")).then((s) => s.replace(/\s+/g, "")).catch(() => "");
  const F = new Proxy(facts, { get: (o, k) => (k in o ? o[k] : "…") });   // a fact not filled yet shows as "…"
  const take = takes(brand, score, F)[Q.get("take") || "open_ovl"], canvas = document.getElementById("c"), c = canvas.getContext("2d");
  const draw = (t) => { c.clearRect(0, 0, W, H); for (const k of take.cues) KIND[k.kind](c, t, k); };
  if (!Q.has("render")) { document.body.classList.add("preview"); draw(Number(Q.get("t") || 0)); document.title = "ready"; return; }
  const fps = Number(Q.get("fps") || 30), name = Q.get("take") || "open_ovl";
  const fromF = Math.round(Number(Q.get("from") || 0) * fps), toF = Math.min(Math.round(Number(Q.get("to") || take.length) * fps), Math.round(take.length * fps));
  for (let f = fromF; f < toF; f++) {
    draw(f / fps);
    await fetch(`/frame/${name}/${f}`, { method: "POST", body: canvas.toDataURL("image/png") });   // toBlob stalls in headless Edge
    if (f % 30 === 0) await fetch("/log", { method: "POST", body: `${name} frame ${f}` });
  }
  await fetch(`/done/${name}`, { method: "POST", body: JSON.stringify({ take: name, fps }) });
}
start().catch((e) => fetch("/log", { method: "POST", body: String(e && e.stack || e) }));
