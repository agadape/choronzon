// EXPLORATION: the Black Sun rising, raw WebGL (one fragment shader, no library).
// Cosmic-horror rules this follows (see docs/visual-direction.md): scale the eye cannot hold (one tiny Watcher on
// the horizon), the iceberg (only the top of the body clears the horizon; the corona leaves the frame), wrongness
// (a different sky inside the disk, colour that is only "by analogy" a colour), cold contaminated palette, and
// signal failure at peak intrusion (chromatic split when a voice sounds).
// Form = pure function of score.json, packed once into a data texture. Time only moves the warp, the flicker and
// the sky inside the disk; playback position only decides which streamers intrude; the pointer moves nothing in
// the body. Noise is a hash seeded from the render hash, never Math.random().
"use strict";
(function () {
  const MAX = 256, PHI = 0.6180339887;
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

  const VS = `attribute vec2 a; void main(){ gl_Position = vec4(a, 0., 1.); }`;
  const FS = `
precision highp float;
uniform vec2 uRes, uC, uSeed, uFig;
uniform float uR, uT, uN, uGod, uHz, uPx;
uniform sampler2D uD;
const float TAU = 6.2831853;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21) + uSeed); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2(1., 0.)), f.x), mix(h21(i + vec2(0., 1.)), h21(i + vec2(1., 1.)), f.x), f.y); }
float fbm(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 5; i++){ s += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= .5; } return s; }
float adiff(float a, float b){ return mod(a - b + 3.14159265, TAU) - 3.14159265; }
vec4 dat(float i, float row){ return texture2D(uD, vec2((i + .5) / 256., (row + .5) / 4.)); }
vec3 sheen(float t){ return .62 + .22 * cos(TAU * (t + vec3(0., .33, .67))); }   // oil on water
float stars(vec2 fc, float seed, float dens){ vec2 c = floor(fc / (3. * uPx)); float s = h21(c * .731 + seed);
  return step(1. - dens, s) * (.35 + .65 * h21(c + 3.1 + seed)); }

void main(){
  vec2 fc = gl_FragCoord.xy, uv = fc / uRes;
  vec2 p = (fc - uC) / uR;
  float r = length(p), th = atan(p.y, p.x);
  vec2 w = vec2(fbm(p * 2.4 + vec2(uT * .018, 0.)), fbm(p * 2.4 + vec2(7.1, -uT * .015)));
  float warp = (w.x - .5) * .5, warp2 = w.y - .5;
  vec3 PALE = vec3(.78, .86, .76), COLD = vec3(.72, .84, .95), RUB = vec3(.62, .10, .07);

  // the sky: abyssal green-black above, bruised toward the horizon
  vec3 col = mix(vec3(.020, .012, .026), vec3(.003, .009, .011), smoothstep(.15, .9, uv.y));
  float neb = fbm(uv * vec2(2.2, 3.4) + w * .35);
  col += vec3(.09, .04, .12) * pow(neb, 2.6) * .9 + vec3(.01, .06, .05) * pow(fbm(uv * 5. + 3.), 3.5) * .7;
  col += COLD * stars(fc, 0., .0045) * (.55 + .45 * sin(uT * 1.3 + uv.x * 40.)) * .8;

  // the corona: every offering is one streamer reaching into the sky
  vec3 cor = vec3(0.); float red = 0., dark = 0., pull = 0.;
  for (int k = 0; k < 256; k++){
    float i = float(k); if (i >= uN) break;
    vec4 a = dat(i, 0.), b = dat(i, 1.), c = dat(i, 2.);
    float kind = b.w, sing = c.x;
    float ang = a.x * TAU, L = .25 + 1.6 * a.y * a.y + .25 * a.w, wid = .008 + .03 * a.z, waves = 1.5 + 6. * a.w;
    float bend = (b.x - .5) * 2., strands = 4. + 10. * b.y, ph = b.z * TAU;
    if (kind > .2 && kind < .45){            // the god's own lines: torn arches standing on the limb
      float u = adiff(th, ang) / .045, y = r - 1.;
      if (abs(u) < 1.3){
        float hh = .035 + .06 * a.z, ar = hh * sqrt(max(0., 1. - u * u));
        float jit = (fbm(vec2(u * 2.5 + i, y * 30. - uT * .3)) - .5) * hh * .8;
        float tw = .004 + .006 * fbm(vec2(u * 5., i + uT * .15));
        float line = exp(-pow((y - ar - jit) / tw, 2.)) * step(0., y) * smoothstep(1.2, .6, abs(u));
        line *= .35 + .9 * pow(fbm(vec2(u * 7. + uT * .2, y * 40.)), 1.5);
        cor += line * mix(PALE, sheen(u * .3 + i * .1 + uT * .02), .2 + .5 * sing) * (.8 + sing * 2.);
      }
      continue;
    }
    float r0 = 1.;
    if (kind > .8){ r0 = 1.25 + a.w * .5; L = .2 + .25 * a.y; }   // refused: never reaches the body
    float s = (r - r0) / L;
    if (s < -.02 || s > 1.15) continue;
    float centre = ang + bend * .45 * s * s + .05 * sin(waves * TAU * s + ph + uT * (.35 + sing * 2.)) * s * (1. + sing) + warp * s * .5;
    float d = adiff(th, centre) * r;
    float hw = wid * pow(max(0., 1. - s), 1.1) + .002;
    float x = d / hw;
    if (abs(x) > 6.) continue;
    float dl = .12 + sing * .14;                                   // signal failure: the voice splits the light
    vec3 bod = vec3(exp(-(x + dl) * (x + dl) * 1.3), exp(-x * x * 1.3), exp(-(x - dl) * (x - dl) * 1.3));
    float sa = x * strands + sin(s * 11. + ph) * 2.2 + warp2 * 3.;
    float fil = pow(.5 + .5 * cos(sa), 3.) * (.25 + .75 * h21(vec2(floor((sa + 3.14159) / TAU), i * 1.7)));
    float fade = smoothstep(1.08, .0, s) * smoothstep(-.02, .06, s);
    float base = mix(1.2, .15, sqrt(clamp(s, 0., 1.)));
    vec3 v = (bod * fil * .9 + bod * .2) * fade * base;
    if (kind > .8){ red += v.g * smoothstep(.42, .72, fbm(vec2(s * 4. + uT * .2, i))) * (.55 + .45 * sin(uT * 1.7 + ph)); continue; }
    if (kind > .45){ dark += bod.g * fade; continue; }   // silenced: an absence in the corona
    vec3 tint = mix(mix(PALE, sheen(th * 1.7 + s * 1.4 + i * .13 + uT * .03), .12), vec3(.80, 1., .86), sing);   // a voice: a light that is not quite a colour
    cor += v * tint * (.55 + .45 * a.z) * (1. + sing * 1.6);
    pull += sing * bod.g * fade;
  }
  float out_ = max(0., r - 1.);
  float halo = exp(-out_ * 5.) * (.25 + .6 * fbm(vec2(th * 9., r * 5. - uT * .05) + w));
  float beads = .4 + 1. * pow(fbm(vec2(th * 30., uT * .05)), 2.);
  float limb = (exp(-pow((r - 1.) / .0025, 2.)) * 1.4 + exp(-out_ * 50.) * .5 * step(1., r)) * beads;
  // faint engraved rings around the body, far larger than anything on the ground
  float rings = 0.;
  for (int j = 0; j < 4; j++){ float rr = 1.18 + .17 * float(j) + .03 * float(j * j);
    rings += exp(-pow((r - rr) / .0018, 2.)) * (.5 + .5 * cos(th * 900.)) * smoothstep(.3, .7, fbm(vec2(th * 12., float(j)))); }
  // the iceberg: the disk is only part of something far larger, a membrane felt more than seen
  float mem = smoothstep(1.5, 2.1, r) * smoothstep(3.4, 2.4, r) * pow(fbm(vec2(th * 4., r * 2.5) + w * .8), 2.);
  float edge = exp(-pow((r - 2.55 - (fbm(vec2(th * 6., 2.)) - .5) * .35) / .006, 2.)) * smoothstep(.35, .6, fbm(vec2(th * 14., 9.)));
  col += vec3(.07, .045, .09) * mem * .9 + PALE * edge * .10;
  cor = max(vec3(0.), cor - dark * .9);
  col = col * (1. - clamp(cor.g, 0., 1.) * .5) + cor + PALE * (halo * .16 + limb) * (1. + uGod * .8)
      + sheen(th * 3. + uT * .02) * halo * .05 + PALE * rings * .08 + RUB * red;
  // inside the disk: not darkness but another sky; its stars are not ours and turn the wrong way
  if (r < 1.){
    float ca = cos(-uT * .006), sa2 = sin(-uT * .006);
    vec2 q = mat2(ca, -sa2, sa2, ca) * p;
    vec3 inside = vec3(.002, .003, .003);
    // an opaque mass, not a hole: a cold surface that barely holds light, veined, and a sky that is not ours
    float surf = fbm(q * 3.5 + vec2(uT * .004, 0.)), vein = pow(1. - abs(fbm(q * 7. + 4.) * 2. - 1.), 9.);
    inside += vec3(.020, .024, .026) * surf * smoothstep(.2, 1., r) + vec3(.05, .07, .065) * vein * smoothstep(.4, .98, r) * (1. + uGod * 2.);
    inside += PALE * pow(smoothstep(.75, 1., r), 3.) * .035;
    inside += vec3(.55, .85, .70) * stars(q * uR, 17.3, .0012) * .2 * smoothstep(.7, .3, r);
    float fib = pow(fbm(vec2(th * 60., r * 30.)), 4.) * smoothstep(.8, .99, r) * smoothstep(1., .985, r);
    inside += PALE * fib * .06 * (1. + uGod * 3.);
    inside += PALE * exp(-pow((r - .992) / .006, 2.)) * .06;
    col = inside;
  }
  // the ground: a black horizon, engraved, lit only at its rim; one Watcher stands on it
  float hy = uHz + (fbm(vec2(fc.x / uRes.x * 7., 1.3)) - .5) * uRes.y * .025 + (fbm(vec2(fc.x / uRes.x * 40., 4.)) - .5) * uRes.y * .004;
  float glowX = exp(-pow((fc.x - uC.x) / (uR * 1.1), 2.));
  if (fc.y < hy){
    float depth = (hy - fc.y) / uRes.y;
    float lines = .5 + .5 * cos((fc.y + fbm(vec2(fc.x / uRes.x * 3., 0.)) * 30. * uPx) / (2.4 * uPx) * TAU);
    col = vec3(.005, .006, .006) + PALE * pow(lines, 6.) * .05 * exp(-depth * 9.) * (.3 + glowX);
  }
  col += PALE * exp(-pow((fc.y - hy) / (1.2 * uPx), 2.)) * .35 * (.2 + glowX);
  vec2 f = (fc - uFig) / uPx;                                     // the Watcher: 16 css px against all of that
  float fig = min(length(f - vec2(0., 13.8)) - 1.6, max(abs(f.x) - 1.4 + f.y * .03, abs(f.y - 6.) - 6.));
  col = mix(col, vec3(.004, .005, .005), smoothstep(.6, -.6, fig));
  // vignette, grain, flicker, tone
  col *= .45 + .55 * smoothstep(1.2, .2, length((uv - vec2(.45, .45)) * vec2(1.1, 1.3)));
  col += (h21(fc + floor(uT * 14.)) - .5) * (.03 + uGod * .03);
  col *= 1. - uGod * .06 * step(.5, h21(vec2(floor(uT * 9.), 1.)));
  col = 1. - exp(-col * 1.45);
  gl_FragColor = vec4(col, 1.);
}`;

  function pack(score) {
    const god = new Set(score.offerings.filter((o) => o.conductor).map((o) => o.tx));
    const items = []; let reg = 0, gi = 0;
    const gods = score.timeline.filter((p) => god.has(p.tx)).length;
    const arc = (u) => 0.53 + 0.44 * u;                               // the lower half: everything reaches down
    score.timeline.forEach((p, n) => {
      const g = genes(p.contrib_id, n, 12);
      const loud = clamp01((p.energy - 500) / 1000), bright = clamp01((p.zero_crossings - 1500) / 1700), secs = clamp01((p.samples / 8000 - 2) / 6);
      const isGod = god.has(p.tx);
      const ang = isGod ? arc((gi++ + 0.5) / Math.max(1, gods)) : arc(((reg++ * PHI + g[0] * 0.01) % 1));
      items.push({ start: p.start, end: p.start + p.samples,
        a: [ang, secs, loud, bright], b: [0.5 + (p.pan - 8) / 16 * 0.9 + (g[1] - 0.5) * 0.1, bright, g[2], isGod ? 0.33 : p.silent ? 0.6 : 0] });
    });
    score.skipped.filter((s) => s.reason === "forged-conductor").forEach((s, i) => {
      const g = genes(parseInt(s.tx.slice(0, 8), 16) >>> 0, i, 6);
      items.push({ start: -1, end: -1, a: [arc(g[0]), g[1], 0.2 + g[2] * 0.3, g[3]], b: [g[4], 0.5, g[5], 1] });
    });
    return items.slice(0, MAX);
  }

  function create(canvas, score) {
    const gl = canvas.getContext("webgl", { antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (!gl) return null;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog); gl.useProgram(prog);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const items = pack(score), data = new Uint8Array(MAX * 4 * 4);
    items.forEach((it, i) => { for (let c = 0; c < 4; c++) { data[i * 4 + c] = Math.round(clamp01(it.a[c]) * 255); data[(MAX + i) * 4 + c] = Math.round(clamp01(it.b[c]) * 255); } });
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, MAX, 4, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    const U = {}; for (const n of ["uRes", "uC", "uSeed", "uFig", "uR", "uT", "uN", "uGod", "uHz", "uPx", "uD"]) U[n] = gl.getUniformLocation(prog, n);
    const hb = (i) => parseInt(score.render_hash.slice(i * 2, i * 2 + 2), 16) / 255;
    gl.uniform2f(U.uSeed, hb(0) * 0.7 + 0.1, hb(1) * 0.7 + 0.1); gl.uniform1f(U.uN, items.length); gl.uniform1i(U.uD, 0);
    const godIdx = new Set(items.map((it, i) => (it.b[3] > 0.2 && it.b[3] < 0.45 ? i : -1)).filter((i) => i >= 0));
    const row = new Uint8Array(MAX * 4);
    let geo = null;
    return {
      // all positions in device px with y down (css-like); converted to GL (y up) here
      resize(w, h, g) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h);
        geo = { cx: g.cx, cy: h - g.cy, R: g.R, hz: h - g.hz, fx: g.fx, fy: h - g.hz, px: g.px }; },
      frame(t, time) {
        let god = 0;
        items.forEach((it, i) => {
          const v = t < 0 || it.start < 0 ? 0 : clamp01((t - it.start) / 1200) * clamp01((it.end - t) / 2400);
          row[i * 4] = Math.round(v * 255); if (godIdx.has(i)) god = Math.max(god, v);
        });
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 2, MAX, 1, gl.RGBA, gl.UNSIGNED_BYTE, row);
        gl.uniform2f(U.uRes, canvas.width, canvas.height); gl.uniform2f(U.uC, geo.cx, geo.cy); gl.uniform1f(U.uR, geo.R);
        gl.uniform1f(U.uHz, geo.hz); gl.uniform2f(U.uFig, geo.fx, geo.fy); gl.uniform1f(U.uPx, geo.px);
        gl.uniform1f(U.uT, time); gl.uniform1f(U.uGod, god);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
    };
  }
  window.Abyss = { create };
})();
