// The visitor's own offerings that the chain does not carry yet, kept in this browser only (localStorage), so the god
// can show "your" dim eye until a snapshot carries it. Each entry is { cid: contrib_id, t: created ms } and nothing
// else: never the secret's text, never an address. Entries expire after 3 days. Every storage access may throw
// (private mode, blocked storage): then nothing is kept and the page works without it. Pure: storage is passed in.
(function (root) {
  "use strict";
  const KEY = "pending-offerings", TTL = 3 * 24 * 3600 * 1000, MAX = 4;
  const valid = (e) => e && Number.isInteger(e.cid) && e.cid >= 0 && e.cid <= 0xffffffff && Number.isFinite(e.t);
  function read(store) {
    try { const v = JSON.parse(store.getItem(KEY) || "[]"); return Array.isArray(v) ? v.filter(valid) : []; } catch (e) { return []; }
  }
  function write(store, list) {
    try { if (list.length) store.setItem(KEY, JSON.stringify(list)); else store.removeItem(KEY); return true; } catch (e) { return false; }
  }
  // current entries, oldest first, expired ones dropped (and forgotten)
  function load(store, now) {
    const all = read(store), live = all.filter((e) => now - e.t < TTL && e.t <= now + 60000);
    if (live.length !== all.length) write(store, live);
    return live.map((e) => ({ cid: e.cid, t: e.t }));
  }
  function add(store, cid, now) {
    const list = load(store, now).filter((e) => e.cid !== cid);
    list.push({ cid, t: now });
    write(store, list.slice(-MAX));
    return load(store, now);
  }
  function remove(store, cid, now) { write(store, load(store, now).filter((e) => e.cid !== cid)); return load(store, now); }
  // which pending entries a snapshot now carries: { opened: [{cid, tx}], still: [cid] }
  function reconcile(list, timeline) {
    const byCid = new Map(timeline.map((x) => [x.contrib_id, x.tx]));
    return { opened: list.filter((e) => byCid.has(e.cid)).map((e) => ({ cid: e.cid, tx: byCid.get(e.cid) })),
             still: list.filter((e) => !byCid.has(e.cid)).map((e) => e.cid) };
  }
  const api = { load, add, remove, reconcile, KEY, TTL };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Pending = api;
})(typeof window !== "undefined" ? window : globalThis);
