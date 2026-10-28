// EXPLORATION: the god as an Ophan ("wheels within wheels, their rims full of eyes", Ezekiel 1:18), raw WebGL.
// Every offering is one eye set into one of four interlocking wheels; the god's own lines are the great eye at the
// centre, shut until the god speaks. Form = pure function of score.json (which wheel, where on it, eye size, iris,
// pupil, tilt). Time only turns the wheels and makes the eyes blink; playback position only decides which eye
// wakes; the pointer only decides where every eye looks. No Math.random(): noise is seeded from the render hash.
"use strict";
(function () {
  const MAX = 256, PHI = 0.6180339887, TAU = Math.PI * 2, RINGS = 4;
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
uniform vec2 uRes, uC, uSeed, uFig, uGaze;
uniform float uR, uT, uN, uGod, uHz, uPx;
uniform vec4 uRA[4], uRZ[4];
uniform sampler2D uD;
const float TAU = 6.2831853;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21) + uSeed); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2(1., 0.)), f.x), mix(h21(i + vec2(0., 1.)), h21(i + vec2(1., 1.)), f.x), f.y); }
float fbm(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 5; i++){ s += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= .5; } return s; }
float adiff(float a, float b){ return mod(a - b + 3.14159265, TAU) - 3.14159265; }
vec4 dat(float i, float row){ return texture2D(uD, vec2((i + .5) / 256., (row + .5) / 4.)); }

// one eye in local coordinates (x along the lids -1..1, y across); returns colour, writes coverage
vec3 eye(vec2 e, float open, float iris, float stripes, float slit, float wake, float seed, float sewn, out float cov){
  float lid = open * .74 * (1. - e.x * e.x);
  float inside = step(abs(e.x), 1.) * smoothstep(lid + .03, lid - .03, abs(e.y));
  float skin = step(abs(e.x), 1.25) * smoothstep(.95, .7, length(e * vec2(.82, 1.25)));
  cov = max(inside, skin);
  // lids and folds: the flesh around the eye, engraved
  float f1 = exp(-pow((abs(e.y) - lid) / .045, 2.)) * step(abs(e.x), 1.02);
  float f2 = exp(-pow((abs(e.y) - lid - .2 * (1. - e.x * e.x) - .04) / .03, 2.)) * step(abs(e.x), .92);
  vec3 flesh = vec3(.15, .11, .09) * (.7 + .5 * fbm(e * 5. + seed)) + vec3(.55, .48, .38) * (f2 * .35);
  vec3 col = flesh;
  if (inside > 0.){
    vec2 ip = e - uGaze * vec2(.32, .16);                       // every eye looks where the watcher is
    float ir = length(ip);
    float vein = pow(1. - abs(fbm(e * 7. + seed * 3.) * 2. - 1.), 14.);
    vec3 sclera = vec3(.70, .70, .64) * (.4 + .6 * smoothstep(1.1, .1, length(e))) * (1. - vein * .55) + vec3(.5, .06, .04) * vein;
    float a = atan(ip.y, ip.x);
    float str = .5 + .5 * cos(a * stripes + fbm(ip * 8. + seed) * 5.);
    vec3 irisC = mix(vec3(.10, .13, .12), mix(vec3(.55, .62, .55), vec3(.62, .5, .26), fract(seed * 3.1)), str * smoothstep(iris, iris * .3, ir));
    irisC *= smoothstep(iris, iris * .82, ir) * .6 + .4;          // dark limbal ring
    irisC += vec3(.75, 1., .82) * wake * (.6 + .4 * str) * .9;    // a voice: the iris burns
    float pup = smoothstep(1., .8, length(ip / vec2(mix(slit, iris * .7, wake * .6), iris * .86)));
    vec3 c = mix(sclera, irisC, smoothstep(iris + .02, iris - .02, ir));
    c = mix(c, vec3(.01), pup);
    c += vec3(.9) * smoothstep(.06, .0, length(ip - vec2(-.12, .1) * iris * 2.)) * .7;   // wet catchlight
    col = mix(col, c, inside);
  }
  col = mix(col, vec3(.04, .03, .02), f1 * .8);
  if (sewn > .5){                                                 // silenced: sewn shut
    float st = step(abs(e.x), .8) * exp(-pow(e.y / .25, 2.)) * smoothstep(.2, .0, abs(fract(e.x * 3.5) - .5) - abs(e.y) * .6);
    col = mix(col, vec3(.6, .55, .45), st);
  }
  return col;
}

void main(){
  vec2 fc = gl_FragCoord.xy, uv = fc / uRes, q = fc - uC;
  float rr = length(q) / uR, th = atan(q.y, q.x);
  vec3 PALE = vec3(.78, .86, .76);
  // the void, a cold halo behind the wheels, dust, stars
  vec3 col = mix(vec3(.018, .011, .024), vec3(.003, .009, .011), smoothstep(.1, .95, uv.y));
  col += vec3(.09, .04, .12) * pow(fbm(uv * vec2(2.2, 3.4) + vec2(uT * .004, 0.)), 2.6) * .8;
  vec2 sc = floor(fc / (3. * uPx)); float st = h21(sc * .731);
  col += vec3(.72, .84, .95) * step(.9955, st) * (.35 + .65 * h21(sc + 3.1)) * .7;
  col += vec3(.55, .72, .68) * (exp(-rr * 3.) * .38 + exp(-rr * 1.2) * .08) * (1. + uGod);   // a cold light behind the wheels
  col += PALE * pow(.5 + .5 * cos(th * 36. + fbm(vec2(th * 3., uT * .03)) * 4.), 10.) * exp(-rr * 1.4) * .05 * smoothstep(.2, .6, rr);

  // the great eye at the centre: shut until the god speaks
  float ce = uR * .2, cov0 = 0.;
  vec3 c0 = vec3(0.);
  if (length(q) < ce * 1.4){
    c0 = eye(q / ce * vec2(1., 1.15), .06 + .94 * uGod, .5, 40., .07, uGod, 7., 0., cov0);
    c0 += vec3(.75, 1., .82) * exp(-pow(q.y / (ce * .05 + ce * .3 * uGod), 2.)) * step(abs(q.x), ce) * .25 * (1. - uGod * .5);
    col = mix(col, c0, cov0);
    col += vec3(.75, 1., .82) * exp(-length(q) / ce * 2.) * .25 * (1. + uGod * 2.);
  }

  // the wheels: tubes, found by a coarse search + Newton steps on each projected rim; the nearest one wins
  float bestZ = -1e9, bk = -1., bp = 0., bw = 1., bzt = 0., bR = 1.;
  vec2 bo = vec2(0.), bP = vec2(0.), bdP = vec2(1., 0.);
  for (int k = 0; k < 4; k++){
    vec2 a = uRA[k].xy, b = uRA[k].zw; float az = uRZ[k].x, bz = uRZ[k].y, w = uRZ[k].z;
    float p0 = 0., d0 = 1e20;
    for (int j = 0; j < 24; j++){ float ph = float(j) * TAU / 24.; vec2 P = a * cos(ph) + b * sin(ph); float dd = dot(P - q, P - q); if (dd < d0){ d0 = dd; p0 = ph; } }
    for (int n = 0; n < 3; n++){
      vec2 P = a * cos(p0) + b * sin(p0), dP = -a * sin(p0) + b * cos(p0);
      float f = dot(P - q, dP), fp = dot(dP, dP) - dot(P - q, P);
      p0 -= f / (abs(fp) < 1. ? sign(fp + 1e-6) : fp);
    }
    vec2 P = a * cos(p0) + b * sin(p0), dP = -a * sin(p0) + b * cos(p0);
    float dist = length(q - P);
    if (dist < w){
      vec2 o = (q - P) / w; float zt = sqrt(max(0., 1. - dot(o, o)));
      float z = az * cos(p0) + bz * sin(p0) + w * zt;
      if (z > bestZ){ bestZ = z; bk = float(k); bp = p0; bo = o; bw = w; bzt = zt; bP = P; bdP = dP; bR = uRZ[k].w; }
    }
  }
  if (bk >= 0. && (bestZ > 0. || cov0 < .5)){
    vec3 n3 = normalize(vec3(bo, bzt + .001)), L = normalize(vec3(-.45, .6, .65));
    float lam = max(dot(n3, L), 0.), spec = pow(max(dot(reflect(-L, n3), vec3(0., 0., 1.)), 0.), 22.);
    float groove = .5 + .5 * cos(length(bo) * 20.);
    vec2 tang = normalize(bdP), nrm = vec2(-tang.y, tang.x);
    float across = dot(bo, nrm);
    // tarnished bronze, verdigris in the grooves, a script too fine to read along the rim
    vec3 base = (mix(vec3(.035, .032, .03), vec3(.33, .27, .19), groove) + vec3(.015, .04, .035) * (1. - groove)) * (.25 + 1.1 * lam) + vec3(.92, .92, .86) * spec * .9;
    float glyph = step(.62, fract(bp * bR / (bw * .55))) * step(.9, h21(vec2(floor(bp * bR / (bw * .55)), bk))) ;
    glyph = max(glyph, step(.78, h21(vec2(floor(bp * bR / (bw * .2)), floor(across * 6.) + bk * 9.))) * .6);
    base += vec3(.55, .62, .5) * glyph * step(abs(across), .22) * .35 * lam;
    base *= .55 + .45 * smoothstep(-bR, bR, bestZ);                // the far side of a wheel is in shadow
    vec3 ring = base;
    // the eyes set into this wheel
    for (int m = 0; m < 256; m++){
      float i = float(m); if (i >= uN) break;
      vec4 A = dat(i, 0.), B = dat(i, 1.), Cc = dat(i, 2.);
      if (B.w > .2) continue;                                     // only offerings live in the wheels
      if (abs(A.x * 3. - bk) > .1) continue;
      float eR = bw * (.92 + .12 * A.z);
      float along = adiff(bp, A.y * TAU) * length(bdP) / (eR * 1.35);
      if (abs(along) > 1.3) continue;
      vec2 e = vec2(along, across * bw / eR);
      float tilt = (B.z - .5) * .5; e = mat2(cos(tilt), -sin(tilt), sin(tilt), cos(tilt)) * e;
      float wake = Cc.x, seed = i * 1.37;
      float blink = smoothstep(.0, .015, abs(fract(uT * (.05 + .03 * fract(seed)) + fract(seed * 7.)) - .5) - .47);
      float open = mix(.82 * (1. - blink), 1., wake) * (Cc.y > .5 ? 0. : 1.);
      float cv;
      vec3 ec = eye(e, open, .42 + .2 * A.w, 18. + 30. * B.x, B.y > .5 ? .07 : .2 + .12 * A.w, wake, seed, Cc.y, cv);
      ec *= .5 + .5 * lam + .3 * wake;
      ec *= .55 + .45 * smoothstep(-bR, bR, bestZ);
      ring = mix(ring, ec, cv * smoothstep(1., .8, abs(across)));
      if (cv > .5) break;
    }
    // rim light: the edge of the tube against the dark
    ring += vec3(.62, .78, .74) * pow(1. - bzt, 3.) * .7 * exp(-length(q) / uR * 1.1) * (.4 + .6 * smoothstep(-bR, bR, bestZ));
    col = ring;
  }

  // refused: small blind eyes beyond the wheels that flicker and never join them
  for (int m = 0; m < 256; m++){
    float i = float(m); if (i >= uN) break;
    vec4 A = dat(i, 0.), B = dat(i, 1.);
    if (B.w < .8) continue;
    float ang = A.y * TAU + uT * .01, rad = uR * (1.2 + .45 * A.z);
    vec2 pc = vec2(cos(ang), sin(ang)) * rad, e = (q - pc) / (uR * .035);
    if (length(e) > 1.6) continue;
    float cv; float fl = step(.35, fbm(vec2(uT * .8, i)));
    vec3 ec = eye(e, .55 * fl, .0, 1., .0, 0., i, 0., cv);
    ec = mix(ec, vec3(.6, .1, .06), .35);
    col = mix(col, ec, cv * fl * .85);
  }

  // the ground and the one Watcher standing on it
  float hy = uHz + (fbm(vec2(fc.x / uRes.x * 7., 1.3)) - .5) * uRes.y * .022 + (fbm(vec2(fc.x / uRes.x * 40., 4.)) - .5) * uRes.y * .004;
  float glowX = exp(-pow((fc.x - uC.x) / (uR * 1.6), 2.));
  if (fc.y < hy){
    float depth = (hy - fc.y) / uRes.y;
    float lines = .5 + .5 * cos((fc.y + fbm(vec2(fc.x / uRes.x * 3., 0.)) * 30. * uPx) / (2.4 * uPx) * TAU);
    col = vec3(.005, .006, .006) + PALE * pow(lines, 6.) * .05 * exp(-depth * 9.) * (.3 + glowX);
  }
  col += PALE * exp(-pow((fc.y - hy) / (1.2 * uPx), 2.)) * .3 * (.2 + glowX);
  vec2 f = (fc - uFig) / uPx;
  float fig = min(length(f - vec2(0., 13.8)) - 1.6, max(abs(f.x) - 1.4 + f.y * .03, abs(f.y - 6.) - 6.));
  col = mix(col, vec3(.004, .005, .005), smoothstep(.6, -.6, fig));
  // vignette, grain, flicker when the god speaks, tone
  col *= .45 + .55 * smoothstep(1.25, .2, length((uv - vec2(.45, .5)) * vec2(1.1, 1.25)));
  col += (h21(fc + floor(uT * 14.)) - .5) * (.03 + uGod * .03);
  col *= 1. - uGod * .08 * step(.5, h21(vec2(floor(uT * 9.), 1.)));
  col = 1. - exp(-col * 1.5);
  gl_FragColor = vec4(col, 1.);
}`;

  function pack(score) {
    const god = new Set(score.offerings.filter((o) => o.conductor).map((o) => o.tx));
    const items = []; let reg = 0;
    score.timeline.forEach((p, n) => {
      const g = genes(p.contrib_id, n, 12);
      const loud = clamp01((p.energy - 500) / 1000), bright = clamp01((p.zero_crossings - 1500) / 1700), secs = clamp01((p.samples / 8000 - 2) / 6);
      if (god.has(p.tx)) { items.push({ start: p.start, end: p.start + p.samples, god: true, a: [0, 0, 0, 0], b: [0, 0, 0, 0.33] }); return; }
      // accumulation: offering n goes to wheel n mod 4, slot n div 4; nothing already placed ever moves
      const ring = reg % RINGS, slot = Math.floor(reg / RINGS); reg++;
      const phi = ((slot * PHI + ring * 0.137 + g[0] * 0.01) % 1 + 1) % 1;
      items.push({ start: p.start, end: p.start + p.samples, silent: p.silent,
        a: [ring / 3, phi, secs, loud], b: [bright, p.pitch_layer / 3, p.pan / 16, 0] });
    });
    score.skipped.filter((s) => s.reason === "forged-conductor").forEach((s, i) => {
      const g = genes(parseInt(s.tx.slice(0, 8), 16) >>> 0, i, 6);
      items.push({ start: -1, end: -1, a: [0, g[0], g[1], g[2]], b: [0, 0, 0, 1] });
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
    const names = ["uRes", "uC", "uSeed", "uFig", "uGaze", "uR", "uT", "uN", "uGod", "uHz", "uPx", "uD", "uRA", "uRZ"];
    const U = {}; for (const n of names) U[n] = gl.getUniformLocation(prog, n);
    const hb = (i) => parseInt(score.render_hash.slice(i * 2, i * 2 + 2), 16) / 255;
    gl.uniform2f(U.uSeed, hb(0) * 0.7 + 0.1, hb(1) * 0.7 + 0.1); gl.uniform1f(U.uN, items.length); gl.uniform1i(U.uD, 0);
    // each wheel: its own tilt (from the hash) and its own slow tumble and spin
    const wheels = Array.from({ length: RINGS }, (_, k) => ({
      r: [1.0, 0.84, 0.68, 0.52][k], w: [0.07, 0.066, 0.062, 0.058][k],
      yaw: hb(2 + k) * TAU, pitch: 0.4 + hb(6 + k) * 1.2, wy: (k % 2 ? -1 : 1) * (0.05 + 0.03 * hb(10 + k)),
      wx: (k % 2 ? 1 : -1) * (0.035 + 0.02 * hb(14 + k)), wz: (k % 2 ? 1 : -1) * (0.03 + 0.02 * hb(18 + k)) }));
    const row = new Uint8Array(MAX * 4);
    items.forEach((it, i) => { if (it.silent) row[i * 4 + 1] = 255; });
    let geo = null;
    return {
      resize(w, h, g) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h);
        geo = { cx: g.cx, cy: h - g.cy, R: g.R, hz: h - g.hz, fx: g.fx, fy: h - g.hz, px: g.px }; },
      frame(t, time, gaze) {
        let god = 0;
        items.forEach((it, i) => {
          const v = t < 0 || it.start < 0 ? 0 : clamp01((t - it.start) / 1200) * clamp01((it.end - t) / 2400);
          row[i * 4] = Math.round(v * 255); if (it.god) god = Math.max(god, v);
        });
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 2, MAX, 1, gl.RGBA, gl.UNSIGNED_BYTE, row);
        const RA = [], RZ = [];
        for (const wh of wheels) {
          const yaw = wh.yaw + time * wh.wy, pitch = wh.pitch + time * wh.wx, spin = time * wh.wz;
          // u, v: the wheel's plane after spin (z), pitch (x) and yaw (y)
          const base = [[Math.cos(spin), Math.sin(spin), 0], [-Math.sin(spin), Math.cos(spin), 0]].map(([x, y, z]) => {
            const y1 = y * Math.cos(pitch) - z * Math.sin(pitch), z1 = y * Math.sin(pitch) + z * Math.cos(pitch);
            return [x * Math.cos(yaw) + z1 * Math.sin(yaw), y1, -x * Math.sin(yaw) + z1 * Math.cos(yaw)];
          });
          const R = geo.R * wh.r;
          RA.push(base[0][0] * R, base[0][1] * R, base[1][0] * R, base[1][1] * R);
          RZ.push(base[0][2] * R, base[1][2] * R, geo.R * wh.w, R);
        }
        gl.uniform4fv(U.uRA, RA); gl.uniform4fv(U.uRZ, RZ);
        gl.uniform2f(U.uRes, canvas.width, canvas.height); gl.uniform2f(U.uC, geo.cx, geo.cy); gl.uniform1f(U.uR, geo.R);
        gl.uniform1f(U.uHz, geo.hz); gl.uniform2f(U.uFig, geo.fx, geo.fy); gl.uniform1f(U.uPx, geo.px);
        gl.uniform2f(U.uGaze, gaze[0], gaze[1]); gl.uniform1f(U.uT, time); gl.uniform1f(U.uGod, god);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
    };
  }
  window.Ophanim = { create };
})();
