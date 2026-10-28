// S1 — lightwalletd reachability + chain facts (testnet & mainnet)
// Proves: endpoint works, real tip height, branch id, block interval (NU7 = ~25s on testnet?),
// and which shielded pools are actually used in the last N blocks (Ironwood vs Orchard vs Sapling).
// Run: node spikes/s1_lightd.mjs            (both networks)
//      node spikes/s1_lightd.mjs test       (testnet only)
import grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const def = protoLoader.loadSync(path.join(dir, "proto/service.proto"), {
  includeDirs: [path.join(dir, "proto")],
  longs: Number, enums: String, defaults: true,
});
const rpc = grpc.loadPackageDefinition(def).cash.z.wallet.sdk.rpc;

const SERVERS = {
  test: process.env.LWD_TESTNET || "testnet.zec.rocks:443",
  main: process.env.LWD_MAINNET || "zec.rocks:443",
};
const N = Number(process.env.SAMPLE_BLOCKS || 60);

const call = (c, m, req) => new Promise((res, rej) => c[m](req, (e, r) => (e ? rej(e) : res(r))));
const stream = (c, m, req) => new Promise((res, rej) => {
  const out = []; const s = c[m](req);
  s.on("data", (d) => out.push(d)); s.on("end", () => res(out)); s.on("error", rej);
});

async function probe(net) {
  const addr = SERVERS[net];
  const client = new rpc.CompactTxStreamer(addr, grpc.credentials.createSsl());
  const t0 = Date.now();
  const info = await call(client, "GetLightdInfo", {});
  const latencyMs = Date.now() - t0;
  const tip = Number(info.blockHeight);
  const blocks = await stream(client, "GetBlockRange", {
    start: { height: tip - N + 1 }, end: { height: tip },
  });
  const times = blocks.map((b) => b.time).filter(Boolean);
  const gaps = times.slice(1).map((t, i) => t - times[i]);
  const avg = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null;
  let txs = 0, ironwood = 0, orchard = 0, sapling = 0;
  for (const b of blocks) for (const tx of b.vtx) {
    txs++;
    if (tx.ironwoodActions?.length) ironwood++;
    if (tx.actions?.length) orchard++;
    if (tx.outputs?.length || tx.spends?.length) sapling++;
  }
  console.log(JSON.stringify({
    net, server: addr, latencyMs,
    chainName: info.chainName, vendor: info.vendor, version: info.version,
    blockHeight: tip, consensusBranchId: info.consensusBranchId,
    upgradeName: info.upgradeName, upgradeHeight: Number(info.upgradeHeight),
    lightwalletProtocolVersion: info.lightwalletProtocolVersion,
    sampledBlocks: blocks.length, avgBlockIntervalSec: avg && Number(avg.toFixed(1)),
    shieldedTxsInSample: { total: txs, withIronwood: ironwood, withOrchard: orchard, withSapling: sapling },
  }, null, 2));
  client.close();
}

process.on("uncaughtException", (e) => console.error("socket noise:", e.code || e.message));
const nets = process.argv[2] ? [process.argv[2]] : ["test", "main"];
for (const n of nets) {
  try { await probe(n); }
  catch (e) { console.log(JSON.stringify({ net: n, server: SERVERS[n], ERROR: e.message, code: e.code })); }
}
