// S7 — NEAR Intents 1Click API, ZEC legs (MAINNET ONLY: there is no Intents testnet).
// Dry quotes only by default: no funds move. Proves: ZEC asset id, both directions,
// deposit flow shape, fees/latency, and whether `confidentiality` works with ZEC.
// Run: node spikes/s7_near_intents.mjs
// Optional .env: ONECLICK_JWT=...  ZEC_UA=u1...  (your own mainnet UA, for recipient/refund fields)
//                EVM_ADDR=0x...    (your own address on the counter-chain)
import fs from "node:fs";
try { for (const l of fs.readFileSync(".env", "utf8").split("\n")) { const m = l.match(/^(\w+)=(.*)$/); if (m) process.env[m[1]] ??= m[2]; } } catch {}

const BASE = "https://1click.chaindefuser.com/v0";
const H = { "Content-Type": "application/json", ...(process.env.ONECLICK_JWT ? { Authorization: `Bearer ${process.env.ONECLICK_JWT}` } : {}) };
const ZEC_UA = process.env.ZEC_UA || "REPLACE_WITH_YOUR_MAINNET_UA";
const EVM = process.env.EVM_ADDR || "0x000000000000000000000000000000000000dEaD";

const t0 = Date.now();
const tokens = await (await fetch(`${BASE}/tokens`)).json();
console.log(`tokens: ${tokens.length} in ${Date.now() - t0}ms`);
const zec = tokens.filter((t) => /zec/i.test(t.symbol) || t.blockchain === "zec");
console.log("ZEC-like assets:", JSON.stringify(zec, null, 2));
const usdc = tokens.find((t) => t.symbol === "USDC" && t.blockchain === "base")
  || tokens.find((t) => t.symbol === "USDC");
console.log("counter asset:", usdc?.assetId, usdc?.blockchain);
const ZEC = zec.find((t) => t.blockchain === "zec") || zec[0];
if (!ZEC || !usdc) { console.log("ABORT: ZEC or USDC not listed"); process.exit(1); }

async function quote(label, body) {
  const t = Date.now();
  const r = await fetch(`${BASE}/quote`, { method: "POST", headers: H, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  console.log(`\n== ${label} :: HTTP ${r.status} in ${Date.now() - t}ms ==`);
  console.log(JSON.stringify(j, null, 2).slice(0, 2500));
}
const deadline = () => new Date(Date.now() + 10 * 60 * 1000).toISOString();

await quote("ZEC -> USDC (dry, public)", {
  dry: true, swapType: "EXACT_INPUT", slippageTolerance: 100,
  originAsset: ZEC.assetId, depositType: "ORIGIN_CHAIN",
  destinationAsset: usdc.assetId, amount: String(10 ** (ZEC.decimals || 8) / 10), // 0.1 ZEC
  recipient: EVM, recipientType: "DESTINATION_CHAIN",
  refundTo: ZEC_UA, refundType: "ORIGIN_CHAIN", deadline: deadline(),
});
await quote("USDC -> ZEC to a shielded UA (dry)", {
  dry: true, swapType: "EXACT_INPUT", slippageTolerance: 100,
  originAsset: usdc.assetId, depositType: "ORIGIN_CHAIN",
  destinationAsset: ZEC.assetId, amount: String(20 * 10 ** usdc.decimals), // 20 USDC
  recipient: ZEC_UA, recipientType: "DESTINATION_CHAIN",
  refundTo: EVM, refundType: "ORIGIN_CHAIN", deadline: deadline(),
});
await quote("USDC -> ZEC with confidentiality=basic (dry, newer feature)", {
  dry: true, swapType: "EXACT_INPUT", slippageTolerance: 100, confidentiality: "basic",
  originAsset: usdc.assetId, depositType: "ORIGIN_CHAIN",
  destinationAsset: ZEC.assetId, amount: String(20 * 10 ** usdc.decimals),
  recipient: ZEC_UA, recipientType: "DESTINATION_CHAIN",
  refundTo: EVM, refundType: "ORIGIN_CHAIN", deadline: deadline(),
});
console.log("\nCheck: does the ZEC->USDC deposit address come back as t-addr or a UA/shielded? (privacy leak point)");
