// S8 — THORChain native ZEC (pool live since 2 Oct 2026, transparent side only per reports).
// Read-only: pool status + a swap quote. Proves asset notation, depth, and the
// inbound address type (t-addr = the public "entrance" a privacy tool has to manage).
// Run: node spikes/s8_thorchain.mjs
const NODE = process.env.THORNODE || "https://thornode.ninerealms.com";
const get = async (p) => { const t = Date.now(); const r = await fetch(NODE + p); const j = await r.json().catch(() => ({})); return { ms: Date.now() - t, status: r.status, j }; };

const pools = await get("/thorchain/pools");
const z = Array.isArray(pools.j) ? pools.j.filter((p) => /ZEC/.test(p.asset)) : pools.j;
console.log(`pools HTTP ${pools.status} ${pools.ms}ms ->`, JSON.stringify(z, null, 2).slice(0, 1500));

const inb = await get("/thorchain/inbound_addresses");
console.log("ZEC inbound:", JSON.stringify(Array.isArray(inb.j) ? inb.j.filter((a) => /ZEC/i.test(a.chain)) : inb.j, null, 2));

for (const [from, to, amt] of [["ZEC.ZEC", "BTC.BTC", 1e8], ["BTC.BTC", "ZEC.ZEC", 1e6]]) {
  const q = await get(`/thorchain/quote/swap?from_asset=${from}&to_asset=${to}&amount=${amt}`);
  console.log(`\nquote ${from}->${to} HTTP ${q.status} ${q.ms}ms`, JSON.stringify(q.j, null, 2).slice(0, 1500));
}
