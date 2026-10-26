// The god seen from below (three.js). Built from design/explorations/god6.js; spec: docs/visual-direction.md.
//
// Form = pure function of score.json (offerings -> eyes on the halos, the god's own lines -> the great eye and the
// wings, blocks -> the Dweller's arms, forgeries -> blind red eyes, flagged -> sewn lids). Time only animates
// (spin, writhe, breathe, blink); playback wakes the eye whose voice sounds; the pointer moves the great eye's gaze
// and a few degrees of camera. No Math.random(): every noise is positional hashing seeded from render_hash.
// Pixel output may differ by GPU; nothing visual is hashed.
//
// Interface (window.God):
//   God.supported()                      -> true when WebGL2 is available (else app.js keeps creature.js)
//   God.mount(canvas, doc, opts)         -> handle; doc = out/score.json; opts.reducedMotion
//   handle.setPlayT(t)                   -> sample position under playback (-1 = silent)
//   handle.setEyeOpen(v)                 -> séance: great eye lids 0..1 (undefined = open)
//   handle.setViewOffset(px)             -> the leaf: the god's view glides left by px (desktop)
//   handle.pick(clientX, clientY)        -> txid of the offering whose eye is under the pointer, or null
//   handle.stats()                       -> { calls, triangles, fps, dpr } (draw calls of the scene pass)
//   handle.dispose()                     -> free GPU resources (a new render_hash mounts a new god)
import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "./vendor/three/BufferGeometryUtils.js";
// ?slowgod=<ms> delays this module's arrival, to reproduce a slow network where score.json lands first (the fallback
// must not keep the god from mounting afterwards: web/app.js gives every mount a fresh canvas)
{ const ms = Number(new URLSearchParams(location.search).get("slowgod") || 0); if (ms > 0) await new Promise((r) => setTimeout(r, ms)); }

const TAU = Math.PI * 2;
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

function supported() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2")); } catch (e) { return false; }
}

// ================================================================ shared GLSL
const COMMON = `
uniform vec3 uKey, uRim, uUnder, uSingP; uniform float uTime, uSing, uUnderK;
float hash3(vec3 p){ p = fract(p * .3183099 + .1); p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1., 0., 0.)), f.x), mix(hash3(i + vec3(0., 1., 0.)), hash3(i + vec3(1., 1., 0.)), f.x), f.y),
             mix(mix(hash3(i + vec3(0., 0., 1.)), hash3(i + vec3(1., 0., 1.)), f.x), mix(hash3(i + vec3(0., 1., 1.)), hash3(i + vec3(1., 1., 1.)), f.x), f.y), f.z); }
float fbm3(vec3 p){ float a = .5, s = 0.; for (int i = 0; i < 3; i++){ s += a * noise3(p); p = p * 2.03 + 3.1; a *= .5; } return s; }
vec3 bumpN(vec3 N, vec3 P, float h, float s){
  vec3 dpx = dFdx(P), dpy = dFdy(P); float hx = dFdx(h), hy = dFdy(h);
  vec3 r1 = cross(dpy, N), r2 = cross(N, dpx); float det = dot(dpx, r1);
  return normalize(abs(det) * N - s * sign(det) * (hx * r1 + hy * r2));
}
vec3 shade(vec3 alb, vec3 N, vec3 P, float rough, float sss, float ao){
  vec3 V = normalize(cameraPosition - P);
  float nk = dot(N, uKey), k = max(nk, 0.), wrap = max((nk + .5) / 1.5, 0.);
  float fres = pow(1. - max(dot(N, V), 0.), 4.5);
  float back = smoothstep(-.3, .9, dot(uRim, -V)) * max(dot(N, uRim) + .35, 0.);
  vec3 Lu = uUnder - P; float du = length(Lu); float u = max(dot(N, Lu / du), 0.) * 12. / (1. + du * du * .06) * uUnderK;
  vec3 Ls = uSingP - P; float ds = length(Ls); float sg = uSing * max(dot(N, Ls / ds), 0.) * 2.2 / (1. + ds * ds * 2.5);   // local: the voice lights its neighbours only
  float sp = pow(max(dot(N, normalize(uKey + V)), 0.), mix(140., 14., rough)) * (1. - rough);
  float spR = pow(max(dot(N, normalize(uRim + V)), 0.), mix(100., 10., rough)) * (1. - rough);
  return alb * ao * (vec3(.006, .008, .012) + vec3(.3, .35, .37) * mix(k, wrap, sss) + vec3(.62, .09, .04) * u + vec3(.45, 1., .7) * sg)
       + vec3(.55, .95, .82) * fres * back * 1.5 * ao + vec3(.9) * sp * .55 + vec3(.6, 1., .85) * spR * 1.1
       + vec3(.22, .015, .025) * fres * sss;
}
vec3 fogged(vec3 c, vec3 P){
  float d = length(cameraPosition - P), f = 1. - exp(-d * d * .0006);
  float low = smoothstep(-1., -9., P.y);
  return mix(c, mix(vec3(.001, .002, .003), vec3(.03, .004, .003), low), clamp(f + low * .2, 0., 1.));
}`;

const FLESH_VS = (arms) => `attribute float aRad, aPhase, aLen; uniform float uTime;
varying vec3 vP, vN, vObj; varying vec2 vUv; varying float vLen, vRad;
void main(){
  vec3 p = position; float t = uv.x;
  ${arms ? `
  p += normal * aRad * (.12 * sin(t * 22. - uTime * 2.2 + aPhase) * (1. - t * .7));
  p += vec3(sin(t * 6. + uTime * .5 + aPhase), cos(t * 5. + uTime * .42 + aPhase * 1.3) * .7, sin(t * 4.5 - uTime * .38 + aPhase * .7)) * t * t * 1.15;
  p += vec3(sin(t * 15. - uTime * 1.4 + aPhase), cos(t * 13. - uTime * 1.15 + aPhase), 0.) * pow(t, 4.) * .4;` : `
  p *= 1. + .012 * sin(uTime * .6 + length(p) * .3);`}
  vec4 wp = modelMatrix * vec4(p, 1.); vP = wp.xyz; vN = normalize(mat3(modelMatrix) * normal);
  vObj = position * ${arms ? "1." : ".42"} + aPhase; vUv = uv; vLen = aLen; vRad = max(aRad, .05);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const FLESH_FS = (arms) => `varying vec3 vP, vN, vObj; varying vec2 vUv; varying float vLen, vRad;
void main(){
  vec3 N = normalize(vN);
  float n = fbm3(vObj * 2.), spots = smoothstep(.56, .72, fbm3(vObj * 6. + 3.));
  float vein = pow(1. - abs(fbm3(vObj * 3.3 + 1.7) * 2. - 1.), 16.);
  float pores = noise3(vObj * 38.);
  vec3 c = mix(vec3(.012, .009, .014), vec3(.095, .032, .042), n * n);
  c = mix(c, vec3(.26, .17, .1), smoothstep(.64, .8, fbm3(vObj * 1.3 + 9.)) * .45);
  float h, ao = 1.;
  ${arms ? `
  float t = vUv.x;
  float vent = smoothstep(.6, .7, vUv.y) * smoothstep(.96, .86, vUv.y);
  c = mix(c, vec3(.2, .13, .12), vent);
  float vv = (vUv.y - .78) / .085, su = fract(t * vLen * 1.7) - .5, d = length(vec2(su * 2.4, vv));
  float on = step(abs(vv), 1.35) * step(t, .965) * smoothstep(0., .03, t);
  float cup = (smoothstep(1., .72, d) - smoothstep(.55, .18, d) * 1.4) * on;
  float wr = pow(.5 + .5 * sin(t * vLen * 10. + n * 6.), 4.);
  h = cup + wr * .45 + n * .5 + pores * .12;
  c = mix(c, vec3(.36, .25, .22), smoothstep(.95, .72, d) * smoothstep(.42, .6, d) * on * .7);
  c = mix(c, vec3(.03, .006, .01), smoothstep(.42, .15, d) * on);
  ao = mix(1., .55, smoothstep(.42, .1, d) * on) * (.45 + .55 * smoothstep(0., .22, t)) * (.7 + .3 * wr);
  N = bumpN(N, vP, h, .03 * vRad);` : `
  float ridge = pow(1. - abs(fbm3(vObj * 1.4) * 2. - 1.), 3.);
  h = ridge * .9 + n * .4 + pores * .12;
  ao = .45 + .55 * ridge;
  N = bumpN(N, vP, h, .09);`}
  c = mix(c, vec3(.012, .006, .01), spots * .75);
  c = mix(c, vec3(.3, .015, .025), vein * .55);
  c *= .8 + .4 * pores;
  float rough = mix(.8, .12, smoothstep(.45, .72, n + vein * .3));
  gl_FragColor = vec4(fogged(shade(c, N, vP, rough, 1., ao), vP), 1.);
}`;

// drawn in a 2048x64 design space and rasterised at W x H: the same script at any texture size
function scriptTexture(seed, W = 2048, H = 64, aniso = 4) {
  const c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d");
  x.fillStyle = "#000"; x.fillRect(0, 0, W, H); x.setTransform(W / 2048, 0, 0, H / 64, 0, 0);
  x.strokeStyle = "#fff"; x.lineCap = "round";
  let i = 0;
  for (let px = 8; px < 2040; px += 16) {   // a script too fine to read, cut from the hash (sparser since 26 Oct)
    const g = genes(seed, i++, 8); x.lineWidth = 1.2 + g[7] * 1.2; x.beginPath();
    x.moveTo(px + g[0] * 6, 14 + g[1] * 36); x.lineTo(px + g[2] * 6, 14 + g[3] * 36); x.quadraticCurveTo(px + g[4] * 8, 10 + g[5] * 44, px + g[6] * 6, 14 + g[7] * 36); x.stroke();
    if (g[0] > 0.86) { x.beginPath(); x.arc(px + 3, 32, 4 + g[1] * 4, 0, TAU); x.stroke(); }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = aniso;
  return t;
}

// ================================================================ mount
function mount(canvas, doc, opts = {}) {
  const PHONE = matchMedia("(max-width: 900px), (pointer: coarse)").matches;
  const CALM = !!opts.reducedMotion;                       // prefers-reduced-motion: no sway, slow writhe, no saccades
  const S = { render_hash: doc.render_hash, timeline: doc.render.timeline, offerings: doc.score.offerings, skipped: doc.score.skipped };
  const hb = (i) => parseInt(S.render_hash.slice(2 * i, 2 * i + 2), 16) / 255;
  const seed0 = parseInt(S.render_hash.slice(0, 8), 16) >>> 0;
  const disposables = [];
  const keep = (o) => { disposables.push(o); return o; };

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;           // the composite pass does tone + gamma itself
  renderer.toneMapping = THREE.NoToneMapping;
  // resolution: an HD target (short side >= 1080 px desktop / 720 px phone, within the screen's own ratio and the
  // GPU's max size), then adaptive both ways with hysteresis (web/dpr.js); ?dpr=N pins it. Resolution only.
  const gl = renderer.getContext();
  const GPU_MAX = Math.min(renderer.capabilities.maxTextureSize, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), gl.getParameter(gl.MAX_VIEWPORT_DIMS)[0]);
  const DPR_Q = new URLSearchParams(location.search).get("dpr");
  const limitsNow = () => DprAdapter.limits(devicePixelRatio, PHONE, DPR_Q, canvas.clientWidth || innerWidth, canvas.clientHeight || innerHeight, GPU_MAX);
  const DPR = DprAdapter.create(limitsNow());
  let dpr = DPR.dpr;
  const ANISO = Math.min(2, renderer.capabilities.getMaxAnisotropy());
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 400);
  // the worshipper's view: low, close, looking up. Dragging turns you a little; let go and it brings you back.
  const TARGET = new THREE.Vector3(0, 1.4, 0), OFFSET = new THREE.Vector3(0, -7.2, 16.8);
  let yaw = 0, pitch = 0, dragging = false, lastX = 0, lastY = 0, moved = 0;
  const onDown = (e) => { dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY; try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* no capture */ } };
  const onMove = (e) => { if (!dragging) return;
    moved += Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY);
    yaw = Math.max(-0.75, Math.min(0.75, yaw - (e.clientX - lastX) * 0.0035)); pitch = Math.max(-0.12, Math.min(0.3, pitch + (e.clientY - lastY) * 0.002));
    lastX = e.clientX; lastY = e.clientY; };
  const onUp = () => { dragging = false; };
  canvas.addEventListener("pointerdown", onDown); canvas.addEventListener("pointermove", onMove); canvas.addEventListener("pointerup", onUp);
  function placeCamera(time, px, py) {
    if (!dragging) { yaw *= 0.985; pitch *= 0.985; }
    const sway = CALM ? 0 : 1;
    const o = OFFSET.clone().applyAxisAngle(new THREE.Vector3(1, 0, 0), pitch + (py * 0.025 + Math.sin(time * 0.07) * 0.008) * sway)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw + (px * 0.05 + Math.sin(time * 0.05) * 0.01) * sway);
    camera.position.copy(TARGET).add(o); camera.lookAt(TARGET);
  }
  placeCamera(0, 0, 0);
  scene.add(new THREE.HemisphereLight(0x6f8790, 0x1a0606, 0.35));
  const kl = new THREE.DirectionalLight(0xbcd2cc, 0.9); kl.position.set(-4, 5, 6); scene.add(kl);

  const U = { uTime: { value: 0 }, uKey: { value: new THREE.Vector3(-0.45, 0.55, 0.7).normalize() },
              uRim: { value: new THREE.Vector3(0.1, 0.35, -1).normalize() }, uUnder: { value: new THREE.Vector3(0, -9, 2) },
              uSingP: { value: new THREE.Vector3() }, uSing: { value: 0 } };
  const mat = (vs, fs, extra = {}) => keep(new THREE.ShaderMaterial({ uniforms: { ...U, uUnderK: { value: extra.underK === undefined ? 1 : extra.underK }, ...(extra.uniforms || {}) }, vertexShader: vs, fragmentShader: COMMON + fs,
    side: extra.side || THREE.FrontSide, transparent: !!extra.transparent, depthWrite: extra.depthWrite !== false, blending: extra.blending || THREE.NormalBlending }));
  const geo = (g) => keep(g);

  // ================================================================ data
  const godTx = new Set(S.offerings.filter((o) => o.conductor).map((o) => o.tx));
  const offers = [], gods = [];
  S.timeline.forEach((p, n) => {
    const it = { tx: p.tx, start: p.start, end: p.start + p.samples, silent: p.silent, g: genes(p.contrib_id >>> 0, n, 12),
      bright: clamp01((p.zero_crossings - 1500) / 1700), secs: clamp01((p.samples / 8000 - 2) / 6), pan: (p.pan - 8) / 8, layer: p.pitch_layer };
    (godTx.has(p.tx) ? gods : offers).push(it);
  });
  const forged = S.skipped.filter((s) => s.reason === "forged-conductor").map((s, i) => genes(parseInt(s.tx.slice(0, 8), 16) >>> 0, i, 6));
  const wakeOf = (it, t) => (t < 0 ? 0 : clamp01((t - it.start) / 1200) * clamp01((it.end - t) / 2400));

  // ================================================================ the sky: a nebula that is not ours
  scene.add(new THREE.Mesh(geo(new THREE.SphereGeometry(200, 24, 12)), mat(
    `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    `varying vec3 vD;
    void main(){
      vec3 d = normalize(vD);
      float n = fbm3(d * 2.6 + vec3(0., uTime * .002, 0.)), n2 = fbm3(d * 7. + n * 2.);
      vec3 c = mix(vec3(.004, .007, .01), vec3(.02, .05, .052), pow(n, 2.5)) + vec3(.05, .012, .06) * pow(n2, 4.) * 1.2;
      c += vec3(.08, .01, .005) * smoothstep(.1, -.6, d.y) * n;
      c += vec3(.025, .04, .038) * exp(-abs(d.y + .02) * 14.) + vec3(.05, .008, .004) * exp(-abs(d.y + .02) * 40.);
      vec3 cell = floor(d * 420.); float s = hash3(cell);
      c += vec3(.7, .82, .95) * step(.9975, s) * (.4 + .6 * hash3(cell + 7.)) * (.7 + .3 * sin(uTime * (1. + s * 4.) + s * 50.));
      float arc = exp(-pow((acos(dot(d, normalize(vec3(.3, .55, -1.)))) - .9) / .012, 2.)) * smoothstep(.35, .6, fbm3(d * 9.));
      c += vec3(.25, .35, .32) * arc * .12;
      gl_FragColor = vec4(c, 1.);
    }`, { side: THREE.BackSide })));

  // ================================================================ the wheels
  const scriptTex = keep(PHONE ? scriptTexture(seed0, 512, 32, ANISO) : scriptTexture(seed0, 1024, 64, ANISO));   // halos and wing pages, mipmapped
  const ringMat = mat(
    `varying vec3 vP, vN; varying vec2 vUv;
    void main(){ vec4 wp = modelMatrix * vec4(position, 1.); vP = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vUv = uv; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    `uniform sampler2D uScript; varying vec3 vP, vN; varying vec2 vUv;
    void main(){
      vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
      float v = vUv.y, seg = v * 12., band = floor(seg), lv = fract(seg);
      float face = step(10.5, band) + step(2.5, band) * step(band, 3.5) + step(6.5, band) * step(band, 7.5);
      float script = texture2D(uScript, vec2(vUv.x * 5., lv)).r * face;
      float chan = step(4.5, band) * step(band, 5.5);
      float lip = exp(-pow((v - .208) / .035, 2.)) + exp(-pow((v - .792) / .035, 2.));
      float pit = fbm3(vP * 7.);
      float h = script * .8 + pit * .35;
      N = bumpN(N, vP, h, .02);
      vec3 V = normalize(cameraPosition - vP), R = reflect(-V, N);
      float ao = mix(1., .3, chan) * (.75 + .25 * pit) * mix(1., .55, script);
      vec3 base = mix(vec3(.12, .045, .025), vec3(.42, .27, .11), lip);
      vec3 env = mix(vec3(.004, .003, .003), vec3(.22, .26, .24), pow(smoothstep(-.1, 1., R.y), 3.)) * mix(vec3(.6, .25, .16), vec3(1., .78, .45), lip);
      vec3 c = shade(base, N, vP, mix(.35, .12, lip), 0., ao) + env * ao * (.25 + .7 * lip);
      gl_FragColor = vec4(fogged(c, vP), 1.);
    }`, { uniforms: { uScript: { value: scriptTex } }, side: THREE.DoubleSide });
  function ringGeometry(R) {
    const T = 0.2, H = 0.76;
    const pts = [[R - T, -H / 2], [R - T * 0.4, -H / 2 - 0.035], [R + 0.05, -H / 2 - 0.02], [R + 0.105, -H / 2 + 0.035], [R + 0.075, -H / 2 + 0.105],
      [R - 0.02, -H / 2 + 0.155], [R - 0.02, H / 2 - 0.155], [R + 0.075, H / 2 - 0.105], [R + 0.105, H / 2 - 0.035], [R + 0.05, H / 2 + 0.02],
      [R - T * 0.4, H / 2 + 0.035], [R - T, H / 2], [R - T, -H / 2]].map(([x, y]) => new THREE.Vector2(x, y));
    return geo(new THREE.LatheGeometry(pts, PHONE ? 48 : 72));
  }
  const cap = (k) => 10 + 4 * k;
  let K = 0; for (let left = offers.length; left > 0; K++) left -= cap(K);
  K = Math.max(K, 3);
  const rings = [];
  for (let k = 0; k < K; k++) {
    const R = 2.3 + 0.92 * k;
    const pivot = new THREE.Group(), spinner = new THREE.Group(); pivot.add(spinner); scene.add(pivot);
    spinner.add(new THREE.Mesh(ringGeometry(R), ringMat));
    rings.push({ pivot, spinner, R, mir: k === 0 ? 0 : (k % 2 ? 1 : -1), spin: (k % 2 ? -1 : 1) * (0.06 + 0.04 * hb(22 + k)) });
  }

  // ================================================================ eyes: list every eye first, then ONE instanced mesh
  const IRIS = [[0.38, 0.55, 0.66], [0.5, 0.58, 0.42], [0.62, 0.44, 0.2], [0.33, 0.4, 0.38]];
  const eyeList = [];
  offers.forEach((it, n) => {
    let k = 0, j = n; while (j >= cap(k)) { j -= cap(k); k++; }
    const r = rings[k], th = (j / cap(k)) * TAU + k * 0.37, eR = 0.25 + 0.07 * it.secs;
    const nrm = new THREE.Vector3(Math.cos(th), 0, Math.sin(th));
    const socket = new THREE.Object3D();
    const face = nrm.clone().multiplyScalar(0.3).add(new THREE.Vector3(0, 1, 0)).normalize();
    socket.position.copy(nrm.clone().multiplyScalar(r.R - 0.05 + it.pan * 0.03)).add(new THREE.Vector3(0, 0.38 + eR * 0.3, 0));
    socket.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), face); r.spinner.add(socket);
    eyeList.push({ kind: "ring", socket, r: eR, iris: IRIS[Math.floor(it.g[1] * 4)], stripes: 14 + 40 * it.bright, slit: it.layer >= 2 ? 1 : 0, seed: it.g[2] * 20, blind: 0, it, lid: true });
  });
  const great = { kind: "great", big: true, r: 1.85, iris: [0.36, 0.55, 0.7], stripes: 70, slit: 0, seed: 3.3, blind: 0, lid: true };
  eyeList.push(great);
  forged.forEach((g) => eyeList.push({ kind: "blind", g, r: 0.09 + 0.04 * g[2], iris: [0.6, 0.1, 0.1], stripes: 1, slit: 0, seed: g[3] * 10, blind: 1, lid: false }));

  // ================================================================ the Dweller: one living mass, one arm per block
  let shards;
  {
    const waves = Array.from({ length: 8 }, (_, i) => { const g = genes(seed0 ^ 0x5eed, i, 4);
      const k = new THREE.Vector3(g[0] - 0.5, g[1] - 0.5, g[2] - 0.5).normalize().multiplyScalar(0.6 + i * 0.5); return { k, ph: g[3] * TAU, a: 0.5 / (1 + i * 0.6) }; });
    const field = (p) => waves.reduce((s, w) => s + Math.sin(p.dot(w.k) + w.ph) * w.a, 0);
    const C0 = new THREE.Vector3(0, -14.8, -6), RM = 9;
    const surf = (dir) => { const p = dir.clone().multiplyScalar(RM); return RM + field(p.clone().multiplyScalar(0.35)) * 1.5 + field(p.clone().multiplyScalar(1.3)) * 0.32; };
    const zeros = (n) => new THREE.BufferAttribute(new Float32Array(n), 1);
    const mg = geo(mergeVertices(new THREE.IcosahedronGeometry(RM, PHONE ? 7 : 10))), pa = mg.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i); const d = v.clone().normalize(); v.copy(d.multiplyScalar(surf(d))); pa.setXYZ(i, v.x, v.y, v.z); }
    mg.computeVertexNormals(); for (const a of ["aRad", "aPhase", "aLen"]) mg.setAttribute(a, zeros(pa.count));
    const mass = new THREE.Mesh(mg, mat(FLESH_VS(false), FLESH_FS(false))); mass.position.copy(C0); scene.add(mass);
    { // blisters
      const N = PHONE ? 30 : 60, bm = new THREE.InstancedMesh(geo(new THREE.SphereGeometry(1, 6, 4)), mat(
        `varying vec3 vP, vN; void main(){ mat4 m = modelMatrix * instanceMatrix; vec4 wp = m * vec4(position, 1.); vP = wp.xyz; vN = normalize(mat3(m) * normal); gl_Position = projectionMatrix * viewMatrix * wp; }`,
        `varying vec3 vP, vN; void main(){ vec3 N = normalize(vN); float n = noise3(vP * 9.);
          vec3 c = shade(mix(vec3(.32, .26, .14), vec3(.5, .42, .24), n), N, vP, .1, .8, 1.) + vec3(.1, .07, .02) * pow(1. - abs(dot(N, normalize(cameraPosition - vP))), 2.);
          gl_FragColor = vec4(fogged(c, vP), 1.); }`), N);
      const mtx = new THREE.Matrix4(), qq = new THREE.Quaternion(), sc = new THREE.Vector3();
      for (let i = 0; i < N; i++) { const g = genes(seed0, 3000 + i, 4); const el = 0.15 + 1.2 * g[1], a = g[0] * TAU;
        const d = new THREE.Vector3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)).normalize();
        const r = 0.05 + 0.26 * g[2] * g[2]; bm.setMatrixAt(i, mtx.compose(C0.clone().addScaledVector(d, surf(d) + r * 0.15), qq, sc.set(r, r * (0.6 + 0.4 * g[3]), r))); }
      scene.add(bm);
    }
    // the arms: thickness and reach from how many offerings the block carried, curl from the wait before it
    const blocks = new Map(); for (const o of S.offerings) blocks.set(o.height, (blocks.get(o.height) || 0) + 1);
    const bl = [...blocks.entries()].sort((a, b) => a[0] - b[0]);
    // budget: ≤ 120k triangles desktop, ≤ 60k phone (spec §3); past 30 blocks the arms get coarser so the total holds
    const nb = Math.max(1, bl.length), TS = Math.max(PHONE ? 16 : 20, Math.round((PHONE ? 28 : 36) * Math.min(1, 30 / nb))), RS = PHONE ? 5 : 6, arms = [];
    const ranked = bl.map((_, i) => i).sort((a, b) => bl[b][1] - bl[a][1] || a - b), frontIdx = ranked.slice(0, 2);
    const rest = bl.map((_, i) => i).filter((i) => !frontIdx.includes(i)), place = {};
    frontIdx.forEach((i, k) => (place[i] = { sd: k ? -1 : 1, f: 0.1, front: true }));
    rest.forEach((i, k) => (place[i] = { sd: k % 2 ? -1 : 1, f: (Math.floor(k / 2) + 0.5) / Math.ceil(rest.length / 2), front: false }));
    bl.forEach(([height, count], i) => {
      const g = genes(height >>> 0, i, 10);
      const prev = i ? bl[i - 1][0] : height, wait = Math.min(1, Math.log10(1 + height - prev) / 4);
      const { sd, f, front } = place[i];
      const dir = new THREE.Vector3(sd * (0.3 + 0.45 * f), 0.8, -0.45 - 0.1 * g[0]).normalize();
      const root = C0.clone().addScaledVector(dir, surf(dir) * 0.96);
      const reach = 0.5 + 0.5 * Math.min(1, (count - 1) / 4);
      const bR = front ? -0.62 : -1.05 + 2.15 * f + (g[2] - 0.5) * 0.08, b = sd > 0 ? bR : Math.PI - bR;
      const rr = (front ? 9.2 : 6.8 + 1.4 * f) + 1.4 * reach + 0.8 * g[3];
      const side = new THREE.Vector3(Math.cos(b), Math.sin(b) * 0.85, 0);
      const zz = front ? 2.2 + 0.8 * g[4] : -3.8 + 1.1 * g[4];
      const p1 = root.clone().addScaledVector(dir, 3.8).add(new THREE.Vector3(Math.cos(b) * 2.6, 3.4, front ? 2.5 : -3.2));
      const p2 = side.clone().multiplyScalar(rr).add(new THREE.Vector3(0, -0.4, zz));
      const sgn = -sd, L = 1.3 + 2.4 * wait;
      const tang = new THREE.Vector3(-Math.sin(b), Math.cos(b) * 0.85, 0.3).normalize().multiplyScalar(sgn);
      const pts = [root, p1, p2];
      for (let s = 1; s <= 3; s++) { const ang = s * (0.45 + 0.25 * wait), rad = L * Math.pow(0.8, s);
        pts.push(p2.clone().addScaledVector(tang, L * 0.9 + Math.sin(ang) * rad).addScaledVector(side, -(1 - Math.cos(ang)) * rad * 1.1)); }
      const curve = new THREE.CatmullRomCurve3(pts);
      const tg = new THREE.TubeGeometry(curve, TS, 1, RS, false);
      const r0 = 0.3 + 0.2 * count + 0.12 * g[6] + (front ? 0.25 : 0), gp = tg.attributes.position, c = new THREE.Vector3();
      const aRad = new Float32Array(gp.count), aPh = new Float32Array(gp.count).fill(g[5] * TAU), aLen = new Float32Array(gp.count).fill(curve.getLength() / (r0 * 2.4));
      for (let s2 = 0; s2 <= TS; s2++) { const t = s2 / TS; curve.getPointAt(t, c);
        const rad = r0 * Math.pow(1 - t, 0.75) * (1 + 0.12 * Math.sin(t * 15 + g[7] * 6)) * (t < 0.08 ? 1 + (0.08 - t) * 6 : 1) + 0.015;
        for (let kk = 0; kk <= RS; kk++) { const idx = s2 * (RS + 1) + kk; v.fromBufferAttribute(gp, idx).sub(c).multiplyScalar(rad).add(c); gp.setXYZ(idx, v.x, v.y, v.z); aRad[idx] = rad; } }
      tg.computeVertexNormals();
      tg.setAttribute("aRad", new THREE.BufferAttribute(aRad, 1)); tg.setAttribute("aPhase", new THREE.BufferAttribute(aPh, 1)); tg.setAttribute("aLen", new THREE.BufferAttribute(aLen, 1));
      arms.push(tg);
      if (count >= 2) {   // a busy block opens an eye at the root of its arm
        const d2 = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.24), er = 0.55 + 0.16 * count;
        const pos = C0.clone().addScaledVector(d2, surf(d2) + er * 0.2);
        eyeList.push({ kind: "dweller", pos, dir: d2, r: er, iris: [0.62, 0.46, 0.16], stripes: 30, slit: g[9] < 0.5 ? 1 : 0, seed: g[6] * 30, blind: 0, lid: true });
      }
    });
    if (arms.length) { scene.add(new THREE.Mesh(geo(mergeGeometries(arms)), mat(FLESH_VS(true), FLESH_FS(true)))); for (const a of arms) a.dispose(); }
    // debris
    shards = new THREE.InstancedMesh(geo(new THREE.OctahedronGeometry(1, 0)), keep(new THREE.MeshLambertMaterial({ color: 0x1c1a20, flatShading: true })), 40);
    const mtx = new THREE.Matrix4(), qq = new THREE.Quaternion(), sc = new THREE.Vector3();
    for (let i = 0; i < 40; i++) { const g = genes(seed0, 2000 + i, 7);
      qq.setFromEuler(new THREE.Euler(g[3] * TAU, g[4] * TAU, g[5] * TAU)); sc.set(0.06 + g[6] * 0.22, 0.1 + g[6] * 0.42, 0.06 + g[6] * 0.18);
      shards.setMatrixAt(i, mtx.compose(new THREE.Vector3((g[0] - 0.5) * 34, (g[1] - 0.45) * 20, (g[2] - 0.6) * 26), qq, sc)); }
    scene.add(shards);
  }

  // ================================================================ six wings of written pages: the god's own voice
  const PAIRS = Math.min(3, Math.max(1, Math.ceil(gods.length / 2))), FP = 10 + Math.floor(gods.length / 3), FC = 8, FS = 6;   // fewer, broader pages (26 Oct)
  const featherGeo = geo(new THREE.PlaneGeometry(1, 1, PHONE ? 4 : 6, 1)); featherGeo.translate(0.5, 0, 0);
  { const pa = featherGeo.attributes.position; for (let i = 0; i < pa.count; i++) { const x = pa.getX(i); pa.setZ(i, x * x * 0.18); } featherGeo.computeVertexNormals(); }
  const NF = PAIRS * 2 * (FP + FC + FS), iSeed = new Float32Array(NF);
  { let k = 0; for (let p = 0; p < PAIRS; p++) for (let s2 = 0; s2 < 2; s2++) for (let layer = 0; layer < 3; layer++) for (let f = 0; f < [FP, FC, FS][layer]; f++, k++)
    iSeed[k] = layer + 0.98 * genes(seed0, 5000 + k, 1)[0]; }
  featherGeo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(iSeed, 1));
  const uBackP = { value: new THREE.Vector3() };
  const feathers = new THREE.InstancedMesh(featherGeo, mat(
    `attribute float aSeed; varying vec2 vUv; varying vec3 vP, vN; varying float vSeed;
    void main(){ vUv = uv; vSeed = aSeed; mat4 m = modelMatrix * instanceMatrix; vec4 wp = m * vec4(position, 1.); vP = wp.xyz; vN = normalize(mat3(m) * normal);
      gl_Position = projectionMatrix * viewMatrix * wp; }`,
    `uniform sampler2D uScript; uniform vec3 uBackP; varying vec2 vUv; varying vec3 vP, vN; varying float vSeed;
    void main(){
      float x = vUv.x, y = vUv.y - .5;
      float half_ = .5 * (1. - pow(x, 3.) * .85) * smoothstep(0., .05, x);
      float fray = (fbm3(vec3(x * 26., y * 3., vSeed * 9.)) - .5) * .5;
      if (abs(y) > half_ * (1. + fray) ) discard;
      float rachis = smoothstep(.03, .0, abs(y)) * (1. - x * .6);
      float barbs = pow(.5 + .5 * sin(x * 36. - abs(y) * 24. + vSeed * 20.), 3.);
      float layer = floor(vSeed), sd = fract(vSeed);
      float script = texture2D(uScript, vec2(x * 1.6 + sd * 7., y * 1.8 + .5)).r * smoothstep(.1, .3, x);
      vec3 c = mix(vec3(.36, .35, .32), vec3(.6, .58, .52), fbm3(vec3(x * 3., y * 4., 2.)));
      c *= .95 + .05 * barbs;
      c = mix(c, vec3(.12, .1, .09), script * .55);
      c = mix(c, vec3(.2, .18, .16), rachis * .5);
      if (layer < .5) c *= 1. - .7 * smoothstep(.86, 1., x + fray * .15);
      c *= .8 + .2 * smoothstep(0., .2, x);
      vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
      vec3 col = shade(c, N, vP, .75, 1., 1.) * vec3(.9, 1., 1.02);
      float through = pow(max(dot(normalize(vP - cameraPosition), normalize(uBackP - vP)), 0.), 4.);
      col += vec3(.5, .78, .72) * c * through * 1.8;
      gl_FragColor = vec4(fogged(col, vP), 1.);
    }`, { uniforms: { uScript: { value: scriptTex }, uBackP }, side: THREE.DoubleSide, underK: 0.08 }), NF);
  feathers.instanceMatrix.setUsage(THREE.DynamicDrawUsage); feathers.frustumCulled = false; scene.add(feathers);
  const WING = [{ th: 1.0, len: 8.4, y: 1.0 }, { th: 0.22, len: 9.6, y: 0.1 }, { th: -0.6, len: 7.6, y: -0.8 }].slice(0, PAIRS);
  const fM = new THREE.Matrix4(), fD = new THREE.Vector3(), fW = new THREE.Vector3(), fN = new THREE.Vector3(), fP = new THREE.Vector3();
  // The wings breathe: each pair beats slowly (a few degrees of lift and sweep, period 9 / 11.5 / 14 s) a little out
  // of phase with the others; the phase comes from the pair index and the render hash, never from randomness.
  // Reduced motion: a quarter of the amplitude (and time itself runs slower there). Only the instance matrices move.
  const BEAT = WING.map((_, p) => ({ w: TAU / (9 + 2.5 * p), ph: p * 2.1 + hb(26 + p) * TAU }));
  const BEAT_A = CALM ? 0.25 : 1;
  function placeWings(time, gw) {
    let k = 0;
    WING.forEach((wd, p) => {
      const beat = Math.sin(time * BEAT[p].w + BEAT[p].ph) * BEAT_A;
      const lag = Math.sin(time * BEAT[p].w + BEAT[p].ph - 0.9) * BEAT_A;   // the tips follow the root a little late
      for (const sd of [-1, 1]) {
        const spr = 0.82 + 0.1 * Math.sin(time * 0.33 + p * 1.7) + 0.3 * gw + 0.06 * lag;
        const th = wd.th * (0.7 + 0.3 * spr) + 0.075 * beat;                 // ~4.3 degrees of lift
        const A = new THREE.Vector3(sd * Math.cos(th), Math.sin(th), -0.3 + 0.1 * beat).normalize();   // and a little sweep
        const Nw = new THREE.Vector3(-sd * 0.3, 0.1, 1).normalize();
        const B = new THREE.Vector3().crossVectors(A, Nw).normalize(); if (B.y > 0.05 || (Math.abs(B.y) < 0.05 && B.x * sd < 0)) B.negate();
        const R0 = new THREE.Vector3(sd * 1.1, wd.y, -2.2);
        const at = (u) => R0.clone().addScaledVector(A, wd.len * u).add(new THREE.Vector3(0, 1, -0.7).multiplyScalar(Math.sin(Math.PI * u) * 1.1));
        for (let layer = 0; layer < 3; layer++) {
          const F = [FP, FC, FS][layer];
          for (let f = 0; f < F; f++) {
            const u = f / (F - 1);
            fP.copy(at(layer === 2 ? 0.05 + 0.8 * u : 0.1 + 0.9 * u)).addScaledVector(Nw, layer * 0.09 + f * 0.006);
            const phi = (layer === 0 ? 1.35 - 1.1 * u : 1.45 - 0.6 * u) * spr + Math.sin(time * 9 + f * 1.7 + p) * 0.025 * gw;
            fD.copy(A).multiplyScalar(Math.cos(phi)).addScaledVector(B, Math.sin(phi)).normalize();
            fW.crossVectors(Nw, fD).normalize(); fN.crossVectors(fD, fW).normalize();
            const len = [2.2 + 4.6 * Math.pow(u, 1.2), 1.8 + 1.6 * u, 1.0 + 0.8 * u][layer] * (1 - p * 0.1), wid = [0.95 + 0.4 * u, 1.05, 0.9][layer];
            fM.makeBasis(fD.clone().multiplyScalar(len), fW.clone().multiplyScalar(wid), fN).setPosition(fP);
            feathers.setMatrixAt(k++, fM);
          }
        }
      }
    });
    feathers.instanceMatrix.needsUpdate = true;
  }

  // ================================================================ the world below
  {
    const ground = new THREE.Mesh(geo(new THREE.PlaneGeometry(600, 600, 1, 1)), mat(
      `varying vec3 vP; void main(){ vec4 wp = modelMatrix * vec4(position, 1.); vP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      `varying vec3 vP; void main(){
        float n = fbm3(vP * .15), l = pow(.5 + .5 * sin(vP.z * 6. + n * 8.), 8.);
        float near = exp(-length(vP.xz - vec2(0., -6.)) * .08);
        vec3 c = vec3(.004, .005, .006) + vec3(.02, .025, .025) * l * exp(-length(vP - cameraPosition) * .05) + vec3(.09, .012, .006) * near;
        gl_FragColor = vec4(fogged(c, vP), 1.); }`));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -9; scene.add(ground);
    const mg = geo(new THREE.CylinderGeometry(110, 110, 30, PHONE ? 96 : 128, 1, true)), pa = mg.attributes.position;
    for (let i = 0; i < pa.count; i++) if (pa.getY(i) > 0) { const a = Math.atan2(pa.getZ(i), pa.getX(i));
      const hgt = Math.abs(Math.sin(a * 7 + 1.3)) * 4 + Math.abs(Math.sin(a * 23 + 0.4)) * 2.2 + Math.abs(Math.sin(a * 61)) * 0.9; pa.setY(i, -15 + hgt + 4); }
    const mountains = new THREE.Mesh(mg, mat(
      `varying vec3 vP; void main(){ vec4 wp = modelMatrix * vec4(position, 1.); vP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      `varying vec3 vP; void main(){ gl_FragColor = vec4(vec3(.002, .0025, .003) + vec3(.02, .03, .03) * smoothstep(-12., -6., vP.y) * .3, 1.); }`, { side: THREE.BackSide }));
    mountains.position.y = -9 + 15; scene.add(mountains);
  }

  // ---------------------------------------------------------------- one instanced mesh for the small eyes, one for the great eye
  const NE = eyeList.length;
  const eyeMat = mat(
    `attribute vec3 aIris; attribute vec4 aEye; attribute float aWake;
    varying vec3 vObj, vN, vP, vIris, vVo; varying vec4 vEye; varying float vWake;
    void main(){ vObj = position; vIris = aIris; vEye = aEye; vWake = aWake;
      mat4 m = modelMatrix * instanceMatrix; vec4 wp = m * vec4(position, 1.); vP = wp.xyz; vN = normalize(mat3(m) * normal);
      vVo = normalize((inverse(m) * vec4(cameraPosition, 1.)).xyz - position);
      gl_Position = projectionMatrix * viewMatrix * wp; }`,
    `varying vec3 vObj, vN, vP, vIris, vVo; varying vec4 vEye; varying float vWake;
    void main(){
      vec3 o = normalize(vObj), N = normalize(vN); float seed = vEye.z;
      vec2 ip = o.xy - vVo.xy / max(vVo.z, .25) * max(o.z - .82, 0.) * .9;
      float ir = .44, r = length(ip), pr = mix(.15, .3, vWake), front = smoothstep(.55, .8, o.z);
      float ang = acos(clamp(o.z, -1., 1.)), ph = atan(o.y, o.x);
      float vein = pow(1. - abs(fbm3(vec3(ph * 2.2, ang * 4., seed)) * 2. - 1.), 10.) * smoothstep(.5, 1.7, ang);
      vec3 col = mix(vec3(.8, .78, .7) * (1. - .45 * smoothstep(.9, 2.6, ang)), vec3(.5, .04, .03), vein * .9);
      col *= 1. - .25 * smoothstep(.3, .0, abs(ang - 1.57));
      vec3 emit = vec3(0.);
      if (vEye.w < .5){
        float a = atan(ip.y, ip.x);
        float st = .5 + .5 * cos(a * vEye.x + fbm3(vec3(ip * 9., seed)) * 5.);
        float crypt = smoothstep(.6, .75, fbm3(vec3(ip * 14., seed + 3.)));
        vec3 irc = mix(vIris * .18, vIris * 1.2, st) * (1. - crypt * .5);
        irc *= mix(1., .25, smoothstep(ir * .72, ir, r));
        irc = mix(irc, vIris * 1.6, smoothstep(pr * 1.6, pr * 1.05, r) * .5);
        float im = smoothstep(ir + .02, ir - .02, r) * front;
        col = mix(col, irc, im);
        emit = (vIris * 1.1 * st + vec3(.5, 1., .72) * .35) * vWake * im;
        float pm = vEye.y > .5 ? smoothstep(1., .8, length(ip / vec2(pr * .28, pr * 1.15))) : smoothstep(pr + .015, pr - .015, r);
        pm *= front; col = mix(col, vec3(.003), pm); emit *= 1. - pm;
      } else col = mix(col, vec3(.5, .06, .04), .7);
      vec3 c = shade(col, N, vP, .1, .25, 1.) + emit;
      vec3 V = normalize(cameraPosition - vP);
      c += vec3(.9, 1., .95) * pow(max(dot(reflect(-V, N), normalize(vec3(-.3, .8, .4))), 0.), 400.) * 1.1;
      gl_FragColor = vec4(fogged(c, vP), 1.);
    }`);
  function eyeMesh(list, ws, hs) {   // per-instance iris, pattern and wake; `wake` is the only attribute that changes per frame
    const n = list.length, g = geo(new THREE.SphereGeometry(1, ws, hs));
    const iIris = new Float32Array(n * 3), iEye = new Float32Array(n * 4), wake = new Float32Array(n);
    list.forEach((e, i) => { iIris.set(e.iris, i * 3); iEye.set([e.stripes, e.slit, e.seed, e.blind], i * 4); e.eyeMesh = null; e.idx = i; });
    g.setAttribute("aIris", new THREE.InstancedBufferAttribute(iIris, 3));
    g.setAttribute("aEye", new THREE.InstancedBufferAttribute(iEye, 4));
    const wakeAttr = new THREE.InstancedBufferAttribute(wake, 1); wakeAttr.setUsage(THREE.DynamicDrawUsage); g.setAttribute("aWake", wakeAttr);
    const m = new THREE.InstancedMesh(g, eyeMat, n); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; scene.add(m);
    for (const e of list) e.eyeMesh = m;
    return { mesh: m, wake, wakeAttr };
  }
  const smallEyes = eyeMesh(eyeList.filter((e) => !e.big), PHONE ? 10 : 12, PHONE ? 6 : 8);   // small on screen: few segments
  const bigEyes = eyeMesh(eyeList.filter((e) => e.big), PHONE ? 24 : 32, PHONE ? 16 : 20);
  const eyeGroups = [smallEyes, bigEyes];

  // a cold light that is always behind the god, wherever you stand: the cage and the arms cut it into rays
  const backC = document.createElement("canvas"); backC.width = backC.height = 256;
  { const x = backC.getContext("2d"), g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.12, "rgba(200,255,230,0.55)"); g.addColorStop(0.4, "rgba(90,160,140,0.12)"); g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g; x.fillRect(0, 0, 256, 256); }
  const backTex = keep(new THREE.CanvasTexture(backC));
  const backLight = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: backTex, color: new THREE.Color(2.2, 3.0, 2.7), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false })));
  backLight.scale.setScalar(16); scene.add(backLight);
  // the mark of the eye that sounds (or was found): a small cold halo around that one eye, drawn over the scene
  const markC = document.createElement("canvas"); markC.width = markC.height = 128;
  { const x = markC.getContext("2d"), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(0.42, "rgba(255,255,255,0)"); g.addColorStop(0.5, "rgba(200,255,220,0.9)");
    g.addColorStop(0.62, "rgba(140,240,190,0.35)"); g.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = g; x.fillRect(0, 0, 128, 128); }
  const markTex = keep(new THREE.CanvasTexture(markC));
  const mark = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: markTex, color: new THREE.Color(0.9, 1.4, 1.1), blending: THREE.AdditiveBlending,
    depthWrite: false, depthTest: false, transparent: true, fog: false })));
  mark.visible = false; mark.renderOrder = 10; scene.add(mark);

  // ---------------------------------------------------------------- lids: a shell of flesh with an almond cut, one instanced mesh
  const lidMat = mat(
    `attribute float aOpen, aSewn; varying vec3 vObj, vN, vP; varying float vOpen, vSewn;
    void main(){ vObj = position; vOpen = aOpen; vSewn = aSewn; mat4 m = modelMatrix * instanceMatrix; vec4 wp = m * vec4(position, 1.);
      vP = wp.xyz; vN = normalize(mat3(m) * normal); gl_Position = projectionMatrix * viewMatrix * wp; }`,
    `varying vec3 vObj, vN, vP; varying float vOpen, vSewn;
    void main(){
      vec3 o = normalize(vObj);
      float edge = vOpen * .66 * (1. - pow(o.x / .97, 2.));
      float inside = step(.15, o.z) * step(abs(o.y), edge);
      if (inside > .5 && vSewn < .5) discard;
      float dist = abs(o.y) - edge;
      float fold = .5 + .5 * sin(dist * 60.) ; fold *= smoothstep(.3, .02, dist) * step(0., dist);
      float n = fbm3(vObj * 8.), vein = pow(1. - abs(fbm3(vObj * 5. + 2.) * 2. - 1.), 14.);
      vec3 c = mix(vec3(.08, .035, .035), vec3(.24, .12, .1), n) * (1. - .45 * fold);
      c = mix(c, vec3(.32, .03, .04), vein * .5);
      vec3 N = bumpN(normalize(vN), vP, fold * .6 + n * .4, .012);
      float rim = smoothstep(.05, .0, dist) * step(0., dist);
      vec3 col = shade(c, N, vP, mix(.75, .15, rim), 1., 1. - .3 * fold) + vec3(.35, .1, .08) * rim * .4;
      if (vSewn > .5){ float st = step(abs(o.y), .06) * step(.5, fract(o.x * 6.)) + step(abs(fract(o.x * 6.) - .25), .04) * step(abs(o.y), .18);
        col = mix(col, vec3(.55, .5, .42), st * step(.1, o.z)); }
      gl_FragColor = vec4(fogged(col, vP), 1.);
    }`);
  function lidMesh(list, ws, hs) {
    const n = list.length, g = geo(new THREE.SphereGeometry(1, ws, hs));
    const open = new Float32Array(n), sewn = new Float32Array(n);
    list.forEach((e, i) => { sewn[i] = e.it && e.it.silent ? 1 : 0; e.lidIndex = i; });
    const openAttr = new THREE.InstancedBufferAttribute(open, 1); openAttr.setUsage(THREE.DynamicDrawUsage); g.setAttribute("aOpen", openAttr);
    g.setAttribute("aSewn", new THREE.InstancedBufferAttribute(sewn, 1));
    const m = new THREE.InstancedMesh(g, lidMat, n); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; scene.add(m);
    for (const e of list) e.lidMesh = m;
    return { mesh: m, open, openAttr };
  }
  const smallLids = lidMesh(eyeList.filter((e) => e.lid && !e.big), PHONE ? 10 : 12, PHONE ? 6 : 8);
  const bigLids = lidMesh(eyeList.filter((e) => e.lid && e.big), PHONE ? 22 : 28, PHONE ? 14 : 18);
  const lidGroups = [smallLids, bigLids];

  // ================================================================ particles: dust that hangs, embers that rise
  function motes(N, seed, color, size, rise) {
    const pos = new Float32Array(N * 3), ph = new Float32Array(N);
    for (let i = 0; i < N; i++) { const g = genes(seed, i, 4); const r = 3 + 19 * g[0], a = g[1] * TAU; pos.set([Math.cos(a) * r, (g[2] - 0.5) * 22, Math.sin(a) * r - 2], i * 3); ph[i] = g[3]; }
    const pg = geo(new THREE.BufferGeometry()); pg.setAttribute("position", new THREE.BufferAttribute(pos, 3)); pg.setAttribute("aPh", new THREE.BufferAttribute(ph, 1));
    const m = keep(new THREE.ShaderMaterial({ uniforms: { uTime: U.uTime, uC: { value: new THREE.Color(...color) }, uS: { value: size }, uRise: { value: rise } },
      vertexShader: `attribute float aPh; uniform float uTime, uS, uRise; varying float vA;
        void main(){ vec3 p = position; p.y = mod(p.y + uTime * uRise * (.5 + aPh) + 11., 22.) - 11.; p.x += sin(uTime * .2 + aPh * 30.) * .3;
          vec4 mv = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = uS * (.5 + aPh) * 300. / -mv.z;
          vA = (.4 + .6 * sin(uTime * (1. + aPh * 2.) + aPh * 40.) * .5 + .3) * smoothstep(40., 8., -mv.z) * (uRise > 0. ? smoothstep(11., -2., p.y) : 1.); }`,
      fragmentShader: `uniform vec3 uC; varying float vA; void main(){ float d = length(gl_PointCoord - .5); if (d > .5) discard; gl_FragColor = vec4(uC * vA * smoothstep(.5, .0, d), 1.); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    scene.add(new THREE.Points(pg, m));
  }
  motes(PHONE ? 250 : 600, seed0, [0.5, 0.7, 0.65], 0.045, 0);
  motes(PHONE ? 60 : 140, seed0 ^ 0xe1, [1.6, 0.35, 0.1], 0.07, 0.35);
  { // the Watcher on a floating rock, for scale
    const rock = new THREE.Mesh(geo(new THREE.DodecahedronGeometry(1.3, 1)), keep(new THREE.MeshLambertMaterial({ color: 0x151419, flatShading: true })));
    rock.scale.set(0.5, 1.4, 0.5); rock.position.set(3.4, -8.6, 7.5); scene.add(rock);
    const body = geo(mergeGeometries([new THREE.CapsuleGeometry(0.03, 0.13, 4, 8), new THREE.SphereGeometry(0.03, 8, 6).translate(0, 0.12, 0)].map((g) => g.toNonIndexed())));
    const w = new THREE.Mesh(body, keep(new THREE.MeshLambertMaterial({ color: 0x060608 }))); w.position.set(3.4, -6.66, 7.5); w.scale.setScalar(1.3); scene.add(w);
  }

  // ================================================================ post: scene (HDR) -> god rays (half res) -> composite
  // the scene target is multisampled (WebGL2 MSAA x2) on every device at backbuffer resolution; the god rays are a
  // radial blur, so their target runs at half resolution (the blur hides it)
  const rtOpts = { type: THREE.HalfFloatType, depthBuffer: true, samples: 0 };   // no MSAA (26 Oct, lighter)
  const rtScene = keep(new THREE.WebGLRenderTarget(1, 1, rtOpts)), rtRays = keep(new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false }));
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), quadGeo = geo(new THREE.PlaneGeometry(2, 2));
  const QVS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`;
  const raysMat = keep(new THREE.ShaderMaterial({ uniforms: { tScene: { value: rtScene.texture }, uSun: { value: new THREE.Vector2(0.4, 0.5) }, uGod: { value: 0 } }, vertexShader: QVS,
    fragmentShader: `uniform sampler2D tScene; uniform vec2 uSun; uniform float uGod; varying vec2 vUv;
    void main(){ vec2 d = (vUv - uSun) / 16. * .92; float j = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715)))); vec2 p = vUv + d * j; vec3 acc = vec3(0.); float w = 1.;
      for (int i = 0; i < 16; i++){ p -= d; vec3 s = texture2D(tScene, p).rgb; float l = max(dot(s, vec3(.3, .59, .11)) - .28, 0.); acc += s * l * w; w *= .89; }
      gl_FragColor = vec4(acc * (.366 + uGod * .22) * vec3(.7, 1., .9), 1.); }`, depthTest: false, depthWrite: false }));
  const compMat = keep(new THREE.ShaderMaterial({ uniforms: { tScene: { value: rtScene.texture }, tRays: { value: rtRays.texture }, uRes: { value: new THREE.Vector2(1, 1) },
      uTime: U.uTime, uGod: { value: 0 }, uDpr: { value: 1 } }, vertexShader: QVS,
    fragmentShader: `uniform sampler2D tScene, tRays; uniform vec2 uRes; uniform float uTime, uGod, uDpr; varying vec2 vUv;
    float h(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(.06711056, .00583715)))); }
    vec3 aces(vec3 x){ return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.); }
    void main(){
      vec2 uv = vUv, c = uv - .5; float ca = .004 * dot(c, c) * 4. * (1. + uGod * 2.);
      vec3 col = vec3(texture2D(tScene, uv + c * ca).r, texture2D(tScene, uv).g, texture2D(tScene, uv - c * ca).b) + texture2D(tRays, uv).rgb;
      vec3 st = vec3(0.); for (int i = -3; i <= 3; i++){ float fi = float(i); st += texture2D(tRays, uv + vec2(fi * .036, 0.)).rgb * (1. - abs(fi) / 4.); }
      col += st * .14 * vec3(.55, .85, 1.);
      col = aces(col * 1.1);
      col = mix(vec3(dot(col, vec3(.3, .59, .11))), col, .88);
      col *= mix(.25, 1., smoothstep(1.15, .25, length(c * vec2(1.25, 1.))));
      // film grain at CSS-pixel scale (one grain per CSS pixel whatever the backbuffer), so it never reads as mosaic
      col += (h(floor(gl_FragCoord.xy / max(uDpr, 1.)) + vec2(floor(uTime * 24.) * 5.588, floor(uTime * 24.) * 3.1)) - .5) * .035;
      gl_FragColor = vec4(pow(max(col, 0.), vec3(1. / 2.2)), 1.);
    }`, depthTest: false, depthWrite: false }));
  const raysQuad = new THREE.Mesh(quadGeo, raysMat), compQuad = new THREE.Mesh(quadGeo, compMat);

  // ================================================================ size, adaptive resolution, pause when hidden
  let NARROW = false, VW = 1, VH = 1, offX = 0, wantOff = 0;
  function size() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight, narrow = w <= 900;
    renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
    rtScene.setSize(Math.round(w * dpr), Math.round(h * dpr)); rtRays.setSize(Math.round(w * dpr / 4), Math.round(h * dpr / 4));   // the rays are a blur: quarter resolution
    compMat.uniforms.uRes.value.set(w * dpr, h * dpr); compMat.uniforms.uDpr.value = dpr;
    camera.aspect = w / h; camera.fov = narrow ? 58 : 42;
    NARROW = narrow; VW = w; VH = h; if (narrow) camera.setViewOffset(w, h, 0, h * 0.06, w, h); else camera.setViewOffset(w, h, offX, 0, w, h);
    camera.updateProjectionMatrix();
  }
  size();
  let lastT = 0, running = !document.hidden, alive = true, fps = 0;
  const settle = (ms) => DPR.settle(performance.now(), ms);
  function adapt(now, dt) { const next = DPR.frame(now, dt); if (next !== null) { dpr = next; size(); } }
  settle(2500);
  // a new canvas size moves the hd floor (the short side changed): re-limit first, then size once
  const onResize = () => { const v = DPR.relimit(performance.now(), limitsNow()); if (v !== null) dpr = v; size(); settle(1000); };
  addEventListener("resize", onResize);
  // the loop runs only while the tab is visible and the god is on screen (app.js pauses it when the page has
  // scrolled past it); a paused god keeps its last frame
  let paused = false;
  const resume = () => { const was = running; running = !document.hidden && !paused; if (running && !was && alive) { lastT = 0; settle(1000); requestAnimationFrame(tick); } };
  const onVis = () => resume();
  document.addEventListener("visibilitychange", onVis);

  // ================================================================ gaze: rest, attention, the voice
  // Every eye has its own resting gaze (from its contrib_id) and drifts slowly around it. They watch you only
  // sometimes: when the pointer moves after being still, a few eyes (a subset chosen from the slot order and a
  // one-second time bucket) turn to it, one after another, and lose interest after 2-4 s; now and then a few glance
  // at you on their own (9 s buckets of scene time). The great eye follows the pointer while it moves and for a few
  // seconds after, otherwise it alternates between watching you and looking around (6.5 s buckets). While a voice
  // sounds, every other eye turns to the one that sings. Targets are chosen at 20 Hz; the eyes turn every frame.
  let px = 0, py = 0, playT = -1, eyeOpenV = 1, lastCalls = 0, lastTris = 0, focusTx = null;
  let pointerAt = -Infinity, attn = null, gazeAt = -Infinity;
  const onPointer = (e) => {
    px = (e.clientX / innerWidth) * 2 - 1; py = -(e.clientY / innerHeight) * 2 + 1;
    const t = performance.now();
    if (t - pointerAt > 1500) attn = { t0: t, bucket: Math.floor(t / 1000) };   // moved after being still
    pointerAt = t;
  };
  addEventListener("pointermove", onPointer);
  eyeList.forEach((e, i) => {
    const g = genes(e.it ? e.it.g[0] * 4294967296 >>> 0 : seed0 ^ (i * 7919), i, 6);
    e.rest = new THREE.Vector3((g[0] - 0.5) * 0.9, (g[1] - 0.5) * 0.7, 1).normalize();   // in the socket's own frame
    e.dw = 0.11 + 0.09 * g[2]; e.dph = g[3] * TAU;                                       // slow drift around it
    e.rate = 0.025 + 0.11 * ((i * 0.618) % 1);                                           // each turns at its own pace
  });
  const gazeWant = eyeList.map(() => new THREE.Vector3(0, 0, 1));
  function attends(i, now, time) {
    if (attn && now - attn.t0 < 6000) {
      const g = genes(seed0 ^ 0xa77e, i + attn.bucket * 977, 3);
      const from = attn.t0 + g[1] * 900, until = from + 2000 + g[2] * 2000;
      if (g[0] < 0.25 && now >= from && now < until) return true;
    }
    const b = Math.floor(time / 9), g = genes(seed0 ^ 0x9a2e, i + b * 131, 3), s = time - b * 9;
    return g[0] < 0.1 && s >= g[1] * 4 && s < g[1] * 4 + 2 + g[2] * 2;
  }
  const tv = new THREE.Vector3(), restW = new THREE.Vector3();
  function chooseGazes(now, time, sing, singer) {
    const drift = CALM ? 0.4 : 1, follow = now - pointerAt < 5000;
    eyeList.forEach((e, i) => {
      const P = eyePos[i], W = gazeWant[i];
      let target = null;
      if (e.kind === "blind") target = tv.copy(camP);
      else if (sing && i !== singer && e.kind !== "great") target = tv.copy(eyePos[singer]);
      else if (e.kind === "great") {
        const b = Math.floor(time / 6.5), r = genes(seed0 ^ 0x6a7e, b, 3);
        const sc = CALM ? [0.5, 0.5] : genes(seed0, Math.floor(time / 1.9), 2);       // saccades: it jumps
        if (follow || r[0] < 0.6) target = tv.copy(camP).addScaledVector(right, (follow ? px * 6 : 0) + (sc[0] - 0.5) * 1.6)
          .addScaledVector(up, (follow ? py * 4 : 0) + (sc[1] - 0.5) * 1.0);
        else target = tv.copy(camP).addScaledVector(right, (r[1] - 0.5) * 9).addScaledVector(up, (r[2] - 0.5) * 5 - 1.5);   // it looks away
      } else if (attends(i, now, time)) target = tv.copy(camP).addScaledVector(right, px * 3).addScaledVector(up, py * 2);
      if (target) W.copy(target).sub(P).normalize();
      else {                                                                    // at rest, drifting
        restW.set(e.rest.x + Math.sin(time * e.dw + e.dph) * 0.18 * drift, e.rest.y + Math.cos(time * e.dw * 0.8 + e.dph) * 0.12 * drift, e.rest.z).normalize();
        if (e.kind === "ring") { e.socket.getWorldQuaternion(tmpQ); W.copy(restW).applyQuaternion(tmpQ); }
        else if (e.kind === "dweller") W.copy(e.dir).addScaledVector(restW, 0.6).normalize();
        else W.copy(restW);
      }
      if (e.kind === "ring") {                                                  // as far as the socket lets it
        e.socket.getWorldQuaternion(tmpQ); nW.set(0, 0, 1).applyQuaternion(tmpQ);
        const d = W.dot(nW); if (d < 0.55) W.addScaledVector(nW, 0.55 - d).normalize();
      } else if (e.kind === "dweller") { const d = W.dot(e.dir); if (d < 0.3) W.addScaledVector(e.dir, 0.3 - d).normalize(); }
    });
  }
  const T0 = performance.now(), dummy = new THREE.Object3D(), camP = new THREE.Vector3(), nW = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
  const right = new THREE.Vector3(), up = new THREE.Vector3(), M = new THREE.Matrix4(), S4 = new THREE.Matrix4(), sunV = new THREE.Vector3();
  const eyePos = eyeList.map(() => new THREE.Vector3());
  const eyeLook = eyeList.map(() => null);
  function tick(now, once) {
    if ((!running && !once) || !alive) return;
    if (!once && lastT && now - lastT < 1000 / 60 - 1.5) { requestAnimationFrame(tick); return; }   // at most 60 fps
    if (lastT && now > lastT && !once) { const dt = now - lastT; adapt(now, dt); fps = fps ? fps * 0.9 + (1000 / dt) * 0.1 : 1000 / dt; }
    if (!once) lastT = now;
    const time = ((now - T0) / 1000) * (CALM ? 0.35 : 1) + 30;
    const t = playT;
    placeCamera(time, px, py); U.uTime.value = time;
    if (!NARROW && (Math.abs(wantOff - offX) > 0.5)) { offX += (wantOff - offX) * 0.05; camera.setViewOffset(VW, VH, offX, 0, VW, VH); camera.updateProjectionMatrix(); }
    for (const r of rings) {
      const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r.mir * (0.34 + 0.08 * Math.sin(time * 0.09)));
      const qz = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), r.mir * 0.12);
      const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 1.97 + Math.sin(time * 0.11) * 0.03);
      r.pivot.quaternion.copy(qy.multiply(qz).multiply(qx)); r.spinner.rotation.y = time * r.spin * (r.mir < 0 ? -1 : 1); }
    scene.updateMatrixWorld(); camP.copy(camera.position);
    right.setFromMatrixColumn(camera.matrixWorld, 0); up.setFromMatrixColumn(camera.matrixWorld, 1);
    let singer = -1, sw = 0, gw = 0;
    for (const g of gods) gw = Math.max(gw, wakeOf(g, t));
    eyeList.forEach((e, i) => {
      if (e.kind === "ring") {
        e.socket.getWorldPosition(eyePos[i]);
        const w = Math.max(wakeOf(e.it, t), focusTx && e.it.tx === focusTx ? 0.9 : 0);   // "find my offering": it burns
        e.w = w; if (w > sw) { sw = w; singer = i; }
      }
      else if (e.kind === "great") { eyePos[i].set(0, 0, 0); e.w = gw; }
      else if (e.kind === "dweller") { eyePos[i].copy(e.pos); e.w = 0; }
      else { const g = e.g, a = g[0] * TAU + time * (0.02 + 0.02 * g[1]), r = 6.5 + 2 * g[2]; eyePos[i].set(Math.cos(a) * r, (g[4] - 0.5) * 5, Math.sin(a) * r); e.w = 0; }
    });
    const sing = singer >= 0 && sw > 0.25;
    U.uSing.value = sing ? sw : 0; if (singer >= 0) U.uSingP.value.copy(eyePos[singer]);
    if (singer >= 0 && sw > 0.05) {                       // the halo sits on that one eye and breathes a little
      mark.visible = true; mark.position.copy(eyePos[singer]);
      mark.scale.setScalar(eyeList[singer].r * (1 + 0.8 * sw) * 3.2 * (1 + 0.05 * Math.sin(time * 3)));
      mark.material.opacity = Math.min(1, sw * 1.2);
    } else mark.visible = false;
    if (once || now - gazeAt >= 50) { gazeAt = now; chooseGazes(now, time, sing, singer); }   // targets at 20 Hz
    eyeList.forEach((e, i) => {
      const P = eyePos[i]; let scale = e.r;
      if (e.kind === "ring") scale = e.it.silent ? e.r * 0.9 : e.r * (1 + 0.8 * e.w);   // the sounding / found eye grows
      else if (e.kind === "blind" && ((time * (0.15 + 0.1 * e.g[5]) + e.g[3]) % 1) >= 0.55) scale = 0;
      const want = gazeWant[i];
      if (!eyeLook[i]) eyeLook[i] = want.clone();
      else eyeLook[i].lerp(want, e.kind === "great" ? 0.35 : e.rate).normalize();
      dummy.position.copy(P); dummy.scale.setScalar(scale); tv.copy(P).add(eyeLook[i]); dummy.lookAt(tv); dummy.updateMatrix();
      const eg = e.big ? bigEyes : smallEyes; eg.mesh.setMatrixAt(e.idx, dummy.matrix); eg.wake[e.idx] = e.w;
      if (e.lid) {
        const li = e.lidIndex, s = e.r * 1.08, lg = e.big ? bigLids : smallLids;
        if (e.kind === "ring") { M.copy(e.socket.matrixWorld); S4.makeScale(s, s, s); M.multiply(S4); }
        else { dummy.position.copy(P); dummy.scale.setScalar(e.kind === "great" ? e.r * 1.06 : s);
          dummy.lookAt(e.kind === "great" ? camP : P.clone().add(e.dir)); dummy.updateMatrix(); M.copy(dummy.matrix); }
        lg.mesh.setMatrixAt(li, M);
        const order = e.kind === "ring" ? i / Math.max(1, offers.length) : 0.5, wave = (time * 0.11) % 1;
        const blink = Math.abs(order - wave) < 0.02 || ((time * (0.05 + 0.04 * ((i * 0.618) % 1)) + i * 0.37) % 1) < 0.014 ? 0.04 : 1;
        lg.open[li] = e.it && e.it.silent ? 0 : (e.kind === "great" ? (0.78 + 0.2 * gw) * eyeOpenV : (0.72 * blink + 0.28 * e.w * 1.2));
      }
    });
    for (const g of eyeGroups) { g.mesh.instanceMatrix.needsUpdate = true; g.wakeAttr.needsUpdate = true; }
    for (const g of lidGroups) { g.mesh.instanceMatrix.needsUpdate = true; g.openAttr.needsUpdate = true; }
    shards.rotation.y = time * 0.01;
    placeWings(time, gw);
    backLight.position.copy(camP).sub(TARGET).normalize().multiplyScalar(-6).add(new THREE.Vector3(0, 0.3, 0)); uBackP.value.copy(backLight.position);
    backLight.material.color.setRGB(2.2 + gw * 2, 3.0 + gw * 3, 2.7 + gw * 2.5);
    sunV.set(0, 0, 0).project(camera);
    raysMat.uniforms.uSun.value.set(sunV.x * 0.5 + 0.5, sunV.y * 0.5 + 0.5); raysMat.uniforms.uGod.value = gw; compMat.uniforms.uGod.value = gw;
    renderer.setRenderTarget(rtScene); renderer.render(scene, camera);
    lastCalls = renderer.info.render.calls; lastTris = renderer.info.render.triangles;
    renderer.setRenderTarget(rtRays); renderer.render(raysQuad, quadCam);
    renderer.setRenderTarget(null); renderer.render(compQuad, quadCam);
    if (!once) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // ---------------------------------------------------------------- picking: which offering's eye is under the pointer
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects([smallEyes.mesh, bigEyes.mesh], false);   // sorted by distance
    const small = eyeList.filter((e) => !e.big);
    for (const h of hits) {
      if (h.object === bigEyes.mesh) return null;                                // the great eye hides what is behind it
      const e = small[h.instanceId]; if (e && e.kind === "ring") return e.it.tx;
    }
    return null;
  }

  return {
    setPlayT(v) { playT = typeof v === "number" ? v : -1; },
    setEyeOpen(v) { eyeOpenV = v === undefined ? 1 : clamp01(v); },
    setViewOffset(pxOff) { wantOff = pxOff || 0; },
    setPaused(v) { paused = !!v; resume(); },
    setFocus(tx) { focusTx = tx || null; },   // one offering's eye burns and the others turn to it (null: none)
    pick,
    wasDrag() { return moved > 6; },
    stats() { return { calls: lastCalls, triangles: lastTris, fps: Math.round(fps), dpr: Number(dpr.toFixed(2)), cap: Number(DPR.cap.toFixed(2)),
                       hd: Number(DPR.hd.toFixed(2)), floor: DPR.floor, mode: DPR.mode(), forced: DPR.pinned,
                       bw: renderer.domElement.width, bh: renderer.domElement.height, msaa: rtScene.samples, eyes: NE, phone: PHONE }; },
    measure() { tick(performance.now(), true); return this.stats(); },   // one forced frame (a hidden tab draws none)
    dispose() {
      alive = false;
      removeEventListener("resize", onResize); removeEventListener("pointermove", onPointer); document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("pointerdown", onDown); canvas.removeEventListener("pointermove", onMove); canvas.removeEventListener("pointerup", onUp);
      for (const d of disposables) { try { d.dispose(); } catch (_) { /* already gone */ } }
      renderer.dispose();
    },
  };
}

window.God = { supported, mount, genes };
window.dispatchEvent(new Event("god-ready"));
