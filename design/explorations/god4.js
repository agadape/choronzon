// EXPLORATION: the god, all out, on a budget.
// The Ophan (wheels within wheels, rims full of eyes) held by the Dweller in the Abyss (one arm per block).
// Form = pure function of score.json. Time animates; playback wakes an eye and turns every other eye toward it;
// the pointer moves only the great eye's gaze. No Math.random(); all noise is positional hashing.
// Budget (measured in the browser, see docs/visual-direction.md): ~15 draw calls, ~130k triangles, 3 post passes.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

const S = window.SCORE, q = new URLSearchParams(location.search);
const TAU = Math.PI * 2, PHONE = matchMedia("(max-width: 900px), (pointer: coarse)").matches;
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
const hb = (i) => parseInt(S.render_hash.slice(2 * i, 2 * i + 2), 16) / 255;
const seed0 = parseInt(S.render_hash.slice(0, 8), 16) >>> 0;

// ================================================================ renderer, camera
const canvas = document.getElementById("abyss");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: q.has("still") });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;           // the composite pass does tone + gamma itself
renderer.toneMapping = THREE.NoToneMapping;
const DPR_CAP = Math.min(devicePixelRatio || 1, PHONE ? 1 : 1.25);
let dpr = DPR_CAP;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 400);
camera.position.set(0, 0.3, 18.5);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, -1, 0); controls.enableDamping = true; controls.dampingFactor = 0.05; controls.enablePan = false;
controls.minDistance = 7; controls.maxDistance = 24; controls.minPolarAngle = 0.5; controls.maxPolarAngle = 1.75;
controls.autoRotate = !q.has("still"); controls.autoRotateSpeed = 0.18;
scene.add(new THREE.HemisphereLight(0x6f8790, 0x1a0606, 0.35));              // only the few Lambert props
const kl = new THREE.DirectionalLight(0xbcd2cc, 0.9); kl.position.set(-4, 5, 6); scene.add(kl);

// ================================================================ shared GLSL
const U = { uTime: { value: 0 }, uKey: { value: new THREE.Vector3(-0.45, 0.55, 0.7).normalize() },
            uRim: { value: new THREE.Vector3(0.1, 0.35, -1).normalize() }, uUnder: { value: new THREE.Vector3(0, -9, 2) },
            uSingP: { value: new THREE.Vector3() }, uSing: { value: 0 } };
const COMMON = `
uniform vec3 uKey, uRim, uUnder, uSingP; uniform float uTime, uSing;
float hash3(vec3 p){ p = fract(p * .3183099 + .1); p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1., 0., 0.)), f.x), mix(hash3(i + vec3(0., 1., 0.)), hash3(i + vec3(1., 1., 0.)), f.x), f.y),
             mix(mix(hash3(i + vec3(0., 0., 1.)), hash3(i + vec3(1., 0., 1.)), f.x), mix(hash3(i + vec3(0., 1., 1.)), hash3(i + vec3(1., 1., 1.)), f.x), f.y), f.z); }
float fbm3(vec3 p){ float a = .5, s = 0.; for (int i = 0; i < 3; i++){ s += a * noise3(p); p = p * 2.03 + 3.1; a *= .5; } return s; }
// relief without geometry: perturb the normal by the screen-space gradient of a height field
vec3 bumpN(vec3 N, vec3 P, float h, float s){
  vec3 dpx = dFdx(P), dpy = dFdy(P); float hx = dFdx(h), hy = dFdy(h);
  vec3 r1 = cross(dpy, N), r2 = cross(N, dpx); float det = dot(dpx, r1);
  return normalize(abs(det) * N - s * sign(det) * (hx * r1 + hy * r2));
}
// chiaroscuro: a weak cold key, a hard cold rim from behind, dull red from the Abyss below, a sickly light from a voice
vec3 shade(vec3 alb, vec3 N, vec3 P, float rough, float sss, float ao){
  vec3 V = normalize(cameraPosition - P);
  float nk = dot(N, uKey), k = max(nk, 0.), wrap = max((nk + .5) / 1.5, 0.);
  float fres = pow(1. - max(dot(N, V), 0.), 4.5);
  float back = smoothstep(-.3, .9, dot(uRim, -V)) * max(dot(N, uRim) + .35, 0.);
  vec3 Lu = uUnder - P; float du = length(Lu); float u = max(dot(N, Lu / du), 0.) * 12. / (1. + du * du * .06);
  vec3 Ls = uSingP - P; float ds = length(Ls); float sg = uSing * max(dot(N, Ls / ds), 0.) * 9. / (1. + ds * ds * .3);
  float sp = pow(max(dot(N, normalize(uKey + V)), 0.), mix(140., 14., rough)) * (1. - rough);
  float spR = pow(max(dot(N, normalize(uRim + V)), 0.), mix(100., 10., rough)) * (1. - rough);
  return alb * ao * (vec3(.006, .008, .012) + vec3(.3, .35, .37) * mix(k, wrap, sss) + vec3(.62, .09, .04) * u + vec3(.45, 1., .7) * sg)
       + vec3(.55, .95, .82) * fres * back * 1.5 * ao + vec3(.9) * sp * .55 + vec3(.6, 1., .85) * spR * 1.1
       + vec3(.22, .015, .025) * fres * sss;
}
vec3 fogged(vec3 c, vec3 P){
  float d = length(cameraPosition - P), f = 1. - exp(-d * d * .0006);
  float low = smoothstep(-1., -9., P.y);                                  // a red haze pools in the Abyss
  return mix(c, mix(vec3(.001, .002, .003), vec3(.03, .004, .003), low), clamp(f + low * .2, 0., 1.));
}`;
const mat = (vs, fs, extra = {}) => new THREE.ShaderMaterial({ uniforms: { ...U, ...(extra.uniforms || {}) }, vertexShader: vs, fragmentShader: COMMON + fs,
  side: extra.side || THREE.FrontSide, transparent: !!extra.transparent, depthWrite: extra.depthWrite !== false, blending: extra.blending || THREE.NormalBlending });

// ================================================================ data
const godTx = new Set(S.offerings.filter((o) => o.conductor).map((o) => o.tx));
const offers = [], gods = [];
S.timeline.forEach((p, n) => {
  const it = { start: p.start, end: p.start + p.samples, silent: p.silent, g: genes(p.contrib_id, n, 12),
    bright: clamp01((p.zero_crossings - 1500) / 1700), secs: clamp01((p.samples / 8000 - 2) / 6), pan: (p.pan - 8) / 8, layer: p.pitch_layer };
  (godTx.has(p.tx) ? gods : offers).push(it);
});
const forged = S.skipped.filter((s) => s.reason === "forged-conductor").map((s, i) => genes(parseInt(s.tx.slice(0, 8), 16) >>> 0, i, 6));
const wakeOf = (it, t) => (t < 0 ? 0 : clamp01((t - it.start) / 1200) * clamp01((it.end - t) / 2400));

// ================================================================ the sky: a nebula that is not ours
{
  const sky = new THREE.Mesh(new THREE.SphereGeometry(200, 32, 16), mat(
    `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    `varying vec3 vD;
    void main(){
      vec3 d = normalize(vD);
      float n = fbm3(d * 2.6 + vec3(0., uTime * .002, 0.)), n2 = fbm3(d * 7. + n * 2.);
      vec3 c = mix(vec3(.004, .007, .01), vec3(.02, .05, .052), pow(n, 2.5)) + vec3(.05, .012, .06) * pow(n2, 4.) * 1.2;
      c += vec3(.08, .01, .005) * smoothstep(.1, -.6, d.y) * n;
      c += vec3(.35, .55, .5) * pow(max(dot(d, normalize(cameraPosition * -1.)), 0.), 60.) * 0.;                                      // the Abyss below glows
      vec3 cell = floor(d * 420.); float s = hash3(cell);
      c += vec3(.7, .82, .95) * step(.9975, s) * (.4 + .6 * hash3(cell + 7.)) * (.7 + .3 * sin(uTime * (1. + s * 4.) + s * 50.));
      // the vast: an arc of something far larger than the wheels, felt more than seen
      float arc = exp(-pow((acos(dot(d, normalize(vec3(.3, .55, -1.)))) - .9) / .012, 2.)) * smoothstep(.35, .6, fbm3(d * 9.));
      c += vec3(.25, .35, .32) * arc * .12;
      gl_FragColor = vec4(c, 1.);
    }`, { side: THREE.BackSide }));
  scene.add(sky);
}

// ================================================================ the wheels: lathed rims with a channel the eyes sit in
function scriptTexture(seed) {
  const c = document.createElement("canvas"); c.width = 2048; c.height = 64; const x = c.getContext("2d");
  x.fillStyle = "#000"; x.fillRect(0, 0, 2048, 64); x.strokeStyle = "#fff"; x.lineCap = "round";
  let i = 0;
  for (let px = 6; px < 2040; px += 10) {   // a script too fine to read, cut from the hash
    const g = genes(seed, i++, 8); x.lineWidth = 1.2 + g[7] * 1.2; x.beginPath();
    x.moveTo(px + g[0] * 6, 14 + g[1] * 36); x.lineTo(px + g[2] * 6, 14 + g[3] * 36); x.quadraticCurveTo(px + g[4] * 8, 10 + g[5] * 44, px + g[6] * 6, 14 + g[7] * 36); x.stroke();
    if (g[0] > 0.86) { x.beginPath(); x.arc(px + 3, 32, 4 + g[1] * 4, 0, TAU); x.stroke(); }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}
const ringMat = mat(
  `varying vec3 vP, vN; varying vec2 vUv;
  void main(){ vec4 wp = modelMatrix * vec4(position, 1.); vP = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vUv = uv; gl_Position = projectionMatrix * viewMatrix * wp; }`,
  `uniform sampler2D uScript; varying vec3 vP, vN; varying vec2 vUv;
  void main(){
    vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
    float v = vUv.y, seg = v * 12., band = floor(seg), lv = fract(seg);
    float face = step(10.5, band) + step(2.5, band) * step(band, 3.5) + step(6.5, band) * step(band, 7.5);   // inner face and flanks carry script
    float script = texture2D(uScript, vec2(vUv.x * 5., lv)).r * face;
    float chan = step(4.5, band) * step(band, 5.5);
    float lip = exp(-pow((v - .208) / .035, 2.)) + exp(-pow((v - .792) / .035, 2.));
    float pit = fbm3(vP * 7.);
    float h = script * .8 + pit * .35;
    N = bumpN(N, vP, h, .02);
    vec3 V = normalize(cameraPosition - vP), R = reflect(-V, N);
    float ao = mix(1., .3, chan) * (.75 + .25 * pit) * mix(1., .55, script);                     // grime in the cuts and the channel
    vec3 base = mix(vec3(.12, .045, .025), vec3(.42, .27, .11), lip);                              // blood-bronze, polished at the lips
    vec3 env = mix(vec3(.004, .003, .003), vec3(.22, .26, .24), pow(smoothstep(-.1, 1., R.y), 3.)) * mix(vec3(.6, .25, .16), vec3(1., .78, .45), lip);
    vec3 c = shade(base, N, vP, mix(.35, .12, lip), 0., ao) + env * ao * (.25 + .7 * lip);
    gl_FragColor = vec4(fogged(c, vP), 1.);
  }`, { uniforms: { uScript: { value: scriptTexture(seed0) } }, side: THREE.DoubleSide });
function ringGeometry(R) {
  const T = 0.2, H = 0.76;
  const pts = [[R - T, -H / 2], [R - T * 0.4, -H / 2 - 0.035], [R + 0.05, -H / 2 - 0.02], [R + 0.105, -H / 2 + 0.035], [R + 0.075, -H / 2 + 0.105],
    [R - 0.02, -H / 2 + 0.155], [R - 0.02, H / 2 - 0.155], [R + 0.075, H / 2 - 0.105], [R + 0.105, H / 2 - 0.035], [R + 0.05, H / 2 + 0.02],
    [R - T * 0.4, H / 2 + 0.035], [R - T, H / 2], [R - T, -H / 2]].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, PHONE ? 84 : 144);
}
const cap = (k) => 10 + 4 * k;
let K = 0; for (let left = offers.length; left > 0; K++) left -= cap(K);
K = Math.max(K, 3);
const rings = [];
for (let k = 0; k < K; k++) {
  const R = 2.3 + 0.92 * k;
  const pivot = new THREE.Group(), spinner = new THREE.Group(); pivot.add(spinner); scene.add(pivot);
  spinner.add(new THREE.Mesh(ringGeometry(R), ringMat));
  pivot.rotation.set((hb(2 + k) - 0.5) * 2.4, hb(6 + k) * TAU, (hb(10 + k) - 0.5) * 2.4);
  rings.push({ pivot, spinner, R, base: pivot.rotation.clone(), wx: (k % 2 ? 1 : -1) * (0.04 + 0.03 * hb(14 + k)),
    wz: (k % 2 ? -1 : 1) * (0.03 + 0.02 * hb(18 + k)), spin: (k % 2 ? -1 : 1) * (0.06 + 0.04 * hb(22 + k)) });
}

// ================================================================ eyes: list every eye first, then ONE instanced mesh
const IRIS = [[0.38, 0.55, 0.66], [0.5, 0.58, 0.42], [0.62, 0.44, 0.2], [0.33, 0.4, 0.38]];
const eyeList = [];
offers.forEach((it, n) => {
  let k = 0, j = n; while (j >= cap(k)) { j -= cap(k); k++; }
  const r = rings[k], th = (j / cap(k)) * TAU + k * 0.37, eR = 0.25 + 0.07 * it.secs;
  const nrm = new THREE.Vector3(Math.cos(th), 0, Math.sin(th));
  const socket = new THREE.Object3D();
  socket.position.copy(nrm.clone().multiplyScalar(r.R - 0.02 + eR * 0.35)).add(new THREE.Vector3(0, it.pan * 0.04, 0));
  socket.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), nrm); r.spinner.add(socket);
  eyeList.push({ kind: "ring", socket, r: eR, iris: IRIS[Math.floor(it.g[1] * 4)], stripes: 14 + 40 * it.bright, slit: it.layer >= 2 ? 1 : 0, seed: it.g[2] * 20, blind: 0, it, lid: true });
});
const great = { kind: "great", r: 1.32, iris: [0.36, 0.55, 0.7], stripes: 70, slit: 0, seed: 3.3, blind: 0, lid: true, look: new THREE.Vector3(0, 0, 20) };
eyeList.push(great);
forged.forEach((g) => eyeList.push({ kind: "blind", g, r: 0.09 + 0.04 * g[2], iris: [0.6, 0.1, 0.1], stripes: 1, slit: 0, seed: g[3] * 10, blind: 1, lid: false }));

// ================================================================ the Dweller: one living mass, one arm per block
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
  vec3 c = mix(vec3(.012, .009, .014), vec3(.095, .032, .042), n * n);                   // bruise and old blood
  c = mix(c, vec3(.26, .17, .1), smoothstep(.64, .8, fbm3(vObj * 1.3 + 9.)) * .45);      // jaundiced patches
  float h, ao = 1.;
  ${arms ? `
  float t = vUv.x;
  float vent = smoothstep(.6, .7, vUv.y) * smoothstep(.96, .86, vUv.y);
  c = mix(c, vec3(.2, .13, .12), vent);                                                   // pale underside
  float vv = (vUv.y - .78) / .085, su = fract(t * vLen * 1.7) - .5, d = length(vec2(su * 2.4, vv));
  float on = step(abs(vv), 1.35) * step(t, .965) * smoothstep(0., .03, t);
  float cup = (smoothstep(1., .72, d) - smoothstep(.55, .18, d) * 1.4) * on;             // suckers: raised rims, dark mouths
  float wr = pow(.5 + .5 * sin(t * vLen * 10. + n * 6.), 4.);                             // muscle rings
  h = cup + wr * .45 + n * .5 + pores * .12;
  c = mix(c, vec3(.36, .25, .22), smoothstep(.95, .72, d) * smoothstep(.42, .6, d) * on * .7);
  c = mix(c, vec3(.03, .006, .01), smoothstep(.42, .15, d) * on);
  ao = mix(1., .55, smoothstep(.42, .1, d) * on) * (.45 + .55 * smoothstep(0., .22, t)) * (.7 + .3 * wr);
  N = bumpN(N, vP, h, .03 * vRad);` : `
  float ridge = pow(1. - abs(fbm3(vObj * 1.4) * 2. - 1.), 3.);                             // folds of the mass
  h = ridge * .9 + n * .4 + pores * .12;
  ao = .45 + .55 * ridge;
  N = bumpN(N, vP, h, .09);`}
  c = mix(c, vec3(.012, .006, .01), spots * .75);
  c = mix(c, vec3(.3, .015, .025), vein * .55);
  c *= .8 + .4 * pores;
  float rough = mix(.8, .12, smoothstep(.45, .72, n + vein * .3));                         // slime where the veins run
  gl_FragColor = vec4(fogged(shade(c, N, vP, rough, 1., ao), vP), 1.);
}`;
const lidOnly = [];   // lids for the dweller's eyes: { pos, dir, r }
{
  const waves = Array.from({ length: 8 }, (_, i) => { const g = genes(seed0 ^ 0x5eed, i, 4);
    const k = new THREE.Vector3(g[0] - 0.5, g[1] - 0.5, g[2] - 0.5).normalize().multiplyScalar(0.6 + i * 0.5); return { k, ph: g[3] * TAU, a: 0.5 / (1 + i * 0.6) }; });
  const field = (p) => waves.reduce((s, w) => s + Math.sin(p.dot(w.k) + w.ph) * w.a, 0);
  const C0 = new THREE.Vector3(0, -14.8, -6), RM = 9;
  const surf = (dir) => { const p = dir.clone().multiplyScalar(RM); return RM + field(p.clone().multiplyScalar(0.35)) * 1.5 + field(p.clone().multiplyScalar(1.3)) * 0.32; };
  const zeros = (n) => new THREE.BufferAttribute(new Float32Array(n), 1);
  const mg = mergeVertices(new THREE.IcosahedronGeometry(RM, PHONE ? 14 : 22)), pa = mg.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i); const d = v.clone().normalize(); v.copy(d.multiplyScalar(surf(d))); pa.setXYZ(i, v.x, v.y, v.z); }
  mg.computeVertexNormals(); for (const a of ["aRad", "aPhase", "aLen"]) mg.setAttribute(a, zeros(pa.count));
  const mass = new THREE.Mesh(mg, mat(FLESH_VS(false), FLESH_FS(false))); mass.position.copy(C0); scene.add(mass);
  { // blisters
    const N = PHONE ? 70 : 150, bm = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), mat(
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
  const TS = PHONE ? 56 : 88, RS = PHONE ? 8 : 12, arms = [];
  bl.forEach(([height, count], i) => {
    const g = genes(height, i, 10);
    const prev = i ? bl[i - 1][0] : height, wait = Math.min(1, Math.log10(1 + height - prev) / 4);
    const front = count >= 4;                                   // a few arms come round in front and frame the god
    const a = Math.PI * (1.05 + 0.9 * ((i * 0.6180339887 + g[0] * 0.05) % 1)), el = 0.35 + 0.5 * g[1];
    const dir = new THREE.Vector3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el));
    const root = C0.clone().addScaledVector(dir, surf(dir) * 0.96);
    const reach = 0.5 + 0.5 * Math.min(1, (count - 1) / 4);
    const b0 = i * 2.39996 + g[2] * 0.4, b = front ? (Math.cos(b0) > 0 ? 0.25 : Math.PI - 0.25) + (g[2] - 0.5) * 0.5 : b0, rr = (front ? 8.2 : 6.4) + 2.6 * g[3] * reach + 1.2 * reach;
    const side = new THREE.Vector3(Math.cos(b), Math.sin(b) * 0.85, 0);
    const zz = front ? 2.4 + 1.5 * g[4] : -4.2 + 1.8 * g[4];
    const p1 = root.clone().addScaledVector(dir, 3.8).add(new THREE.Vector3(Math.cos(b) * 3.2, 3.2, front ? 3 : -3.5));
    const p2 = side.clone().multiplyScalar(rr).add(new THREE.Vector3(0, -0.4, zz));
    const sgn = g[5] < 0.5 ? 1 : -1, L = 1.3 + 2.4 * wait;
    const tang = new THREE.Vector3(-Math.sin(b), Math.cos(b) * 0.85, 0.3).normalize().multiplyScalar(sgn);
    // the tip curls in a tightening spiral (a longer wait curls tighter)
    const pts = [root, p1, p2];
    for (let s = 1; s <= 4; s++) { const ang = s * (0.55 + 0.3 * wait), rad = L * Math.pow(0.8, s);
      pts.push(p2.clone().addScaledVector(tang, L * 0.9 + Math.sin(ang) * rad).addScaledVector(side, -(1 - Math.cos(ang)) * rad * 1.1)); }
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, TS, 1, RS, false);
    const r0 = 0.16 + 0.2 * count + 0.12 * g[6] + (front ? 0.25 : 0), gp = geo.attributes.position, c = new THREE.Vector3();
    const aRad = new Float32Array(gp.count), aPh = new Float32Array(gp.count).fill(g[5] * TAU), aLen = new Float32Array(gp.count).fill(curve.getLength() / (r0 * 2.4));
    for (let s2 = 0; s2 <= TS; s2++) { const t = s2 / TS; curve.getPointAt(t, c);
      const rad = r0 * Math.pow(1 - t, 0.75) * (1 + 0.12 * Math.sin(t * 15 + g[7] * 6)) * (t < 0.08 ? 1 + (0.08 - t) * 6 : 1) + 0.015;
      for (let kk = 0; kk <= RS; kk++) { const idx = s2 * (RS + 1) + kk; v.fromBufferAttribute(gp, idx).sub(c).multiplyScalar(rad).add(c); gp.setXYZ(idx, v.x, v.y, v.z); aRad[idx] = rad; } }
    geo.computeVertexNormals();
    geo.setAttribute("aRad", new THREE.BufferAttribute(aRad, 1)); geo.setAttribute("aPhase", new THREE.BufferAttribute(aPh, 1)); geo.setAttribute("aLen", new THREE.BufferAttribute(aLen, 1));
    arms.push(geo);
    if (count >= 2) {   // a busy block opens an eye at the root of its arm
      const d2 = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.24), er = 0.55 + 0.16 * count;
      const pos = C0.clone().addScaledVector(d2, surf(d2) + er * 0.2);
      const e = { kind: "dweller", pos, dir: d2, r: er, iris: [0.62, 0.46, 0.16], stripes: 30, slit: g[9] < 0.5 ? 1 : 0, seed: g[6] * 30, blind: 0, lid: true };
      eyeList.push(e);
    }
  });
  scene.add(new THREE.Mesh(mergeGeometries(arms), mat(FLESH_VS(true), FLESH_FS(true))));
  // debris
  const shards = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0x1c1a20, flatShading: true }), 80);
  const mtx = new THREE.Matrix4(), qq = new THREE.Quaternion(), sc = new THREE.Vector3();
  for (let i = 0; i < 80; i++) { const g = genes(seed0, 2000 + i, 7);
    qq.setFromEuler(new THREE.Euler(g[3] * TAU, g[4] * TAU, g[5] * TAU)); sc.set(0.06 + g[6] * 0.22, 0.1 + g[6] * 0.42, 0.06 + g[6] * 0.18);
    shards.setMatrixAt(i, mtx.compose(new THREE.Vector3((g[0] - 0.5) * 34, (g[1] - 0.45) * 20, (g[2] - 0.6) * 26), qq, sc)); }
  scene.add(shards); window.__shards = shards;
}

// ---------------------------------------------------------------- one instanced mesh for every eye
const NE = eyeList.length;
const eyeGeo = new THREE.SphereGeometry(1, PHONE ? 18 : 26, PHONE ? 12 : 18);
const iIris = new Float32Array(NE * 3), iEye = new Float32Array(NE * 4), iWake = new Float32Array(NE);
eyeList.forEach((e, i) => { iIris.set(e.iris, i * 3); iEye.set([e.stripes, e.slit, e.seed, e.blind], i * 4); });
eyeGeo.setAttribute("aIris", new THREE.InstancedBufferAttribute(iIris, 3));
eyeGeo.setAttribute("aEye", new THREE.InstancedBufferAttribute(iEye, 4));
const wakeAttr = new THREE.InstancedBufferAttribute(iWake, 1); wakeAttr.setUsage(THREE.DynamicDrawUsage); eyeGeo.setAttribute("aWake", wakeAttr);
const eyes = new THREE.InstancedMesh(eyeGeo, mat(
  `attribute vec3 aIris; attribute vec4 aEye; attribute float aWake;
  varying vec3 vObj, vN, vP, vIris, vVo; varying vec4 vEye; varying float vWake;
  void main(){ vObj = position; vIris = aIris; vEye = aEye; vWake = aWake;
    mat4 m = modelMatrix * instanceMatrix; vec4 wp = m * vec4(position, 1.); vP = wp.xyz; vN = normalize(mat3(m) * normal);
    vVo = normalize((inverse(m) * vec4(cameraPosition, 1.)).xyz - position);          // view ray in the eye's own space (for the cornea)
    gl_Position = projectionMatrix * viewMatrix * wp; }`,
  `varying vec3 vObj, vN, vP, vIris, vVo; varying vec4 vEye; varying float vWake;
  void main(){
    vec3 o = normalize(vObj), N = normalize(vN); float seed = vEye.z;
    // the cornea: look through it to an iris set back inside the eye
    vec2 ip = o.xy - vVo.xy / max(vVo.z, .25) * max(o.z - .82, 0.) * .9;
    float ir = .44, r = length(ip), pr = mix(.15, .3, vWake), front = smoothstep(.55, .8, o.z);
    float ang = acos(clamp(o.z, -1., 1.)), ph = atan(o.y, o.x);
    float vein = pow(1. - abs(fbm3(vec3(ph * 2.2, ang * 4., seed)) * 2. - 1.), 10.) * smoothstep(.5, 1.7, ang);
    vec3 col = mix(vec3(.8, .78, .7) * (1. - .45 * smoothstep(.9, 2.6, ang)), vec3(.5, .04, .03), vein * .9);
    col *= 1. - .25 * smoothstep(.3, .0, abs(ang - 1.57));                                 // the wet line where it meets the lid
    vec3 emit = vec3(0.);
    if (vEye.w < .5){
      float a = atan(ip.y, ip.x);
      float st = .5 + .5 * cos(a * vEye.x + fbm3(vec3(ip * 9., seed)) * 5.);
      float crypt = smoothstep(.6, .75, fbm3(vec3(ip * 14., seed + 3.)));
      vec3 irc = mix(vIris * .18, vIris * 1.2, st) * (1. - crypt * .5);
      irc *= mix(1., .25, smoothstep(ir * .72, ir, r));                                     // dark limbal ring
      irc = mix(irc, vIris * 1.6, smoothstep(pr * 1.6, pr * 1.05, r) * .5);                  // collarette
      float im = smoothstep(ir + .02, ir - .02, r) * front;
      col = mix(col, irc, im);
      emit = (vIris * 2.4 * st + vec3(.5, 1., .72) * .6) * vWake * im;                        // a voice: the iris burns
      float pm = vEye.y > .5 ? smoothstep(1., .8, length(ip / vec2(pr * .28, pr * 1.15))) : smoothstep(pr + .015, pr - .015, r);
      pm *= front; col = mix(col, vec3(.003), pm); emit *= 1. - pm;
    } else col = mix(col, vec3(.5, .06, .04), .7);
    vec3 c = shade(col, N, vP, .1, .25, 1.) + emit;
    vec3 V = normalize(cameraPosition - vP);
    c += vec3(.9, 1., .95) * pow(max(dot(reflect(-V, N), normalize(vec3(-.3, .8, .4))), 0.), 400.) * 1.1;   // a window caught on the wet surface
    gl_FragColor = vec4(fogged(c, vP), 1.);
  }`), NE);
eyes.instanceMatrix.setUsage(THREE.DynamicDrawUsage); eyes.frustumCulled = false; scene.add(eyes);

// a cold light that is always behind the god, wherever you stand: the cage and the arms cut it into rays
const backC = document.createElement("canvas"); backC.width = backC.height = 256;
{ const x = backC.getContext("2d"), g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.12, "rgba(200,255,230,0.55)"); g.addColorStop(0.4, "rgba(90,160,140,0.12)"); g.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = g; x.fillRect(0, 0, 256, 256); }
const backLight = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(backC), color: new THREE.Color(2.2, 3.0, 2.7), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
backLight.scale.setScalar(11); scene.add(backLight);

// ---------------------------------------------------------------- lids: a shell of flesh with an almond cut, one instanced mesh
const lidEyes = eyeList.filter((e) => e.lid);
const NL = lidEyes.length, iOpen = new Float32Array(NL), iSewn = new Float32Array(NL);
lidEyes.forEach((e, i) => { iSewn[i] = e.it && e.it.silent ? 1 : 0; e.lidIndex = i; });
const lidGeo = new THREE.SphereGeometry(1, PHONE ? 18 : 24, PHONE ? 12 : 16);
const openAttr = new THREE.InstancedBufferAttribute(iOpen, 1); openAttr.setUsage(THREE.DynamicDrawUsage); lidGeo.setAttribute("aOpen", openAttr);
lidGeo.setAttribute("aSewn", new THREE.InstancedBufferAttribute(iSewn, 1));
const lids = new THREE.InstancedMesh(lidGeo, mat(
  `attribute float aOpen, aSewn; varying vec3 vObj, vN, vP; varying float vOpen, vSewn;
  void main(){ vObj = position; vOpen = aOpen; vSewn = aSewn; mat4 m = modelMatrix * instanceMatrix; vec4 wp = m * vec4(position, 1.);
    vP = wp.xyz; vN = normalize(mat3(m) * normal); gl_Position = projectionMatrix * viewMatrix * wp; }`,
  `varying vec3 vObj, vN, vP; varying float vOpen, vSewn;
  void main(){
    vec3 o = normalize(vObj);
    float edge = vOpen * .66 * (1. - pow(o.x / .97, 2.));                                   // the almond opening
    float inside = step(.15, o.z) * step(abs(o.y), edge);
    if (inside > .5 && vSewn < .5) discard;
    float dist = abs(o.y) - edge;
    float fold = .5 + .5 * sin(dist * 60.) ; fold *= smoothstep(.3, .02, dist) * step(0., dist);
    float n = fbm3(vObj * 8.), vein = pow(1. - abs(fbm3(vObj * 5. + 2.) * 2. - 1.), 14.);
    vec3 c = mix(vec3(.08, .035, .035), vec3(.24, .12, .1), n) * (1. - .45 * fold);
    c = mix(c, vec3(.32, .03, .04), vein * .5);
    vec3 N = bumpN(normalize(vN), vP, fold * .6 + n * .4, .012);
    float rim = smoothstep(.05, .0, dist) * step(0., dist);                                 // the wet rim of the lid
    vec3 col = shade(c, N, vP, mix(.75, .15, rim), 1., 1. - .3 * fold) + vec3(.35, .1, .08) * rim * .4;
    if (vSewn > .5){ float st = step(abs(o.y), .06) * step(.5, fract(o.x * 6.)) + step(abs(fract(o.x * 6.) - .25), .04) * step(abs(o.y), .18);
      col = mix(col, vec3(.55, .5, .42), st * step(.1, o.z)); }
    gl_FragColor = vec4(fogged(col, vP), 1.);
  }`), NL);
lids.instanceMatrix.setUsage(THREE.DynamicDrawUsage); lids.frustumCulled = false; scene.add(lids);

// ================================================================ particles: dust that hangs, embers that rise from the Abyss
function motes(N, seed, color, size, rise) {
  const pos = new Float32Array(N * 3), ph = new Float32Array(N);
  for (let i = 0; i < N; i++) { const g = genes(seed, i, 4); const r = 3 + 19 * g[0], a = g[1] * TAU; pos.set([Math.cos(a) * r, (g[2] - 0.5) * 22, Math.sin(a) * r - 2], i * 3); ph[i] = g[3]; }
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("aPh", new THREE.BufferAttribute(ph, 1));
  const m = new THREE.ShaderMaterial({ uniforms: { uTime: U.uTime, uC: { value: new THREE.Color(...color) }, uS: { value: size }, uRise: { value: rise } },
    vertexShader: `attribute float aPh; uniform float uTime, uS, uRise; varying float vA;
      void main(){ vec3 p = position; p.y = mod(p.y + uTime * uRise * (.5 + aPh) + 11., 22.) - 11.; p.x += sin(uTime * .2 + aPh * 30.) * .3;
        vec4 mv = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = uS * (.5 + aPh) * 300. / -mv.z;
        vA = (.4 + .6 * sin(uTime * (1. + aPh * 2.) + aPh * 40.) * .5 + .3) * smoothstep(40., 8., -mv.z) * (uRise > 0. ? smoothstep(11., -2., p.y) : 1.); }`,
    fragmentShader: `uniform vec3 uC; varying float vA; void main(){ float d = length(gl_PointCoord - .5); if (d > .5) discard; gl_FragColor = vec4(uC * vA * smoothstep(.5, .0, d), 1.); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  scene.add(new THREE.Points(geo, m));
}
motes(PHONE ? 500 : 1200, seed0, [0.5, 0.7, 0.65], 0.045, 0);
motes(PHONE ? 120 : 280, seed0 ^ 0xe1, [1.6, 0.35, 0.1], 0.07, 0.35);
{ // the Watcher on a floating rock
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.3, 1), new THREE.MeshLambertMaterial({ color: 0x151419, flatShading: true }));
  rock.scale.set(0.9, 0.5, 0.7); rock.position.set(6.2, -3.6, 3.2); scene.add(rock);
  const body = mergeGeometries([new THREE.CapsuleGeometry(0.03, 0.13, 4, 8), new THREE.SphereGeometry(0.03, 8, 6).translate(0, 0.12, 0)].map((g) => g.toNonIndexed()));
  const w = new THREE.Mesh(body, new THREE.MeshLambertMaterial({ color: 0x060608 })); w.position.set(6.1, -2.98, 3.3); scene.add(w);
}

// ================================================================ post: scene (HDR) -> god rays (half res) -> composite
const rtOpts = { type: THREE.HalfFloatType, depthBuffer: true, samples: PHONE ? 0 : 4 };
const rtScene = new THREE.WebGLRenderTarget(1, 1, rtOpts), rtRays = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), quadGeo = new THREE.PlaneGeometry(2, 2);
const QVS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`;
const raysMat = new THREE.ShaderMaterial({ uniforms: { tScene: { value: rtScene.texture }, uSun: { value: new THREE.Vector2(0.4, 0.5) }, uGod: { value: 0 } }, vertexShader: QVS,
  fragmentShader: `uniform sampler2D tScene; uniform vec2 uSun; uniform float uGod; varying vec2 vUv;
  void main(){ vec2 d = (vUv - uSun) / 30. * .92; vec2 p = vUv; vec3 acc = vec3(0.); float w = 1.;
    for (int i = 0; i < 30; i++){ p -= d; vec3 s = texture2D(tScene, p).rgb; float l = max(dot(s, vec3(.3, .59, .11)) - .28, 0.); acc += s * l * w; w *= .94; }
    gl_FragColor = vec4(acc * (.2 + uGod * .12) * vec3(.7, 1., .9), 1.); }`, depthTest: false, depthWrite: false });
const compMat = new THREE.ShaderMaterial({ uniforms: { tScene: { value: rtScene.texture }, tRays: { value: rtRays.texture }, uRes: { value: new THREE.Vector2(1, 1) },
    uTime: U.uTime, uInk: { value: q.has("ink") ? 1 : 0 }, uGod: { value: 0 } }, vertexShader: QVS,
  fragmentShader: `uniform sampler2D tScene, tRays; uniform vec2 uRes; uniform float uTime, uInk, uGod; varying vec2 vUv;
  float h(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(.06711056, .00583715)))); }
  vec3 aces(vec3 x){ return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.); }
  vec3 grade(vec2 uv){ vec2 c = uv - .5; float ca = .004 * dot(c, c) * 4. * (1. + uGod * 2.);
    vec3 col = vec3(texture2D(tScene, uv + c * ca).r, texture2D(tScene, uv).g, texture2D(tScene, uv - c * ca).b) + texture2D(tRays, uv).rgb;
    col = aces(col * 1.1);
    col = mix(vec3(dot(col, vec3(.3, .59, .11))), col, .88);                                // a little colour bled out
    return col * mix(.25, 1., smoothstep(1.15, .25, length(c * vec2(1.25, 1.)))); }
  void main(){
    vec3 col = grade(vUv);
    if (uInk > .5){                                                                        // the engraving
      vec2 px = 1. / uRes, p = gl_FragCoord.xy; float l = dot(col, vec3(.3, .59, .11)) * 1.5;
      float g = length(vec2(dot(grade(vUv + vec2(px.x, 0.)) - grade(vUv - vec2(px.x, 0.)), vec3(.33)), dot(grade(vUv + vec2(0., px.y)) - grade(vUv - vec2(0., px.y)), vec3(.33))));
      float ink = 1., s = 4.5;
      if (l < .62 && mod(p.x + p.y, s) < 1.1) ink = 0.; if (l < .38 && mod(p.x - p.y, s) < 1.1) ink = 0.;
      if (l < .2 && mod(p.y, s * .75) < 1.1) ink = 0.; if (l < .06 || g > .06) ink = 0.; if (l > .85) ink = 1.;
      col = mix(vec3(.02), vec3(.92, .9, .85), ink);
    }
    col += (h(gl_FragCoord.xy + vec2(floor(uTime * 24.) * 5.588, floor(uTime * 24.) * 3.1)) - .5) * .04;                       // grain
    gl_FragColor = vec4(pow(max(col, 0.), vec3(1. / 2.2)), 1.);
  }`, depthTest: false, depthWrite: false });
const raysQuad = new THREE.Mesh(quadGeo, raysMat), compQuad = new THREE.Mesh(quadGeo, compMat);
addEventListener("keydown", (e) => { if (e.key.toLowerCase() === "i") compMat.uniforms.uInk.value = 1 - compMat.uniforms.uInk.value; });

// ================================================================ size, adaptive resolution, pause when hidden
function size() {
  const w = innerWidth, h = innerHeight, narrow = w <= 900;
  renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
  rtScene.setSize(Math.round(w * dpr), Math.round(h * dpr)); rtRays.setSize(Math.round(w * dpr / 2), Math.round(h * dpr / 2));
  compMat.uniforms.uRes.value.set(w * dpr, h * dpr);
  camera.aspect = w / h; camera.fov = narrow ? 52 : 36;
  if (narrow) camera.setViewOffset(w, h, 0, h * 0.12, w, h); else camera.setViewOffset(w, h, ((window.LEAF_W || 430) + 80) / 2, 0, w, h);
  camera.updateProjectionMatrix();
}
addEventListener("resize", size); addEventListener("leaf-layout", size); size();
let ema = 16, lastT = 0, running = true;
function adapt(dt) { ema = ema * 0.95 + dt * 0.05;
  const next = ema > 22 ? Math.max(0.55, dpr - 0.1) : ema < 13 ? Math.min(DPR_CAP, dpr + 0.05) : dpr;
  if (Math.abs(next - dpr) > 0.01) { dpr = next; size(); } }
document.addEventListener("visibilitychange", () => { running = !document.hidden; if (running) { lastT = 0; requestAnimationFrame(tick); } });

// ================================================================ frame
let px = 0, py = 0; addEventListener("pointermove", (e) => { px = (e.clientX / innerWidth) * 2 - 1; py = -(e.clientY / innerHeight) * 2 + 1; });
const T0 = performance.now(), dummy = new THREE.Object3D(), camP = new THREE.Vector3(), tmpV = new THREE.Vector3(), nW = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
const right = new THREE.Vector3(), up = new THREE.Vector3(), M = new THREE.Matrix4(), S4 = new THREE.Matrix4(), sunV = new THREE.Vector3();
const eyePos = eyeList.map(() => new THREE.Vector3());
function tick(now) {
  if (!running) return;
  if (lastT && !q.has("still")) adapt(now - lastT); lastT = now;
  const time = q.has("time") ? Number(q.get("time")) : (now - T0) / 1000 + 30;
  const t = typeof window.PLAY_T === "number" ? window.PLAY_T : -1;
  controls.update(); U.uTime.value = time;
  for (const r of rings) { r.pivot.rotation.x = r.base.x + time * r.wx; r.pivot.rotation.z = r.base.z + time * r.wz; r.spinner.rotation.y = time * r.spin; }
  scene.updateMatrixWorld(); camP.copy(camera.position);
  right.setFromMatrixColumn(camera.matrixWorld, 0); up.setFromMatrixColumn(camera.matrixWorld, 1);
  // positions first, then find the voice that is sounding
  let singer = -1, sw = 0, gw = 0;
  for (const g of gods) gw = Math.max(gw, wakeOf(g, t));
  eyeList.forEach((e, i) => {
    if (e.kind === "ring") { e.socket.getWorldPosition(eyePos[i]); const w = wakeOf(e.it, t); e.w = w; if (w > sw) { sw = w; singer = i; } }
    else if (e.kind === "great") { eyePos[i].set(0, 0, 0); e.w = gw; }
    else if (e.kind === "dweller") { eyePos[i].copy(e.pos); e.w = 0; }
    else { const g = e.g, a = g[0] * TAU + time * (0.02 + 0.02 * g[1]), r = 6.5 + 2 * g[2]; eyePos[i].set(Math.cos(a) * r, (g[4] - 0.5) * 5, Math.sin(a) * r); e.w = 0; }
  });
  const sing = singer >= 0 && sw > 0.25;
  U.uSing.value = sing ? sw : 0; if (singer >= 0) U.uSingP.value.copy(eyePos[singer]);
  eyeList.forEach((e, i) => {
    const P = eyePos[i]; let target, scale = e.r;
    // when a voice sounds, every other eye turns to the one that speaks; otherwise they watch you
    if (sing && i !== singer && e.kind !== "blind" && e.kind !== "great") target = eyePos[singer].clone();
    else if (e.kind === "great") target = camP.clone().addScaledVector(right, px * 6).addScaledVector(up, py * 4);
    else target = camP.clone();
    if (e.kind === "ring") {
      scale = e.it.silent ? e.r * 0.9 : e.r * (1 + 0.15 * e.w);
      e.socket.getWorldQuaternion(tmpQ); nW.set(0, 0, 1).applyQuaternion(tmpQ);
      const dir = target.sub(P).normalize(), d = dir.dot(nW);                                // as far as the socket lets it
      if (d < 0.55) dir.addScaledVector(nW, 0.55 - d).normalize();
      target = P.clone().add(dir);
    } else if (e.kind === "dweller") {
      const dir = target.sub(P).normalize(), d = dir.dot(e.dir); if (d < 0.3) dir.addScaledVector(e.dir, 0.3 - d).normalize(); target = P.clone().add(dir);
    } else if (e.kind === "blind" && ((time * (0.15 + 0.1 * e.g[5]) + e.g[3]) % 1) >= 0.55) scale = 0;
    dummy.position.copy(P); dummy.scale.setScalar(scale); dummy.lookAt(target); dummy.updateMatrix(); eyes.setMatrixAt(i, dummy.matrix); iWake[i] = e.w;
    if (e.lid) {   // lids sit in the socket (wheel eyes), on the flesh (dweller eyes), or face the watcher (the great eye)
      const li = e.lidIndex, s = e.r * 1.08;
      if (e.kind === "ring") { M.copy(e.socket.matrixWorld); S4.makeScale(s, s, s); M.multiply(S4); }
      else { dummy.position.copy(P); dummy.scale.setScalar(e.kind === "great" ? e.r * 1.06 : s);
        dummy.lookAt(e.kind === "great" ? camP : P.clone().add(e.dir)); dummy.updateMatrix(); M.copy(dummy.matrix); }
      lids.setMatrixAt(li, M);
      const blink = ((time * (0.05 + 0.04 * ((i * 0.618) % 1)) + i * 0.37) % 1) < 0.018 ? 0.05 : 1;
      iOpen[li] = e.it && e.it.silent ? 0 : (e.kind === "great" ? 0.78 + 0.2 * gw : (0.72 * blink + 0.28 * e.w * 1.2)) ;
    }
  });
  eyes.instanceMatrix.needsUpdate = true; wakeAttr.needsUpdate = true; lids.instanceMatrix.needsUpdate = true; openAttr.needsUpdate = true;
  window.__shards.rotation.y = time * 0.01;
  backLight.position.copy(camP).normalize().multiplyScalar(-4.5);
  backLight.material.color.setRGB(2.2 + gw * 2, 3.0 + gw * 3, 2.7 + gw * 2.5);
  // render: scene to HDR target, rays from the great eye, composite to screen
  sunV.set(0, 0, 0).project(camera);
  raysMat.uniforms.uSun.value.set(sunV.x * 0.5 + 0.5, sunV.y * 0.5 + 0.5); raysMat.uniforms.uGod.value = gw; compMat.uniforms.uGod.value = gw;
  renderer.setRenderTarget(rtScene); renderer.render(scene, camera);
  renderer.setRenderTarget(rtRays); renderer.render(raysQuad, quadCam);
  renderer.setRenderTarget(null); renderer.render(compQuad, quadCam);
  requestAnimationFrame(tick);
}
window.__three = { renderer, scene, render: () => { renderer.setRenderTarget(rtScene); renderer.render(scene, camera); renderer.setRenderTarget(null); } };
requestAnimationFrame(tick);
