# Whisper Back — Day 1 Technical Spike Report
Date: 2026-10-20 · Timebox: 4 h (used ≈ 1 h 20 m wall-clock incl. confirmations) · Network: Zcash **testnet, post-NU7**

## 1. Executive verdict: **GO** (upgraded from CONDITIONAL GO after the phone test, 2026-10-20 11:30 Z)

- ✅ A real shielded contribution carrying a reply destination, read by a holder of the choir's *public* viewing key, and a real shielded reply sent **directly** to the contributor's diversified address, received and matched to the right contribution. Three testnet transactions, all Ironwood pool, all decoded from wallet databases, no application server in the private path.
- ✅ The public viewing-key holder (wallet V) **cannot see the reply** (0 matches), only the contribution.
- ✅ **Phone interop resolved** (§4b): a real mobile wallet on testnet sent to a Revision-2 `zutest1…` address (T1) **and** chose the shielded receiver of a Revision-0 `utest1…` address (T2). Both landed in Ironwood at the intended diversified addresses with memos intact. The Valar faucet's rejection of R2 addresses is that service's limitation, not the wallets'.
- ⚠️ **One protocol adjustment** (§4b, T3): the mobile wallet treats a ZIP-321 memo as text and re-encodes every byte ≥ 0x80 as UTF-8 (`0xFF` → `C3 BF`). Binary memos from phones arrive mangled (fully reversible here, but wallet-dependent). Fix implemented and unit-tested: an all-ASCII envelope `GC1:` + base64url for phone contributions (381 binary bytes per memo instead of 500); the renderer accepts raw binary, the ASCII envelope, and the mangled form.
- Wallet used: **Zingo!** (testnet mode). Zingo displays a raw binary memo as Latin-1 text, so the secret and the reply address inside a binary contribution are human-readable on the sender's phone (screenshot 2026-10-20 18:35). Consequence: replies TO phone users should be a human-readable ASCII line (proposed `GC1R:<contrib_id>:<text>`), not base64. Note: wallet DBs store txids in internal byte order; display order (Zingo, explorers) is byte-reversed — the txids in §4b are in display order. Remaining unverified: Zashi/Zodl behaviour (expected similar, not tested), and whether Zingo displays an incoming envelope reply memo sensibly (replies to phone users should use the ASCII envelope too).

## 2. Repository and SDK findings (Step 1)

| Item | Finding | Source |
|---|---|---|
| Network | Zcash testnet, NU7 active since block 4,465,026; consensus branch `77190ad9`; ~35 s blocks measured | `SPIKE_LOG.md` S1 |
| Node access | lightwalletd `testnet.zec.rocks:443` (ECC LightWalletD v0.5.4) via gRPC; in this sandbox through a local SOCKS→HTTP CONNECT bridge (`tools/socks2connect.mjs`); not needed on a normal machine | `SPIKE_LOG.md` S3 |
| Wallet implementation | `zcash-devtool` base commit `5a26ee8` + Aegis Gate NU7 patch; librustzcash pinned to git rev `9c5705f` (`zcash_client_backend`, `zcash_client_sqlite`, `zcash_keys`, `zcash_address`, `zip321`, `orchard 0.16`) | `vendor/devtool-aegis/Cargo.toml` lines 43–61 |
| Stock devtool on NU7 testnet | **Cannot broadcast** (`incorrect consensus branch id`). Patched build required for testnet; mainnet (NU6.3) can use stock | `SPIKE_LOG.md` S2b/S2c |
| Tx construction / broadcast | `wallet send` (single payment) and `wallet pay --payment-uri` (ZIP-321, multiple outputs, memo as base64url raw bytes). Uses `zcash_client_backend` proposal → build → `SendTransaction` gRPC | `src/commands/wallet/{send,pay}.rs` |
| Detection / decryption | Compact-block scanning with the account's IVK (trial decryption), so **any** diversified address of the account is detected whether or not it was pre-generated; memos require `wallet enhance` (full tx fetch via `GetTransaction`) | `zcash_client_backend/src/scanning.rs` (`scan_block`, `find_received`); observed S4, S12 |
| Memo encoding | 512 bytes; ZIP-302 first byte `0xFF` = arbitrary data, confirmed decoded as `Memo::Arbitrary` by the wallet in this spike. Raw bytes readable from `ironwood_received_notes.memo` (SQLite). Wallet trims trailing zero padding | ZIP-302 §; `wallets/test/*/data.sqlite` |
| Diversified addresses | `wallet generate-address` → `WalletWrite::get_next_available_address(account, UnifiedAddressRequest::AllAvailableKeys)`; returns the lowest unused diversifier index and records it in `addresses` (gap-limit logic because the request includes a p2pkh receiver). Two consecutive calls returned indices 1 then 4 (distinct) | `src/commands/wallet/gen_addr.rs`; `zcash_client_sqlite/src/wallet.rs` `get_next_available_address` (≈ line 1170) |
| Address encoding | Pinned SDK prints **ZIP-316 Revision 2** UAs: HRP `zu`/`zutest` = shielded-only (183 chars), `tu`/`tutest` = transparent-including (218 chars). Revision 0 `u…`/`utest…` still stored for older rows (217 chars, includes transparent) | `components/zcash_protocol/src/constants/mainnet.rs` `HRP_UNIFIED_ADDRESS_R2`, `HRP_UNIFIED_ADDRESS_R2_TI` |
| Receiving at the reply destination | Verified: payment to the R2 `zutest1jc5w…` address landed in account A, attributed to diversifier index 1; `inspect` shows the `zu` and `tu` forms share identical Orchard-protocol and Sapling receivers | test log below |
| Viewing keys needed | Listener/reader: choir's **UFVK** (needed because conductor-authenticity detection relies on seeing the choir wallet's own spends, S13). Replies are sent with the listener's own spend key to the contributor's address; no key from the choir is involved | S5, S13 |
| What the wallet retains | Contributor wallet `sent_notes` stores `to_address` **and the full memo** (264 B incl. the secret) plus `transactions.raw` (9,166 B). Recipient wallets store received memos. Nothing is pruned | `data.sqlite` tables `sent_notes`, `transactions` |
| Testnet/infra limits | Faucet 0.125 TAZ/day/address, rejects R2 addresses; note lock ~40 blocks after a rejected broadcast; untrusted inbound funds spendable after 10 confirmations (~6 min), own change after 3 | S3, S4, this spike |

## 3. Protocol (Step 2) — implemented in `spikes/wb_protocol.py`

Header (12 B): `FF 'G' ver=1 | contrib_id u32 (random, client-side) | kind (1=contribution chunk, 2=reply) | seq | total (≤3) | len u16`.

- **Contribution** (to the choir address; public via the choir UFVK): `[codec][data…]` then on the last chunk `[reply_len:1][reply_addr ASCII][crc32 of codec+data]`. `reply_len = 0` ⇒ no reply wanted.
- **Reply** (to the reply address; private to the contributor): `[codec][data…][crc32]`, single memo. The header's `contrib_id` says which secret it answers. Nothing else.
- Validation: magic/version/kind, `seq < total ≤ 3`, `len ≤ 500`, duplicate/missing chunks rejected, CRC32 checked, unknown codec rejected, reply > 500 B rejected. Unit tests in the module (`python3 spikes/wb_protocol.py`) cover zero-padded and trimmed memos, out-of-order chunks, duplicates, missing chunks, bit-flip, oversize. Unit tests are not on-chain proof; the on-chain proof is §4.
- CRC detects corruption only. Authorship of the conductor is proven separately by spend detection (S13); contributors are intentionally unauthenticated.
- Capacity with an R2 shielded-only reply address (183 B): 311 B of secret in one memo, ~1.3 KB across three.

**Public vs private data**

| Data | Who can read |
|---|---|
| Contribution memo (secret + reply address + contrib_id) | Anyone with the choir UFVK (by design, published) |
| Contribution amount | Same; fixed at 0.00001 TAZ so it carries no information |
| Reply memo + amount | Only the contributor's wallet (diversified address of their own account) |
| Sender of the contribution | Nobody except the contributor's own device |
| Sender of the reply | Nobody except the listener's own device |

## 4. Test log (Step 3) — all real testnet transactions

Setup: SOCKS bridge up; wallet L created (`wallet init`), funded from A because the faucet rejected L's R2 address.

| # | Step | Command (abridged) | Result | Evidence |
|---|---|---|---|---|
| 0 | A generates reply destination A2 | `devtool-aegis wallet -w wallets/test/A generate-address` | `zutest1jc5w7qfe3la6ua…` (R2 shielded-only, 183 chars; Orchard-protocol + Sapling receivers; diversifier index 1) | `logs/wb_genaddr_A.txt`; `inspect` |
| 1 | Fund listener L from A | `wallet send … --value 1000000 --memo "WB-SPIKE fund listener"` | txid `6cfbec3b9af906aca8f73d63b6983ea2f4dff4530dda4fd31ade3dd530330b40`, mined 4,521,729 (10:00:54 Z) | `logs/wb_tx1_fundL.txt` |
| 2 | A contributes secret + A2 to choir B | `./spikes/wb_harness.sh contribute "i still have the voicemail…"` → `wallet pay --payment-uri zcash:<B>?amount=0.00001&memo=<b64url 264 B>` | txid `a71ccb5dea838c143bbe3ab831262d719e70d83601a890f9c621c73e9070a299`, pool Ironwood, `contrib_id 2339178536`; sent 10:02:27 Z | `logs/wb_tx2_contrib.txt` |
| 3 | V (choir UFVK only) reads it | `./spikes/wb_harness.sh read-as-V` (sync + enhance + SQLite) | Seen **124 s** after send. Decoded: codec text, secret text, `reply_addr = zutest1jc5w…`, `contrib_id` match. V never learns who sent it | `logs/wb_V_memos.txt`, `logs/wb_harness.log` |
| 4 | L replies directly to A2 | `./spikes/wb_harness.sh reply "you are not alone. i kept one too."` → `wallet pay` to `zutest1jc5w…`, memo kind=2 | Proposal `[0] -> zutest1jc5w7qfe3la6… Pool: Ironwood`; txid `680a334a81ab5c2f472b5c0cf4ce9926f5903a69146699394bbe29194c35735f`, mined 4,521,741 (10:05:20 Z) | `logs/wb_tx3_reply.txt` |
| 5 | A receives & decodes | `./spikes/wb_harness.sh check-A` | Seen **79 s** after send; `Memo::Arbitrary(47:01:…)`; decoded `{'contrib_id': 2339178536, 'data': b'you are not alone. i kept one too.'}`; `matches contrib_id: True`; received at diversifier index 1 (= A2) | `logs/wb_A_reply_memo.txt` |
| 6 | V must NOT see the reply | `wallet -w V list-tx | grep -c 680a334a` | `0` | `logs/wb_harness.log` |
| 7 | Address advancement | second `generate-address` | different index (4) | DB `addresses` |
| 8 | `0xFF` memo marker | implicit in steps 3 & 5 | decoded as `Memo::Arbitrary` | — |

Fees observed: 10,000 zat per 1-payment tx (ZIP-317). Explorer: https://testnet.zcashexplorer.app/transactions/{txid}

**What each party observed**

| Party | Observed | Did not observe |
|---|---|---|
| V (public UFVK) | contribution memo, amount, reply address | contributor identity, the reply |
| L (listener) | what V showed it | who A is |
| A (contributor) | reply memo + amount at A2 | who L is |
| B (choir wallet operator) | same as V | contributor identity |
| lightwalletd | IPs of all four wallets; which txids were fetched by `enhance` | memo contents, addresses |
| Public explorer | three shielded transactions | everything else |

### 4b. Phone interop test (2026-10-20, **Zingo!** mobile wallet in testnet mode; version not recorded)

QR codes in `ai/phone-test/`. All three sends reported "sent" by the wallet at ≈ 11:29 Z.

| Test | QR target | Result | Evidence |
|---|---|---|---|
| T1 | R2 shielded-only `zutest1u0rakwrvh…` (A, diversifier index 5), amount 0.00001, text memo | ✅ accepted & sent; landed **Ironwood**, index 5, memo intact | tx `be4be03c35cd88c8e65b0b5739c0cde5135f329cc42d65fc1193f9a1511ee7e7`, mined 4,521,933 |
| T2 | R0 `utest1aqknkrdt…` (A, index 10; contains a transparent receiver) | ✅ accepted; wallet selected the **shielded** receiver (Ironwood, index 10); 0 transparent outputs received | tx `0701ea6f8a1779dd6fe8d4085f82605787b1bfb8520df4a44519b73da8ca4302`, mined 4,521,937 |
| T3 (=G1) | Choir address, **binary** contribution memo (0xFF header, 238 B) with embedded reply address | ⚠️ sent; arrived as 244 B with all bytes ≥0x80 UTF-8-encoded (`ff`→`c3bf`). `decode('utf-8').encode('latin-1')` recovered all 238 bytes; `contrib_id 3510208332` matched, secret and reply address intact | tx `501ac80d65ac63076e5541a2c631d2c9fb0d3e419234a067fa4910a2c96a7290`, mined 4,521,945; read by V (public FVK) |
| T4 | Mainnet `zu1…` parse-only | skipped (not required: T1 already proves R2 parsing on testnet; mainnet parsing is a separate question for the mainnet demo decision) | — |

Conclusions: R2 addresses are usable as reply destinations for this wallet; R0 addresses are safe too (shielded receiver preferred, as ZIP-316 requires). Phone-originated memos must be ASCII → protocol gains the `GC1:` envelope (`spikes/wb_protocol.py`: `encode_contribution_ascii`, `normalize_memo`). Replies **to** phone users must use the same envelope so the wallet shows readable text.

## 5. Threat model and residual risks (Step 4)

Protocol-level (Zcash), application-level (our code), device-level (the user's phone/laptop) are separated.

| Failure case | Level | Tested / reasoned | Status & mitigation |
|---|---|---|---|
| Reply destination correlated with a public identity | Protocol | Reasoned: diversified addresses are unlinkable without the account's keys; the diversifier index is derived (gap-limit) and not recoverable by outsiders | Residual: if the user ever reuses A2 publicly (e.g. posts it), the link is theirs. Generate one address per contribution (verified: indices advance) |
| Contribution content identifies the author | Application/human | Not testable; inherent | Must be stated in UI: content and voice are not anonymised by the protocol. Text→TTS as default mode |
| Wallet retains sent-note history | Device | **Tested**: `sent_notes` keeps the plaintext memo (264 B), `to_address`, and raw tx | Kiosk: ephemeral wallet wiped after use. Own-phone users: their wallet remembers; say so. No protocol fix |
| Device seized | Device | Follows from above | Same as above; seed phrase also reveals everything |
| App logs link a contribution to a reply | Application | Our harness logs only txids and decoded payloads in `logs/` (spike only) | Production renderer must log txid + validation outcome only; never store reply addresses after rendering |
| Reply sent to the wrong contribution | Application | **Tested** indirectly: `contrib_id` in the reply matched; a mismatch would be flagged by `decode_reply` + comparison | Address itself is per-contribution, so a wrong `contrib_id` at the right address is detectable; a reply to the wrong address simply reaches a different contributor who sees a `contrib_id` they don't own → ignored |
| Duplicate / malformed / oversized memos | Application | **Unit-tested** (duplicates, missing chunks, CRC, >3 memos, bad len) | Rejected before rendering; on-chain data stays but is skipped |
| Receiving wallet cannot scan/decrypt the reply destination | Protocol/SDK | **Tested**: A decrypted at a never-before-used diversified address | Residual: a listener wallet that cannot *parse* R2 `zu…` addresses cannot send (see §1) |
| User shares a viewing key | Protocol | Reasoned | Choir UFVK is public by design and irrevocable. A contributor sharing *their own* viewing key exposes all their replies and the fact they contributed (sent memos are decryptable with the full viewing key via the sender's outgoing viewing key). Warn in README |
| Kiosk wallet not actually erased | Device/ops | Not tested | Operational checklist: fresh seed per session, `rm` wallet dir, verify no backup; still only as good as the operator |
| Reply spam/abuse to A2 | Application | Reasoned | Anyone with the public UFVK can send memos to A2. Brakes: 10,000 zat fee per reply; A2 is per-contribution so the inbox can be muted; UI labels replies as "from a stranger". Not solvable at protocol level |
| Timing correlation | Network | Reasoned | On this testnet (~13 shielded tx / 35 min) a contribution followed minutes later by a reply is weak evidence that *some* reply happened, not who. Random send delay in production |
| lightwalletd learns which txids a wallet fetched | Network | Observed (enhance = `GetTransaction`) | devtool has built-in Tor mode; Zashi uses Tor-less lightwalletd by default. State as residual |
| Full viewing key of the choir exposes choir spends | Protocol | Known (S13 design) | Choir funds are only ever self-sent (conductor) or spent openly; never used for anything private |

**Claims we may make:** "the operator cannot learn who contributed; replies travel directly between two wallets and never through us; the public can verify the whole work from one key."
**Claims we may not make:** "anonymous", "untraceable", "nobody can ever connect you to your secret" (your own device can, and so can your words).

## 6. Estimated additional implementation hours

| Work | Hours |
|---|---|
| Renderer: parse `reply_addr`, show "whisper back" button → ZIP-321 URI/QR for the listener's wallet | 2 |
| Contributor side (kiosk): `generate-address` per contribution, embed in memo, show a "your ghost key" export so the contributor can read replies on their own device (unverified whether Zashi/Zodl import a viewing key; fallback: kiosk shows replies only while session is open) | 3–5 |
| Reply inbox view (devtool-based for demo) | 2 |
| Interop test on phones (R2 address parse, memo-via-QR = G1) | 1 + phone |
| Tests ported from `wb_protocol.py` into the product protocol package | 1 |
| **Total** | **9–11 h** of the ~100 h budget |

## 7. Changes needed to the product's privacy claims (`docs/ghost-choir-refined.md`)

1. Add the three-party statement from §5 ("may / may not") verbatim to §7 of the concept doc.
2. State explicitly that the contributor's **own wallet stores the secret** (`sent_notes`), so phone users are protected from the operator, not from whoever holds their phone or seed.
3. Replace "diversified address = anonymous mailbox" with "diversified address = unlinkable to your other addresses by anyone who doesn't hold your keys; anyone with the public choir key can write to it".
4. Note that the choir's full viewing key makes the choir's *own* spends public (already in v3), and now also that it exposes every reply address ever embedded (public by design; they are one-shot).

## 8. Fallback plan if Whisper Back is cut

Nothing in the core demo depends on it. The contribution format already allows `reply_len = 0`; the renderer ignores the reply block. Ghost Choir + public-viewing-key reconstruction + conductor authenticity remain exactly as specified in `docs/ghost-choir-refined.md` §8–9. If the R2-address interop test fails on phones, keep Whisper Back **in the demo** between laptop wallets and label it "replies supported by wallets that understand Revision-2 addresses", or switch the embedded address to the Revision-0 `u…` form (217 B; listener wallets must select a shielded receiver per ZIP-316, which is standard behaviour).

## 9. Go / no-go decision rule applied

- Real shielded contribution ✅ · direct shielded reply ✅ · privacy model written and honest ✅ · protocol assumptions verified against the pinned SDK ✅
- Listener-wallet parsing of Revision-2 addresses: **verified on a real phone wallet** (T1). Binary memo mangling: **solved by the ASCII envelope** (T3). → **GO.** Wallet: Zingo! testnet. Still to check: how Zingo displays an incoming `GC1:` reply memo.

---
Files: `spikes/wb_protocol.py` (protocol + unit tests), `spikes/wb_harness.sh` (on-chain harness), `logs/wb_*.{txt,json,log}` (raw evidence). No production code was modified.
