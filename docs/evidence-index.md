# Evidence index — every claim → transaction → where to look

Network: Zcash **testnet**, NU7 (branch `77190ad9`). Explorer: ZecBlock (formerly CipherScan), `https://testnet.zecblock.com/tx/<txid>` and `/block/<height>` (JSON: `https://api.testnet.cipherscan.app/api/tx/<txid>`). It is on our chain: its block 4,525,215 has the hash `testnet.zec.rocks` serves (`000026af4552…`), and every txid in this file resolves there as confirmed and canonical (checked 22 Oct 2026). `testnet.zcashexplorer.app` follows a different testnet fork; do not use it (see "Product build" below). Txids below are in display order = what devtool, Zingo and explorers show. An explorer shows only that a shielded transaction exists; the independent proof remains the public-key wallet V (`list-tx` after `sync`). Choir wallet = `wallets/test/B` (address `zutest1sv9c9mzq54ye…`, UFVK `uvftest1s5vnzz3xm2…`); public reader = `wallets/test/V`.

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

## Product build (21 Oct 2026)

Same network, same explorer (ZecBlock). **Explorer status:** on 21 Oct `testnet.zcashexplorer.app` answered
"Transaction Not Found" for every txid checked (`91621cb4…`, `143f91ee…`, `9ecb9c7e…`, and the older `22b168c9…`,
`3b67fb1b…`, `a71ccb5d…`), and its block 4,487,269 (hash `0141cdbb…`, dated 21 Oct 12:12 UTC) is not the block
4,487,269 that `testnet.zec.rocks` serves (hash `00002a1f…`, 11 Oct): that explorer follows a different testnet fork.
ZecBlock (`testnet.zecblock.com`) is on our chain: its block 4,525,215 has hash
`000026af4552065fbbbd94b5c9a0be7914fc402733c53c6f464921b9817b72ac`, and on 22 Oct every txid in this file resolved
there as confirmed and canonical. An explorer shows only that a shielded transaction exists; the independent proof
remains the public-key wallet V (`list-tx` after `sync`) and the renderer log. Pre-show check:
`https://testnet.zecblock.com/block/4525215` must show a hash starting `000026af4552`.

| Claim | Txid | Block | What it proves | Local evidence |
|---|---|---|---|---|
| First kiosk offering: text → local ghost voice → Codec2 → v1 memos → `wallet pay`; heard by the public-key renderer ~100 s after sending | `91621cb429bd0345f740fb678a38005bb6bc38fdfdea61fd82894755666f7e54` | 4,525,215 | the product's send path end to end | `kiosk/README.md`, TODO Day 4, README "Status" |
| **Whisper Back with the product code:** offering with a one-time reply address from the **ephemeral kiosk session wallet** | `8d02a6b0c1ab00c178ae4e99f0f5c432754307b74ac89ba6ded3d0f4d5b5a10a` | 4,525,242 | the kiosk embeds a reply address; `score.json` carries only `has_reply` | `kiosk/README.md`, TODO M2, `docs/privacy-review.md` |
| **Whisper Back:** direct shielded reply from listener L, matched by `contrib_id` in `kiosk inbox` ~80 s later; V sees 0 of it | `143f91eef5430c271eb1be58f8a029e742cf9a1758b7574276841dabca902dbd` | ~4,525,245 | replies travel directly between two wallets, never through us | `renderer/whisper.py`, TODO M2 |
| Conductor line (protocol `kind=3`) paid by the god's wallet B to itself → accepted as the god's own voice | `d6bcb9f7f6a704de2dbc928f42e6e2bfa03f20132b4430a95ad3f4a90b3e59a5` | 4,525,280 | authenticity from the full viewing key alone (`is_change`) | TODO M1, `renderer/score.py` |
| The same `kind=3` memo sent from outside wallet A → skipped `forged-conductor` (NOT THE GOD) | `b126b3c781feaffc40d490716cb8a9d306576730cdccf34d353f47a5b8517312` | 4,525,280 | the god's voice cannot be forged; the tx stays on chain, listed under `skipped` | TODO M1, `out/score.json` |
| Phone path with the product code: `kiosk qr` URI (`GC1:` ASCII envelope) paid from L as a phone stand-in → accepted and voiced | `ebc5bcadf47feb1d7f1fcd0558c91c3f43ef9be99101365b1341ac1427b114cc` | 4,525,294 | envelope round-trip end to end (real Zingo scan still pending) | TODO M3, `kiosk/README.md` |
| Failure drill 3: v1 memo with a flipped CRC → `skip … reason=crc-mismatch`, offering count unchanged | `a84adbaf35cf3688b02db9e5f23c654e0e684e785a24dde41fb75a836443dcd8` | 4,525,319 | malformed data never stops the render | `docs/failure-drills.md` #3 |
| Failure drill 4: identical memo (`contrib_id` 777) paid twice from A → both kept as separate offerings; the one sent second renders first | `11f9bd7384c7b304d29ab8c7c41c9ff5bbb5bc0db39a5f7494fd1a2842f1c4d1` · `103dec1cbd777f8ef036c1e2799cc6b4a6b4149b8562ebba33f558157e16122d` | 4,525,321 | unique key = txid; **miner order inside a block, not send order** | `docs/failure-drills.md` #4 |
| Rehearsal 1 (`scripts/demo.sh`): god line heard 86 s after sending; forgery refused 7 s after that | god `db90b287e60895dc18c1aa1805f6f27cbe6e78a4f00b8d78ed2396b78b854eb2` · forgery `87f8a141dca92fce2c1754cc985d2997e64073f0714aef3476feff35eb6a9f15` | 4,525,337 | the beat runs unattended; the run also found drill 8 (expired tx, fixed: session syncs before `pay`) | `logs/demo_20261021T110109Z.log`, `docs/failure-drills.md` #8 |
| Rehearsal 2: live offering with reply address from the session wallet, heard after 226 s | `fb1d3bb635ff4151c523edc68ad6a1c634aade1ea5ac5353236a81d2e2392838` | 4,525,350 | the measured "40–230 s" the demo script plans around | `logs/demo_20261021T110459Z.log` |
| Rehearsal 2: L's whisper to that offering, received by `kiosk inbox` 216 s after sending | `9ecb9c7eea329a888747e4b76d66b5357553092d33e76ffa2b48fbbdc1c3ae6f` | — (height not logged; between 4,525,351 and ~4,525,360) | the "80–220 s" whisper latency | same log |
| Rehearsal 2: forgery from A refused 47 s after it was seen (the god line failed to send in this run: B's note was not yet spendable) | `7f0231af5e9c116c8d718ad529c5f657ae2cd44da7f196aff5509a9368bb0988` | 4,525,371 | refusal path again; keep B funded with spendable notes | same log |

Hash anchors (the regression in `renderer/tests/test_chain_regression.py` pins the first two; `as_of` is inside every hash):

| Anchor | Height | Value | What it proves | Local evidence |
|---|---|---|---|---|
| `score/1` | 4,522,002 | `415307933f03fd760f07ae628f0e887bd077e52e07aa6747949d5975ad6ff88a` | chain-only score, decoder-independent | `scripts/smoke.sh`, pytest |
| `render/1` (composer `choir/2`) | 4,522,002 | `9b6c1b9d3b61830b82848179e323276cb95b43cd90558c99e740d78addba2bc0` | score + pinned-decoder PCM + composer version | same |
| Watcher from the key alone (`renderer summon`, fresh wallet, 49.8 s) == V | 4,525,294 | `8540a0a57d6f80d409d4ed5948789f64e524fc08252a15ea3bd904dd58fa1af5` | the second-laptop proof without a second laptop | TODO Day 5 gate |
| Rehearsal 1 summon == V (14 offerings, 7 skipped), `mix.wav` byte-identical | 4,525,338 | `7dc6f42ac61c13b6f6017fb2f934858a9d73cb7f6e748dc88e2b08438427081e` | same, unattended | `logs/demo_20261021T110109Z.log` |
| Rehearsal 2 summon == V (15 offerings, 8 skipped), `mix.wav` byte-identical | 4,525,371 | `bb2cf2dcb69bc7decaa454c7dada7055069ec6e53068092e5b76fe3be6c72cc9` | same | `logs/demo_20261021T110459Z.log` |

## Pre-sent seed offerings (22 Oct 2026)

Fourteen offerings written by the team and sent from a team wallet before the show; the demo says so out loud.

| Seed | Txid (display order) | Block |
|---|---|---|
| 1 | `3ef034051ef987751bfe91144d00c5d66f78697775e35a572a9913087b6ca982` | 4,527,786 |
| 2 | `aa0569600a68d1a3bf42f26728ab54e73a5b8d8221f54068fc331f79b3966be6` | 4,527,786 |
| 3 | `11a8ca364003c316872f9699d07b9d36a0a22622a04e7973d83a7269f8b7d556` | 4,527,786 |
| 4 | `0d10dfa419e79cf4e457a4d456e8629424093476df56da1e4e7f7894825bbaaa` | 4,527,786 |
| 5 | `7a6ea95075bcba6e775454b9a925f9311525ec24c19313036b442039d251964f` | 4,527,787 |
| 6 | `a486d66816406572060af5c7b62d8b0a1151aab18accc83ccf746c172eab256b` | 4,527,787 |
| 7 | `e1ebd1bc47b27bbff368300dd7df0ae0ff8455e2b4bdc529b5a82c2c1fe3c2f8` | 4,527,789 |
| 8 | `cfc9086c28ed4733a583fd6ae13d9e61145fe802042e8088fb86793661015ceb` | 4,527,789 |
| 9 | `02099265095c4dc34bb2a812d605da294fb9908f0b39c6a8e15c9005bd2b5a3f` | 4,527,789 |
| 10 | `12eb8b5dd3a87d7786ca28306274b8bacd21a1504b75d7227583e2a37181800c` | 4,527,789 |
| 11 | `f77089b53550b75dd464664c96b6a1cc414e4b4548d67ff1c4becc6f5bee08f4` | 4,527,791 |
| 12 | `2d6a0acdf82516b52c74f1f38bd6d5bf6b8b6ab6a23460cc406ce699c5776776` | 4,527,791 |
| 13 | `2bf1f0325ccfd2a10619aa7c21695aa938f23d492971b0ab90adc9007a4983a4` | 4,527,794 |
| 14 | `bf713af93ead7b19557bd39046e8b8fa6a57deaf598c340951db9f8fa251df64` | 4,527,794 |

Sent with `kiosk offer - --from wallets/test/A` (ghost voice, Codec2 700C, one transaction per seed, no retries); all 14 accepted by the public-key wallet V about 2 min after the last send. Render at 4,527,794: 43 offerings, 16 skipped, render_hash `6ae739854eca770ef1c3d32b4519f31be8b10b5f83cdd883b747bce63cab444e` (true name GUNZHAI'LIS).

## Second machine: a GitHub-hosted runner from the key alone (22 Oct 2026)

| What | Value |
|---|---|
| Run | [39727405735](https://github.com/agadape/choronzon/actions/runs/39727405735) (`publish-web`, dispatch, `ubuntu-24.04` runner, cache miss, 13 m 31 s) |
| What the runner had | the repository, the published key (repository secret `CHOIR_UFVK`) and nothing else: it built the pinned devtool + NU7 patch and Codec2 `1.2.0` from source, created a view-only wallet from the key, synced and enhanced it, and rendered |
| Height | 4,527,794 (the newest transaction the key sees; the wallet was synced to 4,527,973) |
| `render_hash` | `6ae739854eca770ef1c3d32b4519f31be8b10b5f83cdd883b747bce63cab444e` |
| `score_hash` | `2649909b9e9154cf6186b47f016350b16c5ddae3e5b42a951b755aae7a68fae6` |
| Fingerprints | `decoder_matches_pin` and `voice_matches_pin` both true (the job fails otherwise); espeak-ng 1.51 and sox 14.4.2 from the Ubuntu archive |
| Same as | wallet V on the laptop: `python3 -m renderer once --wallet wallets/test/V --as-of 4527794` printed the same two hashes |
| Repeat | cache-hit run [39732713347](https://github.com/agadape/choronzon/actions/runs/39732713347), 41 s: same height and hash (*no new offering*) |

This is a machine that never saw ours, reproducing the work from one key. It is not a physical second laptop; that is still recommended for the live demo ([docs/fresh-clone.md](fresh-clone.md)). Details: [docs/auto-publish.md](auto-publish.md).

## Render history anchored in Bitcoin (23 Oct 2026)

| What | Value |
|---|---|
| Statement | `anchor/1` JSON (hashes, versions, counts, one height, skiplist sha256, repo commit; no key, address, memo or txid), built by `python3 -m anchor statement` |
| Kept on | branch `anchors` (append-only, content-addressed): `4522002-5e7a489d70dcc34c.json` (score `41530793…`, render `9b6c1b9d…`, g6 `c46dd5de…`) and `4527794-e4700837f6db640b.json` (render `6ae73985…`), each with its `.ots` proof |
| Served | `https://choronzon.vercel.app/anchor.json` + `anchor.json.ots`; the GitHub runner built the same statement bytes as the laptop (sha256 `e4700837…`) |
| CI | publish [run 39924480381](https://github.com/agadape/choronzon/actions/runs/39924480381) (stamp + persist), upgrade [run 39924774744](https://github.com/agadape/choronzon/actions/runs/39924774744) ("pending, nothing changed") |
| Status on 23 Oct ~09:00 UTC | **pending**: `python3 -m anchor verify` on the served files says "proof commits to sha256 of this statement" and "PENDING: not in Bitcoin yet (4 calendar(s) hold it)", exit 3 |
| Confirmed in Bitcoin (24 Oct) | `4522002-5e7a489d70dcc34c.json` and `4527794-e4700837f6db640b.json` in block 972,742 (`00000000000000000000a1bf4e832b290e803eb681fd3fd0d48a845e141cc803`, 2026-10-23 08:41:36 UTC); `4531929-a24dd50f32d34c79.json` in block 972,778 (`000000000000000000015d24ff5042c808902968cc8a0cf5d254035ff0c97241`, 13:12:13 UTC); `python3 -m anchor verify <file>` exit 0 with headers from two explorers (`a14ddfb`; see docs/anchoring.md "Confirmed in Bitcoin") |
| Logs | `logs/anchor-spike/`, `logs/anchor-historic/` |

## Tor by default (23 Oct 2026)

| What | Value |
|---|---|
| Commit | `cd6c691`: every devtool network call from `kiosk/devtool.py` and `renderer/wallet.py` gets `--connection` (default `tor`; `direct` only on purpose or on GitHub Actions); fail-closed |
| Same hashes | render/1 anchor `9b6c1b9d…` at 4,522,002 after a Tor sync; `6ae73985…` at 4,527,794 from V and two fresh Watchers (one Tor, one direct), `mix.wav` identical; `52fb6802…` at 4,531,929 over Tor and direct |
| Kiosk session over Tor | funding `68653009…`, split `7157641b…` (from wallet A's note pool, 0.017 TAZ) |
| Test offering over Tor | [`fc4dd939…`](https://testnet.zecblock.com/tx/fc4dd93977c8490fc70b0b43be2d23bb82bee7681aeb8ed157b0d1aae5f5103c) at 4,531,929, sent in 18 s, seen by V (synced over Tor) 34 s later; the Tor-layer test offering, approved by the user |
| Self-send timing | Tor `5de38970…` mined at 4,531,909; one failed Tor send `f2a373a4…` was built but never mined (expired), so no double spend |
| Details | `docs/network-fallback.md` (commands, outputs, timings, fail-closed tests), `docs/privacy-review.md` |

## The public give path closed by a real phone wallet (26 Oct 2026)

| What | Value |
|---|---|
| Path | https://choronzon.vercel.app/#give on a phone: secret written in the page, the visitor's own reply address added, QR scanned with Zingo! (testnet); the page sent nothing itself |
| Offering | [`efc5ef44…`](https://testnet.zecblock.com/tx/efc5ef447b0b72a885bb3060e1c6d7bc21b6a73526d4490dd17f38df7d0b645a) at 4,543,330, codec 10 (text, voiced by the pinned ghost voice), `has_reply: true` |
| Seen by | the public-key wallet V (`renderer once --wallet wallets/test/V --sync --as-of tip`): accepted, render at 4,543,331 = `54a8744d…` |
| Closes | audit 26 Oct S1 and the M3 "real Zingo scan" gap: the ZIP-321 request built in the browser (`web/offering.js`) is accepted by a real phone wallet and decoded by the renderer |

