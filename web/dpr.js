// Resolution for the god (web/god.js): an HD target first, then adaptation both ways with hysteresis. Pure: it is
// fed frame times and answers with the device-pixel ratio to render at. No DOM, no randomness; resolution only.
//
//   hd      the drawing buffer's short side aims for 720 px on desktop and 540 px on phones (26 Oct, lighter):
//           hd = 720 (540) / the canvas's CSS short side, never above the cap
//   range   cap = the screen's own devicePixelRatio, at most 1.5 desktop / 1.25 phone (no supersampling) and never
//           beyond what the GPU can allocate (its max render size); start at the cap. ?dpr=N pins it.
//   settle  frames right after mount (2.5 s), a resize or tab switch (1 s) or a DPR change (0.6 s) are ignored:
//           shader compiles, texture uploads and render-target reallocations are not "the GPU is too slow"
//   down    -0.1 only when the median frame over the last 2 s is over 28 ms, never below the hd floor ...
//   slow    ... unless it already sits on the hd floor and the median over 5 s says under 30 fps (over 33.3 ms):
//           then it may go below hd, down to 0.75 desktop / 0.6 phone ("below hd: slow GPU")
//   up      +0.1 when the median over ~2 s is under 18 ms and its 90th percentile under 22 ms (a 60 Hz screen never
//           goes below 16.7 ms, so "fast" means "holding vsync"); climbing back to hd ends the slow mode
//   memory  after a slowdown nothing climbs for 3 s, and the level that was slow is not retried for 15 s; when a
//           retry is slow again within 5 s of climbing, that wait doubles (up to 4 min). One 0.1 grid both ways.
(function (root) {
  "use strict";
  function create({ cap, floor, hd = 0, forced = 0 }) {
    const pinned = forced > 0;
    let dpr = pinned ? forced : cap, slow = false;
    const frames = [];
    let settleUntil = -Infinity, ceil = Infinity, ceilUntil = -Infinity, backoff = 15000, lastUp = -Infinity, holdUntil = -Infinity;
    const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
    const round = (v) => Math.round(v * 100) / 100;
    const lowest = () => (slow ? floor : Math.max(floor, hd));
    function settle(now, ms) { settleUntil = now + ms; frames.length = 0; }
    function change(now, v) { dpr = round(v); if (dpr >= hd - 0.001) slow = false; settle(now, 600); return dpr; }
    // returns the new DPR when it changes, else null
    function frame(now, dt) {
      if (pinned || now < settleUntil || !(dt > 0)) return null;
      frames.push([now, dt]);
      while (frames.length && now - frames[0][0] > 5000) frames.shift();
      const span = now - frames[0][0];
      const last = (ms) => frames.filter((f) => now - f[0] <= ms).map((f) => f[1]);
      const two = last(2000);
      const spanTwo = now - frames.find((f) => now - f[0] <= 2000)[0];
      if (!slow && hd > floor && dpr <= hd + 0.001 && span >= 4900 && pct(frames.map((f) => f[1]), 0.5) > 1000 / 30) {
        slow = true;                                                            // under 30 fps for 5 s on the hd floor
      }
      if (spanTwo >= 1900 && two.length >= 5 && pct(two, 0.5) > 28 && dpr > lowest() + 0.001) {
        backoff = now - lastUp < 5000 ? Math.min(backoff * 2, 240000) : 15000; // a failed retry waits longer
        ceil = dpr; ceilUntil = now + backoff; holdUntil = now + 3000;
        const keepSlow = slow;
        const v = change(now, Math.max(lowest(), dpr - 0.1));
        slow = keepSlow && v < hd - 0.001;
        return v;
      }
      if (spanTwo >= 1900 && pct(two, 0.5) < 18 && pct(two, 0.9) < 22 && dpr < cap - 0.001 && now >= holdUntil) {
        const next = Math.min(cap, dpr + 0.1);
        if (next >= ceil - 0.001 && now < ceilUntil) return null;
        lastUp = now;
        return change(now, next);
      }
      return null;
    }
    // the canvas changed size (or the screen did): new hd and cap; returns the new DPR when it has to move
    function relimit(now, lim) {
      cap = lim.cap; hd = lim.hd; floor = lim.floor;
      if (pinned) return null;
      const v = Math.min(cap, Math.max(lowest(), dpr));
      if (Math.abs(v - dpr) < 0.001) return null;
      return change(now, v);
    }
    function mode() {
      if (pinned) return "pinned";
      if (slow && dpr < hd - 0.001) return "below hd: slow GPU";
      if (hd > floor && dpr <= hd + 0.001) return "hd floor";
      return "adaptive";
    }
    return { frame, settle, relimit, mode, get dpr() { return dpr; }, get hd() { return hd; }, get cap() { return cap; }, pinned, floor };
  }
  // the device's numbers. cssW/cssH: the canvas's CSS size; maxSize: the GPU's largest render target side.
  // Without a CSS size there is no hd floor (old behaviour).
  function limits(devicePixelRatio, phone, query, cssW, cssH, maxSize) {
    const ratio = devicePixelRatio || 1;
    const shortSide = Math.min(cssW || 0, cssH || 0), longSide = Math.max(cssW || 0, cssH || 0);
    const gpu = maxSize && longSide ? maxSize / longSide : Infinity;
    const cap = Math.min(ratio, phone ? 1.25 : 1.5, gpu), floor = phone ? 0.6 : 0.75;
    const hd = shortSide ? Math.min(cap, (phone ? 540 : 720) / shortSide) : 0;
    const v = Number(query);
    return { cap, floor: Math.min(floor, cap), hd: Math.min(hd, cap), forced: v > 0 ? Math.min(3, Math.max(0.25, v)) : 0 };
  }
  const api = { create, limits };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.DprAdapter = api;
})(typeof window !== "undefined" ? window : globalThis);
