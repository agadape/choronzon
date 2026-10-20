# Evidence index — every claim → transaction → where to look

Network: Zcash **testnet**, NU7 (branch `77190ad9`). Explorer: `https://testnet.zcashexplorer.app/transactions/<txid>` (txids below are in display order = what devtool, Zingo and explorers show; the sandbox could not open the explorer (HTTP 403), so click one to confirm before the demo). Choir wallet = `wallets/test/B` (address `zutest1sv9c9mzq54ye…`, UFVK `uvftest1s5vnzz3xm2…`); public reader = `wallets/test/V`.

| Claim | Txid | Block | What it proves | Local evidence |
|---|---|---|---|---|
| Faucet → contributor wallet A (Ironwood) | `5ec193ece926b24adb91153650b31d16122412f63365dd689da8f1b66682ac94` | 4,503,066 | testnet funding works via API | `logs/s3_faucet.json` (excluded from zip), SPIKE_LOG S3 |
| Shielded send + text memo, Ironwood→Ironwood | `22b168c9798729d184ee8375bae93bc53403d09ec37905655c8ada39be2a1ec9` | 4,503,134 | core send; memo needs `enhance` | `logs/s4_send_test.log`, S4 |
| View-only wallet reads amount + memo | (same tx, read by V) | — | public-key rendering is possible | `logs/s5_viewonly_test.log`, S5 |
| 10 s of speech in 3 binary memos, rebuilt byte-identical from V | `576ff3939156f5d29c8ed3754016a425eb16aa5d6989002b7ae5a166076775b0` | 4,518,093 | audio-over-memos; 59 s latency | `radio/from_chain.wav`, `radio/payment_uri.txt`, S12 |
| Authentic conductor spend vs spoofed inbound (view-only can tell) | AUTH `08993bf234970b6b88bddbfb3c47164c2d32623ff5a8858008a8cc02b3d637a9` · SPOOF `d869107b32dbf6f8b236173b45010375b20b8221eee6a380e5b51a1e0ed59dfa` | 4,518,121 | "the god's voice cannot be forged" | SPIKE_LOG S13 |
| Fund listener L from A | `6cfbec3b9af906aca8f73d63b6983ea2f4dff4530dda4fd31ade3dd530330b40` | 4,521,729 | — | `logs/wb_tx1_fundL.txt` |
| **Whisper Back:** contribution + reply address (binary 0xFF memo) | `a71ccb5dea838c143bbe3ab831262d719e70d83601a890f9c621c73e9070a299` | ~4,521,736 | public reader extracts reply address, never the sender | `logs/wb_tx2_contrib.txt`, `logs/wb_V_memos.txt` |
| **Whisper Back:** direct shielded reply to A's diversified address; V sees 0 | `680a334a81ab5c2f472b5c0cf4ce9926f5903a69146699394bbe29194c35735f` | 4,521,741 | private two-way channel without operator | `logs/wb_tx3_reply.txt`, `logs/wb_A_reply_memo.txt`, `ai/whisper-back-spike.md` |
| Phone (Zingo testnet) → R2 `zutest1…` address, memo intact | `be4be03c35cd88c8e65b0b5739c0cde5135f329cc42d65fc1193f9a1511ee7e7` | 4,521,933 | R2 addresses usable as reply destinations | `ai/phone-test/`, spike report §4b |
| Phone → R0 `utest1…` address, wallet chose shielded receiver | `0701ea6f8a1779dd6fe8d4085f82605787b1bfb8520df4a44519b73da8ca4302` | 4,521,937 | R0 fallback safe | same |
| Phone → choir, binary memo UTF-8-mangled but recovered (G1) | `501ac80d65ac63076e5541a2c631d2c9fb0d3e419234a067fa4910a2c96a7290` | 4,521,945 | ASCII envelope needed for phones | `ai/phone-test/zingo_T3_memo_display.jpg` |
| Note pool: 12×0.002 self-split | `fad34309b4df7726737436a2035fea174f1d69d401d78bbd441a7c5d124749be` | 4,521,976 | own outputs trusted after 3 confs | `logs/g4_split.txt` |
| **G4:** 5 contributions in 32 s incl. Codec2 audio, all mined together | `3b67fb1b4142bde060a915beb7346da9ecb6465207467b66c981c5375a69e46c` · `88881b5ff4082d7b033b745d57cb385acc202e04dea52500d450abd79763ee16` · `5cdb1c0b72c2c3041c7452db1ec14bb3604e1c91407cd5f5149e762b91ba425d` (audio) · `2aa0f87d04a5d785eb62a5b121317a7ae8cdc594795c17fde2884bce177624ed` · `8194a322369d3a4ebcb7516629f90dc3ec27098a24ba4976777357bcdc56f290` | 4,522,002 | live demo can fire contributions without waiting | `logs/g4_rapid.txt` |
| **G6:** two independently synced wallets → identical render hash incl. audio | render hash `c46dd5de8b74fecdb38e2b875c98c2f63d097f45f9bc1f667866a35594efe6b4` @ 4,522,002 (7 accepted / 4 skipped) | — | "the blockchain is the score" | `spikes/g6_render.py`, `scripts/smoke.sh` reproduces it |

Negative results worth citing in the README's honesty section:
- Stock devtool / released crates **cannot broadcast on NU7 testnet** (`incorrect consensus branch id`), S2b.
- NEAR Intents ZEC deposit address is **transparent** (`t1Pq7Ja4…`), S7c — why we stayed inside the shielded pool.
- Local 3B-LLM style rewriting leaves 76.7% attribution accuracy (TOPENG, S14) — why we do **not** claim content anonymity.
- Phone wallets treat ZIP-321 memos as text (T3) — why the phone path uses the ASCII envelope.
