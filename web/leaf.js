// The grimoire leaf: black-stained vellum that tilts with the pointer, turns (F) to its colophon, and whose
// perforated witness stub tears off (T / drag). Every edge is cut from the hashes and nothing else: the deckle from
// the score hash, the tear line from the render hash (32 bytes = 32 fibres, finer score-hash fibres between).
// A stub from any other evocation with the same render hash fits this edge exactly; a different one visibly does not.
// Built from design/explorations/folio.html. No Math.random(); the pointer only tilts.
"use strict";

window.Leaf = (() => {
  const bytes = (h) => Array.from({ length: 32 }, (_, i) => parseInt(h.slice(2 * i, 2 * i + 2), 16));
  let el = null, RB = null, SB = null, W = 0, H = 0, CUT = 0, deckle = null;
  let tx = 0, ty = 0, cx = 0, cy = 0, flip = 0, fl = 0, f = 0, gone = false, fall = null, dragging = null, hover = false;
  let onTorn = null;

  function init(ids, opts = {}) {
    el = { leaf: ids.leaf, top: ids.top, stub: ids.stub, verso: ids.verso };
    hover = matchMedia("(hover: hover)").matches;
    onTorn = opts.onTorn || null;
    addEventListener("pointermove", (e) => { if (!hover || dragging) return; tx = e.clientX / innerWidth - 0.5; ty = e.clientY / innerHeight - 0.5; });
    el.stub.addEventListener("pointerdown", (e) => { if (gone || fall) return; dragging = { y: e.clientY, f }; try { el.stub.setPointerCapture(e.pointerId); } catch (_) { /* no capture */ } });
    el.stub.addEventListener("pointermove", (e) => { if (dragging) f = Math.max(f, Math.min(1, dragging.f + (e.clientY - dragging.y) / 150)); });
    el.stub.addEventListener("pointerup", () => { dragging = null; });
    el.leaf.addEventListener("dblclick", () => turn());
    addEventListener("resize", layout);
  }

  // the cut and the deckle come from the two hashes; a new render re-cuts the leaf
  function setHashes(renderHash, scoreHash) {
    RB = bytes(renderHash); SB = bytes(scoreHash);
    layout();
  }

  function layout() {
    if (!el || !RB) return;
    const vw = document.documentElement.clientWidth || innerWidth, narrow = vw <= 900;   // the layout viewport, never the overflow
    W = narrow ? Math.min(vw - 32, 440) : 430;
    H = narrow ? Math.round(W * 1.62) : Math.round(Math.min(innerHeight * 0.82, 720));
    CUT = H - (narrow ? 104 : 116);
    el.leaf.style.setProperty("--W", W + "px"); el.leaf.style.setProperty("--H", H + "px"); el.leaf.style.setProperty("--cut", CUT + "px");
    const d = (i) => (SB[i % 32] / 255) * 2.4;
    const edge = (n, fn) => Array.from({ length: n + 1 }, (_, i) => fn(i / n, d(i * 7 + n)));
    deckle = { top: edge(24, (u, o) => [u * W, o]), right: (y0, y1) => edge(16, (u, o) => [W - o, y0 + (y1 - y0) * u]),
               bottom: edge(24, (u, o) => [W - u * W, H - o]), left: (y0, y1) => edge(16, (u, o) => [o, y0 + (y1 - y0) * u]) };
    const cut = [];
    for (let i = 0; i <= 64; i++) { const main = i % 2 === 0, b = main ? RB[(i / 2) % 32] : SB[((i - 1) / 2) % 32]; cut.push([(i / 64) * W, CUT + (b / 255 - 0.5) * 2 * (main ? 5 : 2.2)]); }
    const poly = (pts) => `polygon(${pts.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(",")})`;
    const topPts = [...deckle.top, ...deckle.right(0, cut[64][1]), ...[...cut].reverse(), ...deckle.left(cut[0][1], 0)];
    const stubPts = [...cut, ...deckle.right(cut[64][1], H), ...deckle.bottom, ...deckle.left(H, cut[0][1])];
    el.top.style.clipPath = poly(topPts); el.stub.style.clipPath = poly(stubPts);
    const mirror = (pts) => pts.map(([x, y]) => [W - x, y]);
    deckle.versoWhole = poly(mirror([...deckle.top, ...deckle.right(0, H), ...deckle.bottom, ...deckle.left(H, 0)]));
    deckle.versoTorn = poly(mirror(topPts));
    el.verso.style.clipPath = gone ? deckle.versoTorn : deckle.versoWhole;
    el.stub.style.transformOrigin = `${W}px ${cut[64][1]}px`;
    dispatchEvent(new Event("leaf-layout"));
  }

  function turn(snap) { flip = 1 - flip; if (snap === true) fl = flip; }
  function tear() { if (!gone && !fall) { const go = () => { f = Math.min(1, f + 0.035); if (f < 1) requestAnimationFrame(go); }; go(); } }
  function reprint() {
    gone = false; fall = null; f = 0; el.stub.style.display = ""; el.stub.style.opacity = 1; el.stub.style.transform = "";
    if (deckle) el.verso.style.clipPath = deckle.versoWhole;
    if (onTorn) onTorn(false);
  }

  function frame(now) {
    if (!el || !RB) return;
    cx += (tx - cx) * 0.06; cy += (ty - cy) * 0.06; fl += (flip - fl) * 0.09;
    el.leaf.style.transform = `rotateX(${(-cy * 8).toFixed(2)}deg) rotateY(${(cx * 10 + fl * 180).toFixed(2)}deg)`;
    document.documentElement.style.setProperty("--sx", (50 + cx * 90).toFixed(1));
    if (gone) return;
    if (f >= 1 && !fall) fall = { t0: now, dir: RB[5] & 1 ? 1 : -1 };
    if (fall) {
      const s = (now - fall.t0) / 1000;
      el.stub.style.transform = `translate(${fall.dir * 60 * s}px, ${40 * s + 900 * s * s}px) rotate(${-4 - fall.dir * (30 * s + 40 * s * s)}deg)`;
      el.stub.style.opacity = Math.max(0, 1 - s / 1.3);
      if (s > 1.3) { gone = true; el.stub.style.display = "none"; el.verso.style.clipPath = deckle.versoTorn; if (onTorn) onTorn(true); }
    } else el.stub.style.transform = `rotate(${(-f * 4.5).toFixed(2)}deg) translateY(${(f * 3).toFixed(2)}px)`;
  }

  return { init, setHashes, layout, frame, turn, tear, reprint, isGone: () => gone, isVerso: () => flip === 1, width: () => W };
})();
