// EXPLORATION: the god in three.js, built to a budget (see docs/visual-direction.md, "Weight").
// Same scene as ophanim3d.html, restructured after measuring it (155 draw calls, 643k triangles, 100 materials):
//   every eye in ONE instanced mesh, every lid in one, all 29 arms merged into ONE mesh, rings share one material,
//   custom unlit-plus-fake-light shaders instead of PBR + environment maps, no bloom (glow is emissive + one sprite),
//   adaptive resolution, paused while the tab is hidden, the ink pass loaded only when asked for (I).
// Form = pure function of score.json; time only animates; playback wakes one eye; every eye looks at the camera.
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

// ---------------------------------------------------------------- renderer, camera, controls
const canvas = document.getElementById("abyss");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !PHONE, powerPreference: "high-performance", preserveDrawingBuffer: q.has("still") });
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
const DPR_CAP = Math.min(devicePixelRatio || 1, PHONE ? 1 : 1.25);
let dpr = DPR_CAP; renderer.setPixelRatio(dpr);
const scene = new THREE.Scene();
const FOG = new THREE.Color(0x060409), FOG_D = 0.03;
scene.background = new THREE.Color(0x040306); scene.fog = new THREE.FogExp2(FOG, FOG_D);
const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 300);
camera.position.set(0, 0.6, 18.5);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, -1.2, 0); controls.enableDamping = true; controls.dampingFactor = 0.06; controls.enablePan = false;
controls.minDistance = 7; controls.maxDistance = 22; controls.minPolarAngle = 0.45; controls.maxPolarAngle = 1.72;
controls.autoRotate = !q.has("still"); controls.autoRotateSpeed = 0.22;
scene.add(new THREE.HemisphereLight(0x8fa3b0, 0x140808, 0.5));            // only for the few Lambert props
const keyLight = new THREE.DirectionalLight(0xcfe2da, 1.4); keyLight.position.set(-4, 5, 6); scene.add(keyLight);

// shared light model for the custom shaders: key, cold rim, dull red from the Abyss below, fresnel, fog
const U = { uTime: { value: 0 }, uKey: { value: new THREE.Vector3(-4, 5, 6).normalize() }, uRim: { value: new THREE.Vector3(0.15, 0.4, -1).normalize() },
            uUnder: { value: new THREE.Vector3(0, -9, 3) }, uFog: { value: FOG }, uFogD: { value: FOG_D } };
const LIGHT = `
uniform vec3 uKey, uRim, uUnder, uFog; uniform float uFogD, uTime;
vec3 shade(vec3 alb, vec3 N, vec3 P, float rough, float sss){
  vec3 V = normalize(cameraPosition - P);
  float nk = dot(N, uKey), k = max(nk, 0.), wrap = max((nk + .4) / 1.4, 0.), r = max(dot(N, uRim), 0.);
  vec3 Lu = uUnder - P; float du = length(Lu); float u = max(dot(N, Lu / du), 0.) * 14. / (1. + du * du * .07);
  float spec = pow(max(dot(N, normalize(uKey + V)), 0.), mix(90., 10., rough)) * (1. - rough) * .9;
  float fres = pow(1. - max(dot(N, V), 0.), 2.5);
  return alb * (vec3(.045, .05, .065) + vec3(.82, .88, .86) * mix(k, wrap, sss) + vec3(.5, .85, .76) * r * .3 + vec3(.45, .07, .04) * u)
       + vec3(.9, .95, .92) * spec + vec3(.12, .012, .018) * fres * sss + vec3(.4, .75, .66) * fres * r * .2;
}
vec3 fogged(vec3 c, vec3 P){ float d = length(cameraPosition - P); return mix(c, uFog, 1. - exp(-d * d * uFogD * uFogD)); }`;
const NOISE = `
float hash3(vec3 p){ p = fract(p * .3183099 + .1); p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1., 0., 0.)), f.x), mix(hash3(i + vec3(0., 1., 0.)), hash3(i + vec3(1., 1., 0.)), f.x), f.y),
             mix(mix(hash3(i + vec3(0., 0., 1.)), hash3(i + vec3(1., 0., 1.)), f.x), mix(hash3(i + vec3(0., 1., 1.)), hash3(i + vec3(1., 1., 1.)), f.x), f.y), f.z); }
float fbm3(vec3 p){ float a = .5, s = 0.; for (int i = 0; i < 3; i++){ s += a * noise3(p); p = p * 2.03 + 3.1; a *= .5; } return s; }`;
const TAIL = `
#include <tonemapping_fragment>
#include <colorspace_fragment>
`;

// ---------------------------------------------------------------- data
const godTx = new Set(S.offerings.filter((o) => o.conductor).map((o) => o.tx));
const offers = [], gods = [];
S.timeline.forEach((p, n) => {
  const it = { start: p.start, end: p.start + p.samples, silent: p.silent, g: genes(p.contrib_id, n, 12),
    bright: clamp01((p.zero_crossings - 1500) / 1700), secs: clamp01((p.samples / 8000 - 2) / 6), pan: (p.pan - 8) / 8, layer: p.pitch_layer };
  (godTx.has(p.tx) ? gods : offers).push(it);
});
const forged = S.skipped.filter((s) => s.reason === "forged-conductor").map((s, i) => genes(parseInt(s.tx.slice(0, 8), 16) >>> 0, i, 6));
const wakeOf = (it, t) => (t < 0 ? 0 : clamp01((t - it.start) / 1200) * clamp01((it.end - t) / 2400));

// ---------------------------------------------------------------- the wheels (one material, one mesh per wheel)
function scriptTexture(seed) {
  const c = document.createElement("canvas"); c.width = 2048; c.height = 128; const x = c.getContext("2d");
  x.fillStyle = "#8a8a8a"; x.fillRect(0, 0, 2048, 128); x.strokeStyle = "#202020"; x.lineWidth = 3;
  for (const y of [5, 123]) { x.beginPath(); x.moveTo(0, y); x.lineTo(2048, y); x.stroke(); }
  x.lineWidth = 1.6; let i = 0;
  for (const [y0, hh] of [[12, 22], [94, 22]]) for (let px = 4; px < 2040; px += 11) {
    const g = genes(seed, i++, 6); x.beginPath();
    x.moveTo(px + g[0] * 7, y0 + g[1] * hh); x.lineTo(px + g[2] * 7, y0 + g[3] * hh); x.lineTo(px + g[4] * 7, y0 + g[5] * hh); x.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}
const ringMat = new THREE.ShaderMaterial({
  uniforms: { ...U, uScript: { value: scriptTexture(seed0) } }, side: THREE.DoubleSide,
  vertexShader: `varying vec3 vP, vN; varying vec2 vUv; void main(){ vec4 wp = modelMatrix * vec4(position, 1.); vP = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vUv = uv; gl_Position = projectionMatrix * viewMatrix * wp; }`,
  fragmentShader: LIGHT + `uniform sampler2D uScript; varying vec3 vP, vN; varying vec2 vUv;
  void main(){
    vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
    float ink = texture2D(uScript, vec2(vUv.x * 3., vUv.y)).r;
    vec3 V = normalize(cameraPosition - vP), R = reflect(-V, N);
    vec3 env = mix(vec3(.01, .006, .006), vec3(.30, .34, .32), pow(smoothstep(-.2, 1., R.y), 2.)) * vec3(.75, .32, .22);   // tarnished blood-bronze
    vec3 c = shade(vec3(.16, .05, .035) * (.4 + .6 * ink), N, vP, .3, 0.) + env * (.25 + .5 * ink);
    gl_FragColor = vec4(fogged(c, vP), 1.);` + TAIL + `}` });
const cap = (k) => 10 + 4 * k;
let K = 0; for (let left = offers.length; left > 0; K++) left -= cap(K);
K = Math.max(K, 3);
const rings = [];
for (let k = 0; k < K; k++) {
  const R = 2.2 + 0.82 * k, H = 0.58;
  const pivot = new THREE.Group(), spinner = new THREE.Group(); pivot.add(spinner); scene.add(pivot);
  const parts = [new THREE.CylinderGeometry(R, R, H, PHONE ? 96 : 160, 1, true)];
  for (const y of [-H / 2, H / 2]) { const tg = new THREE.TorusGeometry(R, 0.03, 6, PHONE ? 96 : 160); tg.rotateX(Math.PI / 2); tg.translate(0, y, 0); parts.push(tg); }
  spinner.add(new THREE.Mesh(mergeGeometries(parts), ringMat));
  pivot.rotation.set((hb(2 + k) - 0.5) * 2.4, hb(6 + k) * TAU, (hb(10 + k) - 0.5) * 2.4);
  rings.push({ pivot, spinner, R, base: pivot.rotation.clone(), wx: (k % 2 ? 1 : -1) * (0.045 + 0.03 * hb(14 + k)),
    wz: (k % 2 ? -1 : 1) * (0.035 + 0.02 * hb(18 + k)), spin: (k % 2 ? -1 : 1) * (0.07 + 0.04 * hb(22 + k)) });
}

// ---------------------------------------------------------------- every eye in the scene: ONE instanced mesh
const IRIS = [[0.42, 0.56, 0.66], [0.55, 0.6, 0.48], [0.62, 0.48, 0.26], [0.36, 0.42, 0.40]];
const eyeList = [];   // { kind: ring|dweller|great|blind, socket?, pos?, r, iris, stripes, slit, seed, blind, it? }
offers.forEach((it, n) => {
  let k = 0, j = n; while (j >= cap(k)) { j -= cap(k); k++; }
  const r = rings[k], th = (j / cap(k)) * TAU + k * 0.37, eR = 0.2 + 0.07 * it.secs;
  const nrm = new THREE.Vector3(Math.cos(th), 0, Math.sin(th));
  const socket = new THREE.Object3D();
  socket.position.copy(nrm.clone().multiplyScalar(r.R + eR * 0.38)).add(new THREE.Vector3(0, it.pan * 0.06, 0));
  socket.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), nrm); r.spinner.add(socket);
  eyeList.push({ kind: "ring", socket, r: eR, iris: IRIS[Math.floor(it.g[1] * 4)], stripes: 14 + 40 * it.bright, slit: it.layer >= 2 ? 1 : 0, seed: it.g[2] * 20, blind: 0, it });
});
eyeList.push({ kind: "great", pos: new THREE.Vector3(), r: 1.35, iris: [0.4, 0.58, 0.7], stripes: 70, slit: 0, seed: 3.3, blind: 0 });
forged.forEach((g) => eyeList.push({ kind: "blind", g, r: 0.09 + 0.04 * g[2], iris: [0.6, 0.1, 0.1], stripes: 1, slit: 0, seed: g[3] * 10, blind: 1 }));

// ---------------------------------------------------------------- the Dweller: mass + arms (arms merged into ONE mesh)
const fleshVS = (arms) => `attribute float aRad, aPhase, aLen; uniform float uTime;
varying vec3 vP, vN, vObj; varying vec2 vUv; varying float vLen;
void main(){
  vec3 p = position; float t = uv.x;
  ${arms ? `
  p += normal * aRad * (.13 * sin(t * 24. - uTime * 2.4 + aPhase) * (1. - t * .7) + .035 * sin(t * aLen * 7.));
  p += vec3(sin(t * 6. + uTime * .55 + aPhase), cos(t * 5. + uTime * .45 + aPhase * 1.3) * .7, sin(t * 4.5 - uTime * .4 + aPhase * .7)) * t * t * 1.1;
  p += vec3(sin(t * 14. - uTime * 1.3 + aPhase), cos(t * 13. - uTime * 1.1), 0.) * pow(t, 4.) * .35;` : `
  p *= 1. + .012 * sin(uTime * .7 + length(p) * .3);`}
  vec4 wp = modelMatrix * vec4(p, 1.); vP = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vObj = position * ${arms ? "1." : ".45"} + aPhase; vUv = uv; vLen = aLen;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const fleshFS = (arms) => LIGHT + NOISE + `varying vec3 vP, vN, vObj; varying vec2 vUv; varying float vLen;
void main(){
  vec3 N = normalize(vN);
  float n = fbm3(vObj * 2.2), spots = smoothstep(.56, .72, fbm3(vObj * 6. + 3.));
  vec3 c = mix(vec3(.025, .018, .028), vec3(.15, .055, .07), n * n);                    // bruise and old blood
  c = mix(c, vec3(.30, .19, .12), smoothstep(.62, .8, fbm3(vObj * 1.3 + 9.)) * .5);        // jaundiced patches
  ${arms ? `float vent = smoothstep(.62, .7, vUv.y) * smoothstep(.95, .87, vUv.y); c = mix(c, vec3(.34, .25, .22), vent);` : ""}
  c = mix(c, vec3(.015, .008, .012), spots * .75);
  float vein = pow(1. - abs(fbm3(vObj * 3.5 + 1.7) * 2. - 1.), 14.);
  c = mix(c, vec3(.32, .02, .03), vein * .5);
  c *= .78 + .44 * noise3(vObj * 22.);                                                     // pores
  float rough = mix(.82, .3, smoothstep(.55, .75, n + .1));                               // patches of slime
  ${arms ? `
  float vv = (vUv.y - .78) / .085, su = fract(vUv.x * vLen * 1.7) - .5, d = length(vec2(su * 2.4, vv));
  float on = step(abs(vv), 1.3) * step(vUv.x, .97);                                       // suckers: shading, not geometry
  c = mix(c, vec3(.62, .45, .40), smoothstep(.95, .7, d) * smoothstep(.45, .6, d) * on * .8);
  c = mix(c, vec3(.06, .015, .02), smoothstep(.45, .2, d) * on);` : ""}
  gl_FragColor = vec4(fogged(shade(c, N, vP, rough, 1.), vP), 1.);` + TAIL + `}`;
const fleshMat = (arms) => new THREE.ShaderMaterial({ uniforms: U, vertexShader: fleshVS(arms), fragmentShader: fleshFS(arms) });
const lidList = [];   // { socket, r } or { pos, dir, r }
{
  const waves = Array.from({ length: 8 }, (_, i) => { const g = genes(seed0 ^ 0x5eed, i, 4);
    const k = new THREE.Vector3(g[0] - 0.5, g[1] - 0.5, g[2] - 0.5).normalize().multiplyScalar(0.6 + i * 0.5); return { k, ph: g[3] * TAU, a: 0.5 / (1 + i * 0.6) }; });
  const field = (p) => waves.reduce((s, w) => s + Math.sin(p.dot(w.k) + w.ph) * w.a, 0);
  const C0 = new THREE.Vector3(0, -14.5, -6), RM = 9;
  const surf = (dir) => { const p = dir.clone().multiplyScalar(RM); return RM + field(p.clone().multiplyScalar(0.35)) * 1.4 + field(p.clone().multiplyScalar(1.3)) * 0.3; };
  const zeros = (n) => new THREE.BufferAttribute(new Float32Array(n), 1);
  const mg = mergeVertices(new THREE.IcosahedronGeometry(RM, PHONE ? 14 : 22)), pa = mg.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i); const d = v.clone().normalize(); v.copy(d.multiplyScalar(surf(d))); pa.setXYZ(i, v.x, v.y, v.z); }
  mg.computeVertexNormals(); for (const a of ["aRad", "aPhase", "aLen"]) mg.setAttribute(a, zeros(pa.count));
  const mass = new THREE.Mesh(mg, fleshMat(false)); mass.position.copy(C0); scene.add(mass);
  // blisters: one instanced mesh
  { const N = PHONE ? 80 : 160, bm = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshLambertMaterial({ color: 0x8a7650, emissive: 0x0d0303 }), N);
    const mtx = new THREE.Matrix4(), qq = new THREE.Quaternion(), sc = new THREE.Vector3();
    for (let i = 0; i < N; i++) { const g = genes(seed0, 3000 + i, 4); const el = 0.15 + 1.2 * g[1], a = g[0] * TAU;
      const d = new THREE.Vector3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)).normalize();
      const r = 0.05 + 0.24 * g[2] * g[2]; bm.setMatrixAt(i, mtx.compose(C0.clone().addScaledVector(d, surf(d) + r * 0.2), qq, sc.set(r, r * (0.7 + 0.3 * g[3]), r))); }
    scene.add(bm); }
  // the arms: one per block that carried offerings, merged
  const blocks = new Map(); for (const o of S.offerings) blocks.set(o.height, (blocks.get(o.height) || 0) + 1);
  const bl = [...blocks.entries()].sort((a, b) => a[0] - b[0]);
  const TS = PHONE ? 60 : 96, RS = PHONE ? 8 : 12, arms = [];
  bl.forEach(([height, count], i) => {
    const g = genes(height, i, 8);
    const prev = i ? bl[i - 1][0] : height, wait = Math.min(1, Math.log10(1 + height - prev) / 4);
    const a = Math.PI * (1.05 + 0.9 * ((i * 0.6180339887 + g[0] * 0.05) % 1)), el = 0.35 + 0.5 * g[1];
    const dir = new THREE.Vector3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el));
    const root = C0.clone().addScaledVector(dir, surf(dir) * 0.97);
    const reach = 0.55 + 0.45 * Math.min(1, (count - 1) / 4);
    const b = i * 2.39996 + g[2] * 0.4, rr = 4.6 + 2.6 * g[3] * reach + 1.2 * reach;
    const side = new THREE.Vector3(Math.cos(b), Math.sin(b) * 0.85, 0);
    const p1 = root.clone().addScaledVector(dir, 3.5).add(new THREE.Vector3(Math.cos(b) * 2, 3, -2));
    const p2 = side.clone().multiplyScalar(rr).add(new THREE.Vector3(0, -0.5, -2.5 + 2 * g[4]));
    const tang = new THREE.Vector3(-Math.sin(b), Math.cos(b) * 0.85, 0.35).multiplyScalar((1.4 + 2.4 * wait) * (g[5] < 0.5 ? 1 : -1));
    const p3 = p2.clone().add(tang), p4 = p3.clone().addScaledVector(side, -0.9 * reach).addScaledVector(tang, 0.35);
    const p5 = p4.clone().addScaledVector(tang, -0.45).addScaledVector(side, -0.25), p6 = p5.clone().addScaledVector(side, 0.3).addScaledVector(tang, -0.2);
    const curve = new THREE.CatmullRomCurve3([root, p1, p2, p3, p4, p5, p6]);
    const geo = new THREE.TubeGeometry(curve, TS, 1, RS, false);
    const r0 = 0.36 + 0.12 * count, gp = geo.attributes.position, c = new THREE.Vector3();
    const aRad = new Float32Array(gp.count), aPh = new Float32Array(gp.count).fill(g[5] * TAU), aLen = new Float32Array(gp.count).fill(curve.getLength() / (r0 * 2.2));
    for (let s2 = 0; s2 <= TS; s2++) { const t = s2 / TS; curve.getPointAt(t, c); const rad = r0 * Math.pow(1 - t, 0.62) * (1 + 0.1 * Math.sin(t * 17 + g[6] * 6)) + 0.02;
      for (let kk = 0; kk <= RS; kk++) { const idx = s2 * (RS + 1) + kk; v.fromBufferAttribute(gp, idx).sub(c).multiplyScalar(rad).add(c); gp.setXYZ(idx, v.x, v.y, v.z); aRad[idx] = rad; } }
    geo.computeVertexNormals();
    geo.setAttribute("aRad", new THREE.BufferAttribute(aRad, 1)); geo.setAttribute("aPhase", new THREE.BufferAttribute(aPh, 1)); geo.setAttribute("aLen", new THREE.BufferAttribute(aLen, 1));
    arms.push(geo);
    if (count >= 2) {   // a busy block opens an eye at the root of its arm, set in a lid of flesh
      const d2 = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.22), er = 0.55 + 0.15 * count;
      const pos = C0.clone().addScaledVector(d2, surf(d2) + er * 0.25);
      eyeList.push({ kind: "dweller", pos, r: er, iris: [0.62, 0.48, 0.18], stripes: 30, slit: g[7] < 0.5 ? 1 : 0, seed: g[6] * 30, blind: 0 });
      lidList.push({ pos, dir: d2, r: er });
    }
  });
  scene.add(new THREE.Mesh(mergeGeometries(arms), fleshMat(true)));
  // debris
  const shards = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0x24222a, flatShading: true }), 70);
  const mtx = new THREE.Matrix4(), qq = new THREE.Quaternion(), sc = new THREE.Vector3();
  for (let i = 0; i < 70; i++) { const g = genes(seed0, 2000 + i, 7);
    qq.setFromEuler(new THREE.Euler(g[3] * TAU, g[4] * TAU, g[5] * TAU)); sc.set(0.08 + g[6] * 0.25, 0.1 + g[6] * 0.4, 0.08 + g[6] * 0.2);
    shards.setMatrixAt(i, mtx.compose(new THREE.Vector3((g[0] - 0.5) * 30, (g[1] - 0.45) * 18, (g[2] - 0.6) * 24), qq, sc)); }
  scene.add(shards); window.__shards = shards;
}
for (const e of eyeList) if (e.kind === "ring") lidList.push({ socket: e.socket, r: e.r, silent: e.it.silent });

// one instanced eye mesh: per-instance iris colour, pattern, wake
const NE = eyeList.length;
const eyeGeo = new THREE.SphereGeometry(1, PHONE ? 20 : 28, PHONE ? 14 : 20);
const iIris = new Float32Array(NE * 3), iEye = new Float32Array(NE * 4), iWake = new Float32Array(NE);
eyeList.forEach((e, i) => { iIris.set(e.iris, i * 3); iEye.set([e.stripes, e.slit, e.seed, e.blind], i * 4); });
eyeGeo.setAttribute("aIris", new THREE.InstancedBufferAttribute(iIris, 3));
eyeGeo.setAttribute("aEye", new THREE.InstancedBufferAttribute(iEye, 4));
const wakeAttr = new THREE.InstancedBufferAttribute(iWake, 1); wakeAttr.setUsage(THREE.DynamicDrawUsage); eyeGeo.setAttribute("aWake", wakeAttr);
const eyeMat = new THREE.ShaderMaterial({ uniforms: U,
  vertexShader: `attribute vec3 aIris; attribute vec4 aEye; attribute float aWake;
  varying vec3 vObj, vN, vP, vIris; varying vec4 vEye; varying float vWake;
  void main(){ vObj = position; vIris = aIris; vEye = aEye; vWake = aWake;
    mat4 m = modelMatrix * instanceMatrix; vec4 wp = m * vec4(position, 1.); vP = wp.xyz; vN = normalize(mat3(m) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp; }`,
  fragmentShader: LIGHT + `varying vec3 vObj, vN, vP, vIris; varying vec4 vEye; varying float vWake;
  float h(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h(i), h(i + vec2(1., 0.)), f.x), mix(h(i + vec2(0., 1.)), h(i + vec2(1., 1.)), f.x), f.y); }
  float fbm(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 3; i++){ s += a * n2(p); p = p * 2.03 + 1.7; a *= .5; } return s; }
  void main(){
    vec3 o = normalize(vObj); float ang = acos(clamp(o.z, -1., 1.)), ph = atan(o.y, o.x), seed = vEye.z;
    float ir = .46, pr = mix(.16, .31, vWake);
    float vein = pow(1. - abs(fbm(vec2(ph * 2.5, ang * 5.) + seed) * 2. - 1.), 9.) * smoothstep(.55, 1.8, ang);
    vec3 col = mix(vec3(.84, .82, .75) * (1. - .3 * smoothstep(1., 2.5, ang)), vec3(.55, .05, .03), vein * .9);
    vec3 emit = vec3(0.);
    if (vEye.w < .5){
      float st = .5 + .5 * cos(ph * vEye.x + fbm(vec2(ph * 3., ang * 14.) + seed) * 5.);
      vec3 irc = mix(vIris * .22, vIris * 1.15, st) * mix(1., .3, smoothstep(ir * .7, ir, ang));
      float im = smoothstep(ir + .015, ir - .015, ang);
      col = mix(col, irc, im);
      emit = (vIris * 2.2 * st + vec3(.5, 1., .75) * .5) * vWake * im;                    // a voice: the iris burns
      float pm = vEye.y > .5 ? smoothstep(1., .82, length(o.xy / vec2(pr * .3, pr * 1.1))) * step(0., o.z) : smoothstep(pr + .012, pr - .012, ang);
      col = mix(col, vec3(.004), pm); emit *= 1. - pm;
    } else col = mix(col, vec3(.55, .07, .05), .72);
    vec3 N = normalize(vN);
    vec3 c = shade(col, N, vP, .08, .2) + emit;
    gl_FragColor = vec4(fogged(c, vP), 1.);` + TAIL + `}` });
const eyes = new THREE.InstancedMesh(eyeGeo, eyeMat, NE); eyes.instanceMatrix.setUsage(THREE.DynamicDrawUsage); eyes.frustumCulled = false; scene.add(eyes);
const lids = new THREE.InstancedMesh(new THREE.TorusGeometry(1.02, 0.34, PHONE ? 8 : 10, PHONE ? 20 : 28), new THREE.MeshLambertMaterial({ color: 0x4a2624 }), lidList.length);
lids.instanceMatrix.setUsage(THREE.DynamicDrawUsage); lids.frustumCulled = false; scene.add(lids);

// glow without bloom: one additive sprite behind the great eye
const haloC = document.createElement("canvas"); haloC.width = haloC.height = 128;
{ const x = haloC.getContext("2d"), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(200,255,225,0.28)"); g.addColorStop(0.35, "rgba(140,210,190,0.09)"); g.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = g; x.fillRect(0, 0, 128, 128); }
const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(haloC), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
halo.scale.setScalar(7.5); scene.add(halo);
{ const N = PHONE ? 600 : 1400, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { const g = genes(seed0, i, 3); const r = 4 + 18 * g[0], a = g[1] * TAU; pos.set([Math.cos(a) * r, (g[2] - 0.4) * 18, Math.sin(a) * r], i * 3); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xbcd6cc, size: 0.018, transparent: true, opacity: 0.4, depthWrite: false }))); }
{ // the Watcher on a floating rock: two meshes
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.3, 1), new THREE.MeshLambertMaterial({ color: 0x17161c, flatShading: true }));
  rock.scale.set(0.9, 0.5, 0.7); rock.position.set(6.2, -3.6, 3.2); scene.add(rock);
  const body = mergeGeometries([new THREE.CapsuleGeometry(0.03, 0.13, 4, 8), new THREE.SphereGeometry(0.03, 8, 6).translate(0, 0.12, 0)].map((g) => g.toNonIndexed()));
  const w = new THREE.Mesh(body, new THREE.MeshLambertMaterial({ color: 0x0b0b0e })); w.position.set(6.1, -2.98, 3.3); scene.add(w);
}

// ---------------------------------------------------------------- ink, loaded only when asked for
let composer = null, inkOn = q.has("ink");
async function ensureInk() {
  if (composer) return;
  const [{ EffectComposer }, { RenderPass }, { ShaderPass }, { OutputPass }] = await Promise.all([
    import("three/addons/postprocessing/EffectComposer.js"), import("three/addons/postprocessing/RenderPass.js"),
    import("three/addons/postprocessing/ShaderPass.js"), import("three/addons/postprocessing/OutputPass.js")]);
  composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera)); composer.addPass(new OutputPass());
  const ink = new ShaderPass({ uniforms: { tDiffuse: { value: null }, uRes: { value: new THREE.Vector2() } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uRes; varying vec2 vUv;
    float lum(vec2 uv){ return dot(texture2D(tDiffuse, uv).rgb, vec3(.3, .59, .11)); }
    void main(){ float l = lum(vUv); vec2 px = 1. / uRes, p = gl_FragCoord.xy;
      float g = length(vec2(lum(vUv + vec2(px.x, 0.)) - lum(vUv - vec2(px.x, 0.)), lum(vUv + vec2(0., px.y)) - lum(vUv - vec2(0., px.y))));
      float ink = 1., s = 4.5;
      if (l < .62 && mod(p.x + p.y, s) < 1.1) ink = 0.; if (l < .38 && mod(p.x - p.y, s) < 1.1) ink = 0.;
      if (l < .2 && mod(p.y, s * .75) < 1.1) ink = 0.; if (l < .06 || g > .09) ink = 0.; if (l > .85) ink = 1.;
      gl_FragColor = vec4(mix(vec3(.02), vec3(.92, .9, .85), ink), 1.); }` });
  composer.addPass(ink); composer.inkPass = ink; size();
}
addEventListener("keydown", async (e) => { if (e.key.toLowerCase() === "i") { inkOn = !inkOn; if (inkOn) await ensureInk(); } });
if (inkOn) ensureInk();

// ---------------------------------------------------------------- size, adaptive resolution, pause when hidden
function size() {
  const w = innerWidth, h = innerHeight, narrow = w <= 900;
  renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
  if (composer) { composer.setPixelRatio(dpr); composer.setSize(w, h); composer.inkPass.uniforms.uRes.value.set(w * dpr, h * dpr); }
  camera.aspect = w / h; camera.fov = narrow ? 52 : 36;
  if (narrow) camera.setViewOffset(w, h, 0, h * 0.12, w, h); else camera.setViewOffset(w, h, ((window.LEAF_W || 430) + 80) / 2, 0, w, h);
  camera.updateProjectionMatrix();
}
addEventListener("resize", size); addEventListener("leaf-layout", size); size();
let ema = 16, lastT = 0, running = true;
function adapt(dt) {   // keep the frame under ~20 ms by trading resolution, never detail
  ema = ema * 0.95 + dt * 0.05;
  const next = ema > 22 ? Math.max(0.6, dpr - 0.1) : ema < 13 ? Math.min(DPR_CAP, dpr + 0.05) : dpr;
  if (Math.abs(next - dpr) > 0.01) { dpr = next; size(); }
}
document.addEventListener("visibilitychange", () => { running = !document.hidden; if (running) { lastT = 0; requestAnimationFrame(tick); } });

// ---------------------------------------------------------------- frame
let px = 0, py = 0; addEventListener("pointermove", (e) => { px = (e.clientX / innerWidth) * 2 - 1; py = -(e.clientY / innerHeight) * 2 + 1; });
const T0 = performance.now(), dummy = new THREE.Object3D(), camP = new THREE.Vector3(), tmpV = new THREE.Vector3(), nW = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
const right = new THREE.Vector3(), up = new THREE.Vector3(), M = new THREE.Matrix4(), lidLocal = new THREE.Matrix4();
function tick(now) {
  if (!running) return;
  if (lastT && !q.has("still")) adapt(now - lastT); lastT = now;
  const time = q.has("time") ? Number(q.get("time")) : (now - T0) / 1000 + 30;
  const t = typeof window.PLAY_T === "number" ? window.PLAY_T : -1;
  controls.update(); U.uTime.value = time;
  for (const r of rings) { r.pivot.rotation.x = r.base.x + time * r.wx; r.pivot.rotation.z = r.base.z + time * r.wz; r.spinner.rotation.y = time * r.spin; }
  scene.updateMatrixWorld(); camP.copy(camera.position);
  right.setFromMatrixColumn(camera.matrixWorld, 0); up.setFromMatrixColumn(camera.matrixWorld, 1);
  let gw = 0; for (const g of gods) gw = Math.max(gw, wakeOf(g, t));
  eyeList.forEach((e, i) => {
    let w = 0, scale = e.r, look = camP;
    if (e.kind === "ring") {
      w = wakeOf(e.it, t); scale = e.it.silent ? 0 : e.r * (1 + 0.18 * w);
      e.socket.getWorldPosition(tmpV); e.socket.getWorldQuaternion(tmpQ); nW.set(0, 0, 1).applyQuaternion(tmpQ);
      const dir = camP.clone().sub(tmpV).normalize(), d = dir.dot(nW);       // turn toward you, as far as the socket lets it
      if (d < 0.3) dir.addScaledVector(nW, 0.3 - d).normalize();
      dummy.position.copy(tmpV); look = tmpV.clone().add(dir);
    } else if (e.kind === "great") { w = gw; dummy.position.set(0, 0, 0); look = camP.clone().addScaledVector(right, px * 6).addScaledVector(up, py * 4); }
    else if (e.kind === "dweller") dummy.position.copy(e.pos);
    else { const g = e.g, a = g[0] * TAU + time * (0.02 + 0.02 * g[1]), r = 6 + 2 * g[2];
      dummy.position.set(Math.cos(a) * r, (g[4] - 0.5) * 5, Math.sin(a) * r);
      if (((time * (0.15 + 0.1 * g[5]) + g[3]) % 1) >= 0.55) scale = 0; }
    dummy.scale.setScalar(scale); dummy.lookAt(look); dummy.updateMatrix(); eyes.setMatrixAt(i, dummy.matrix); iWake[i] = w;
  });
  eyes.instanceMatrix.needsUpdate = true; wakeAttr.needsUpdate = true;
  lidList.forEach((l, i) => {
    if (l.socket) { lidLocal.makeScale(l.r, l.r, l.r * (l.silent ? 1.6 : 0.7)); M.multiplyMatrices(l.socket.matrixWorld, lidLocal); }
    else { dummy.position.copy(l.pos); dummy.scale.set(l.r, l.r, l.r * 0.7); dummy.lookAt(l.pos.clone().add(l.dir)); dummy.updateMatrix(); M.copy(dummy.matrix); }
    lids.setMatrixAt(i, M);
  });
  lids.instanceMatrix.needsUpdate = true;
  halo.material.opacity = 0.6 + gw * 0.4;
  window.__shards.rotation.y = time * 0.01;
  if (inkOn && composer) composer.render(); else renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
window.__three = { renderer, scene, render: () => (inkOn && composer ? composer.render() : renderer.render(scene, camera)) };
requestAnimationFrame(tick);
