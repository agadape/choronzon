# Spike Log — ZECATHON (zkSNARKs) — 2026-10-13 → 2026-10-15
Network: Zcash testnet (NU7, branch id `77190ad9`) + mainnet (Ironwood/NU6.3, branch id `37a5165b`). NU7 mainnet target 5 Nov = AFTER the 28 Oct deadline.
LWD testnet: testnet.zec.rocks:443 · LWD mainnet: zec.rocks:443 · Faucet: faucet.testnet.valargroup.dev (0.125 TAZ/day, has a JSON API, no captcha)
Explorer (testnet): https://testnet.zcashexplorer.app/transactions/{txid}
Test wallets (testnet, throwaway): A `utest1n0gf59qrl8t7…` · B `utest16v8qxwvpjpfr…` / `zutest1sv9c9mzq54ye…` (same account, new encoding)

Official track prompts (logged-in site, 13 Oct):
- Shielded Payments: POS, payroll, remittance, subscriptions. Money moves without publishing who paid whom
- Private Markets: dark-pool thesis. Price public, participants not
- Cross-Chain: swaps/bridges/intents reaching other chains **without unshielding on the way through**
- Core & Tooling: Zebra, librustzcash, indexers, wallet SDKs, provers
- Wildcard: art, games, social, hardware. Anything that makes a shielded tx worth making
Rules: 1 submission, 1 track; all code written in window; open source by 28 Oct; prize paid in ZEC to a shielded address.

Legend: ✅ proven with evidence · ⚠️ works with caveat · ❌ dead end · ⏳ not run yet

| # | Target | What was tried | Result | Evidence | Gotcha / docs mismatch | Time | Script |
|---|---|---|---|---|---|---|---|
| S1 | lightwalletd testnet + mainnet | GetLightdInfo + 60-block sample | ✅ | `logs/s1.txt` — testnet tip 4,503,062, avg block **34.7 s** (target 25 s), 13 shielded txs / 60 blocks, **13/13 Ironwood**. Mainnet tip 3,518,064, avg 77.1 s, 154 shielded txs: 141 Ironwood, 12 Sapling, 2 Orchard | Testnet is nearly empty → anonymity set tiny; demo privacy claims should cite mainnet numbers | 15m | spikes/s1_lightd.mjs |
| S2a | zcash-devtool `main` plain build | cargo build --release | ✅ | BUILD_A_OK, 10m04s (2 cores) | Builds fine; correct for **mainnet** (NU6.3) | 10m | spikes/s2_build_devtool.sh |
| S2b | devtool `main` + `RUSTFLAGS=--cfg zcash_unstable="nu7"` | build + real testnet send | ⚠️→❌ | Build OK (9m51s). Send: `(-25) transaction did not pass consensus validation: transaction uses an incorrect consensus branch id` | **Official tooling cannot transact on NU7 testnet** (devtool 5a26ee8, 28 Aug). Confirms Aegis Gate's claim independently | 25m | spikes/s2_build_devtool.sh |
| S2c | devtool 5a26ee8 + Aegis Gate patch (librustzcash `9c5705f`) | git apply + build | ✅ | BUILD_C_OK, 10m20s | Patch also changes encodings: default address now `zutest1…`, UFVK `uvftest1…`, UIVK `uvitest1…` (old regexes break). Needs `wallet upgrade` on DBs made by other builds | 15m | vendor/devtool-aegis |
| S3 | Wallets A/B + faucet | init via SOCKS, faucet API claim, sync | ✅ | faucet txid `5ec193ece926b24adb91153650b31d16122412f63365dd689da8f1b66682ac94` mined 4,503,066, landed in **Ironwood**; spendable after ~10 confs (~7 min) | devtool ignores HTTPS_PROXY (direct gRPC); in sandbox needed `tools/socks2connect.mjs` + `--connection socks5://…` | 20m | spikes/s3_wallets.sh |
| S4 | Shielded send A→B + memo | send 100,000 zat with text memo | ✅ | txid `22b168c9798729d184ee8375bae93bc53403d09ec37905655c8ada39be2a1ec9` mined **4,503,134**; Ironwood→Ironwood; fee 10,000 zat (ZIP-317); B sees memo `ZECATHON-SPIKE order#42 ikan` | (1) Memo is NOT in compact blocks: receiver must run `enhance` (fetch full tx) before memo shows. (2) A rejected broadcast **locks the note until expiry height (~40 blocks ≈ 20 min)** — demo killer if it happens live | 40m | spikes/s4_send_memo.sh |
| S5 | View-only verification (UFVK) | init-fvk from B's UFVK, sync, enhance | ✅ | wallet V `Purpose: view-only` shows 0.001 TAZ + same memo, no spend key | Same `enhance` requirement. UFVK encoding `uvftest1…` with patched build | 10m | spikes/s5_viewonly.sh |
| S6 | Same S3–S5 on **mainnet** | — | ⏳ | — | Needs ~0.02 real ZEC. Use `bin/devtool-main` (plain build is NU6.3-correct) | | (reuse, NET=main) |
| S7a | NEAR Intents `/v0/tokens` | GET | ✅ | 205 tokens; native ZEC `nep141:zec.omft.near` (8 dp, ~$1,148 on 15 Oct) + bridged ZEC on sol/starknet/aptos/near | No testnet. `0x…dEaD` rejected as recipient ("recipient is not valid") | 10m | spikes/s7_near_intents.mjs |
| S7b | `/v0/quote` dry ZEC↔USDC(Base) | dry quotes | ✅ | ZEC→USDC 0.1 ZEC → 114.63 USDC, **timeEstimate 457 s**; USDC→ZEC 20 USDC → 0.01705 ZEC, **150 s**; refundTo = mainnet UA accepted; recipient = mainnet UA accepted; unauth `appFees` 20 bps | | 10m | spikes/s7_near_intents.mjs |
| S7c | `/v0/quote` **non-dry** → deposit address type | 2 quotes, no funds sent | ✅ (key finding) | ZEC origin deposit address = **`t1Pq7Ja4…` (transparent, 35 chars)**; USDC origin = EVM `0x7093…` | **Entering Intents from ZEC = sending to a public t-address = unshielding on the way through.** Exactly what the Cross-Chain prompt forbids. Whether ZEC payout to a UA lands shielded is still unproven (needs a real swap) | 10m | spikes/s7b_deposit_addr.mjs |
| S7d | `confidentiality: "basic"` | dry quote | ⚠️ | HTTP 401 `User authentication is required for confidential intent quotes` | Needs a 1Click JWT (partner key). Get one before relying on it | 5m | spikes/s7_near_intents.mjs |
| S8 | THORChain ZEC pool + quote | thornode/midgard ninerealms, liquify | ❌ here / ⏳ local | proxy `connect_rejected` for all THORChain hosts even with all-domains on | Run `npm run s8` on your own PC (1 min) | 5m | spikes/s8_thorchain.mjs |
| S9 | ZIP-321 URI → Zashi/Zodl/Zingo | — | ⏳ | — | Needs a phone | | spikes/s9_wallet_uri.md |
| S10 | Browser shielded tx | — | ⏳ | — | Given S2b, any browser lib pinned to released crates will hit the same branch-id wall on testnet | | spikes/s10_browser_wallet.md |
| S12a | Codec2 voice compression | espeak-ng → 8 kHz → c2enc | ✅ | 10.16 s speech = **1,019 B (700C)** / 1,525 B (1200) / 1,778 B (1300) | 1 memo (512 B, 3 B header) ≈ 5.8 s @700C, 3.4 s @1200 | 10m | radio/ |
| S12b | Multi-output tx, each memo = binary audio chunk (`0xF5` arbitrary-data memo) | `wallet pay` with a 3-payment ZIP-321 URI | ✅ | txid `576ff3939156f5d29c8ed3754016a425eb16aa5d6989002b7ae5a166076775b0`, mined 4,518,093, **59 s broadcast→seen**, fee 20,000 zat (3 outputs + change), all Ironwood | `pay` asks interactive `y/n` (pipe `y`). devtool shows `Memo::Future(f5)` only; raw bytes read from `ironwood_received_notes.memo` in data.sqlite. Wallet trims trailing zero padding (last chunk 510 B) | 20m | radio/payment_uri.txt |
| S12c | Reassemble + decode on the receiver AND on a view-only wallet | sqlite memo → concat → c2dec | ✅ | Both B (spend key) and V (**viewing key only**) rebuild a file **byte-identical** to the original; decodes to a 10.12 s WAV | Listener needs `enhance` = GetTransaction per txid → lightwalletd learns which txids you fetched. Mitigate: devtool built-in Tor, or fetch full blocks | 15m | radio/from_chain.wav |
| S13 | Authenticated broadcast vs spoof, seen by a view-only listener | B (station) self-sends memo; A (outsider) sends memo to B's address; V (B's UFVK) inspects | ✅ | AUTH txid `08993bf234970b6b88bddbfb3c47164c2d32623ff5a8858008a8cc02b3d637a9` → V sees it as a **spend of station notes**, memo on a `(Change)` output, "received 0 notes". SPOOF txid `d869107b32dbf6f8b236173b45010375b20b8221eee6a380e5b51a1e0ed59dfa` → "received 1 notes", not change. Both mined 4,518,121 | Rule for listeners: trust only memos on outputs where `is_change = 1` (tx spent the station's own notes). Only the spend-key holder can produce that; the public viewing key cannot | 10m | — |
| S14 | TOPENG: local 3B LLM rewrite vs stylometry attacker | char 2–4gram TF-IDF + LinearSVC, 10 Gutenberg authors, 150-word chunks, proper nouns masked; qwen2.5:3b via Ollama, "neutral style" prompt, 30 messages | ❌ (as-is) | Attacker 96.7% → **76.7%** after rewrite (chance 10%). 5.8 tok/s on 2 CPU cores, ~28 s per message | Naive paraphrase keeps most stylistic signal (matches JamDec 2024 finding). Literature (RMIT 2026, LLaMA-3.2-3B) gets 60–73% F1 drop with a specialised method; not reproduced here. Also: the "68% at 90% precision" ETH/Anthropic 2026 result is a CONTENT attack, not stylometry | 40m | /home/claude/topeng-spike/stylo.py |

## Proven capabilities (✅)
- Read chain + pool stats from public lightwalletd on both networks (S1)
- Testnet TAZ on demand via faucet API, lands in Ironwood (S3)
- Ironwood→Ironwood shielded send with encrypted text memo on NU7 testnet, **only with the Aegis-patched devtool** (S2c, S4)
- View-only wallet from a UFVK sees amount + memo without spend authority (S5) → basis for merchant verification, receipts, auditor views
- NEAR Intents quotes both directions ZEC↔USDC, UA accepted as recipient/refund (S7b)

## Works with caveats (⚠️)
- Memos need full-tx fetch (`enhance`) → any "watch for payment + memo" service must call GetTransaction, not just scan compact blocks
- Failed broadcast locks funds ~20 min → demo needs spare notes / two funded wallets
- Confidential Intents need a JWT (S7d)
- Testnet block time is 34.7 s, not 25 s; plan ~6–7 min for a "spendable" confirmation in a live demo

## Dead ends (❌)
- Stock devtool (even with nu7 cfg) cannot broadcast on NU7 testnet (S2b). Anything built on released librustzcash crates must pin `9c5705f`-era code or demo on mainnet
- THORChain endpoints unreachable from this sandbox (S8)

## Corrections
- S12 used first memo byte `0xF5`. Per ZIP-302 that value is legacy/ambiguous; arbitrary binary memos must start with `0xFF`. Re-test with `0xFF` before building the Ghost Choir protocol.

## Surprises worth exploiting
- **Voice fits in shielded memos (S12).** ~5.8 s of speech per 512-byte memo, ~1 min broadcast-to-listen latency, readable by anyone holding only a viewing key, byte-identical

- **1Click's ZEC deposit address is transparent (S7c).** Cross-Chain prompt literally asks for "without unshielding on the way through". Measured, reproducible leak
- **The NU7 tooling gap is real and reproducible (S2b vs S2c).** Core & Tooling prompt asks for librustzcash / wallet SDK work, and no visible competitor is in that track
- New encodings (`zutest1`, `uvftest1`, `uvitest1`) silently broke our own regexes → any tool parsing addresses will break the same way
- Testnet Ironwood traffic ≈ 13 txs per 35 min; mainnet ≈ 141 Ironwood txs per 77 min. Real anonymity-set numbers for pitches

## Whisper Back spike (2026-10-20) — see ai/whisper-back-spike.md
| # | Target | Result | Evidence |
|---|---|---|---|
| WB1 | Fresh diversified UA via `generate-address` | ✅ | R2 `zutest1jc5w…` = diversifier index 1; second call → index 4 |
| WB2 | Contribution memo (0xFF, 264 B) with embedded reply address → choir | ✅ | tx `a71ccb5dea838c143bbe3ab831262d719e70d83601a890f9c621c73e9070a299`, seen by public-FVK wallet V in 124 s |
| WB3 | Direct shielded reply from listener L → A's diversified address | ✅ | tx `680a334a81ab5c2f472b5c0cf4ce9926f5903a69146699394bbe29194c35735f`, mined 4,521,741, A decoded + contrib_id matched in 79 s; V sees 0 |
| WB4 | 0xFF memo marker (ZIP-302) | ✅ | decoded as `Memo::Arbitrary` (replaces S12's 0xF5) |
| WB5 | External parsing of Revision-2 (`zu`/`tu`) addresses | ✅ | Faucet rejects, but Zingo! (testnet) sent to `zutest1…` (tx `be4be03c…`, Ironwood idx 5) and to R0 `utest1…` choosing the shielded receiver (tx `0701ea6f…`, Ironwood idx 10) |
| WB7 | G1: binary contribution memo via ZIP-321 QR from phone | ⚠️→✅ | tx `501ac80d…`: wallet UTF-8-encodes bytes ≥0x80 (`ff`→`c3bf`); reversible; protocol now has ASCII envelope `GC1:`+base64url (381 B/memo) |
| WB6 | Sender-side retention | ⚠️ | `sent_notes` keeps plaintext memo + to_address + raw tx |

## Day-1 gates for Ghost Choir (2026-10-20)
| # | Gate | Result | Evidence |
|---|---|---|---|
| G1 | Contribution from a phone via ZIP-321 QR | ✅ with ASCII envelope | Zingo! testnet: text memos intact (T1 `be4be03c…`, T2 `0701ea6f…`); binary memo UTF-8-mangled but recoverable (T3 `501ac80d…`); protocol now has `GC1:`+base64url envelope (381 B/memo) and accepts raw/envelope/mangled |
| G3 | Local TTS | ✅ (espeak-ng) | used for the G4 audio contribution; voice quality = "ghost" aesthetic; Piper is the upgrade path |
| G4 | Note pool: contributions back-to-back without waiting for confirmations | ✅ | split tx `fad34309…` (12×0.002 TAZ + change, fee 65,000 zat, own outputs trusted → spendable after 3 confs); then **5 contributions in 32 s** (~6 s each): `3b67fb1b…`, `88881b5f…`, `5cdb1c0b…` (Codec2 700C, 359 B), `2aa0f87d…`, `8194a322…`; all mined in block 4,522,002 |
| G6 | Determinism: two independently synced wallets → same render hash | ✅ | `spikes/g6_render.py`: V (view-only) and B (full) both → `c46dd5de8b74fecdb38e2b875c98c2f63d097f45f9bc1f667866a35594efe6b4` at height 4,522,002, 7 accepted / 4 skipped with reasons, audio decoded via pinned `c2dec` and hashed as PCM. Earlier text-only run also matched (`89477087…`) |
| G7 | `0xFF` memo marker (ZIP-302) | ✅ | all WB/G4 memos decoded as `Memo::Arbitrary` |
| G2 | Codec2 in the browser | ⏳ | not attempted; renderer decodes locally (fallback already in use) |
| G5 | Mainnet with stock devtool | ⏳ | not attempted |

Gotchas learned today:
- Canonical order inside one block is miner order (`tx_index`), not send order: the audio sent 3rd rendered 1st. Deterministic, but say so in the README.
- Wallet DBs store txids in internal byte order; explorers/Zingo show them reversed. Always print `txid[::-1]`.
- Outputs to your own account are flagged `is_change=1` and are trusted (3 confs). A split self-send is a cheap way to build the demo note pool.
- The SOCKS bridge must be restarted whenever the sandbox proxy port changes; a stale bridge makes `sync` silently stall.
