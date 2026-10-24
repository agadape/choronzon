// Adaptive resolution for the god (web/god.js), two-way with hysteresis. Pure: it is fed frame times and answers
// with the device-pixel ratio to render at. No DOM, no randomness; resolution only, nothing about the form.
//
//   start   at the cap (the device's own ratio, capped: 2 desktop, 1.5 phone), or at ?dpr=N, which pins it
//   settle  frames right after mount (2.5 s), a resize or tab switch (1 s) or a DPR change (0.6 s) are ignored:
//           shader compiles, texture uploads and render-target reallocations are not "the GPU is too slow"
//   down    median of the last ~1 s over 22 ms              -> -0.1, never below the floor (0.75 desktop, 0.85 phone)
//   up      median of the last ~2 s under 18 ms and its      -> +0.1, never above the cap
//           90th percentile under 22 ms (a 60 Hz display never goes below 16.7 ms, so "fast" means "holding vsync")
//   memory  after a slowdown nothing climbs for 3 s, and the level that was slow is not retried for 15 s; when a
//           retry is slow again within 5 s of climbing, that wait doubles (up to 4 min). Steps are one 0.1 grid
//           both ways, so a retry always lands on the level that failed, never next to it.
(function (root) {
  "use strict";
  function create({ cap, floor, forced = 0 }) {
    const pinned = forced > 0;
    let dpr = pinned ? forced : cap;
    const frames = [];
    let settleUntil = -Infinity, ceil = Infinity, ceilUntil = -Infinity, backoff = 15000, lastUp = -Infinity, holdUntil = -Infinity;
    const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
    const round = (v) => Math.round(v * 100) / 100;
    function settle(now, ms) { settleUntil = now + ms; frames.length = 0; }
    function change(now, v) { dpr = round(v); settle(now, 600); return dpr; }
    // returns the new DPR when it changes, else null
    function frame(now, dt) {
      if (pinned || now < settleUntil || !(dt > 0)) return null;
      frames.push([now, dt]);
      while (frames.length && now - frames[0][0] > 2000) frames.shift();
      const span = now - frames[0][0];
      const recent = frames.filter((f) => now - f[0] <= 1000).map((f) => f[1]);
      if (span >= 900 && recent.length >= 5 && pct(recent, 0.5) > 22 && dpr > floor + 0.001) {
        backoff = now - lastUp < 5000 ? Math.min(backoff * 2, 240000) : 15000;   // a failed retry waits longer
        ceil = dpr; ceilUntil = now + backoff; holdUntil = now + 3000;
        return change(now, Math.max(floor, dpr - 0.1));
      }
      const all = frames.map((f) => f[1]);
      if (span >= 1900 && pct(all, 0.5) < 18 && pct(all, 0.9) < 22 && dpr < cap - 0.001 && now >= holdUntil) {
        const next = Math.min(cap, dpr + 0.1);
        if (next >= ceil - 0.001 && now < ceilUntil) return null;
        lastUp = now;
        return change(now, next);
      }
      return null;
    }
    return { frame, settle, get dpr() { return dpr; }, pinned, cap, floor };
  }
  // the device's numbers: cap and floor by kind of screen, ?dpr=N pins
  function limits(devicePixelRatio, phone, query) {
    // phones measured at 58 fps on the phone path: they are not GPU-bound, so the floor stays high (below it: mosaic)
    const cap = Math.min(devicePixelRatio || 1, phone ? 1.5 : 2), floor = Math.min(cap, phone ? 0.85 : 0.75);
    const v = Number(query);
    return { cap, floor, forced: v > 0 ? Math.min(3, Math.max(0.25, v)) : 0 };
  }
  const api = { create, limits };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.DprAdapter = api;
})(typeof window !== "undefined" ? window : globalThis);
