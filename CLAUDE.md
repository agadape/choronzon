# CLAUDE.md — ZECATHON 2026 WILDCARD entry (name, tagline, one-liner: `config/brand.json`)

Handoff from the research/spike session (13–20 Oct 2026). Read this first, then **`TODO.md`** (day-by-day checklist, owners, gates), then `docs/ghost-choir-refined.md` (concept v3),
`ai/whisper-back-spike.md` (Whisper Back GO report), `SPIKE_LOG.md` (every on-chain proof), `docs/ghost-choir-critical-review.md`.

## 1. What we are building (decided)

- **Hackathon:** ZECATHON by zkSNARKs (thezecathon.com). Track: **WILDCARD** ($15K; grand prize $20K on top). Prompt: *"Art, games, social, hardware. Anything that makes a shielded transaction worth making."* Judging priority (from our notes): **Privacy (leak = DQ) > Usefulness > Execution > Originality.** Rules: all code written in the window, open source, **deadline 28 Oct 2026**, one submission, one track, prize paid in ZEC to a shielded address.
- **Team:** 2–3 people, ~12 focused hours/day. Roles A (Zcash) / B (audio+visual) / C (product+demo) — assignment still open.
- **One-liner:** A collective god whose voice and body are made of secrets people release through Zcash shielded transactions. Anyone holding the choir's public viewing key can hear everything; nothing links a secret to its sender. Strangers can **whisper back** privately (Whisper Back).
- **Name / tagline / one-liner / kiosk CTA:** final since 20 Oct, and they live **only** in `config/brand.json`. README, web, kiosk, `package.json` and the demo script read or are generated from it; never hardcode the name in code, tests, file names, or these docs. "Ghost Choir: A God Made of Secrets" was the working title and survives only in historical evidence (`docs/`, `SPIKE_LOG.md`, `ai/`, `logs/`, `spikes/`). The old tagline "A place to release a secret without attaching your name to it." is retired. Internal identifiers stay neutral (offering/contribution, reply, renderer, composer, creature, conductor).
- **Narrative words:** a contribution is an **offering** (persembahan); a reply is a **whisper that returns**; the conductor's authenticated lines are **the god's own voice**. Cosmic-horror tone. God stays center stage; Whisper Back is a mechanic, not the product. Full lore layer for copy and the demo script: `docs/lore.md`.
- **Decisions locked:** Choir + God merged into one work; choir wallet's **full viewing key (UFVK) is public**; text→local TTS is the primary input mode (voice+mask secondary); contributions are fixed-amount (0.00001 TAZ) so amounts carry no information; renderer is deterministic & open source and prints two versioned hashes, **`score_hash`** (chain data only, decoder-independent = "the blockchain is the score") and **`render_hash`** (`score_hash` + PCM from the pinned decoder + composer version = what two laptops compare in the demo); demo on **testnet (NU7)**; no cloud AI anywhere; no leaderboard, no accounts, no NFT per secret.

## 2. What is PROVEN on-chain (do not re-spike)

All on Zcash testnet, NU7 active (branch `77190ad9`), Ironwood pool. Full table in `SPIKE_LOG.md`.
- Shielded send + encrypted memo; view-only wallet reads amount+memo without spend key.
- Binary audio in memos (Codec2), reconstructed byte-identical from a **view-only** wallet (S12).
- Authentic-vs-spoof: a viewing-key holder can tell the choir's own spends (conductor voice) from inbound memos (S13).
- **Whisper Back (GO):** contribution carrying a diversified reply address → read by public-UFVK holder → direct shielded reply → received & matched by `contrib_id`; the public-key holder sees 0 of the reply. (`ai/whisper-back-spike.md`)
- **Phone (Zingo! testnet):** sends to Revision-2 `zutest1…` and Revision-0 `utest1…` (chooses shielded receiver); memos from ZIP-321 QR are treated as text → binary gets UTF-8-mangled → use the ASCII envelope (`GC1:`+base64url).
- **Note pool:** one self-send split into 12 notes; then **5 contributions in 32 s** back-to-back, all mined in one block (G4).
- **Determinism:** two independently synced wallets → same render hash incl. decoded audio (`spikes/g6_render.py`, G6).

Known explorer: https://testnet.zcashexplorer.app/transactions/{txid} (txids in display order; wallet DBs store them byte-reversed).

## 3. Environment (what the next session must set up)

Not in the zip (size/secrets): `bin/`, `vendor/`, `node_modules/`, `wallets/` (wallets are in a separate TESTNET-ONLY archive).

**Work inside WSL (Ubuntu 24.04) at `~/zecathon`, never under `/mnt/c`** (cargo is slow there, SQLite wallet DBs lock, `.sh` files break on CRLF; `.gitattributes` forces LF). Windows is only the editor. `./scripts/setup.sh` does everything below and also builds the **pinned Codec2 decoder** (tag `1.2.0`, commit `06d4c11e`, static, `-ffp-contract=off`) into `bin/c2enc` + `bin/c2dec`; renderer and smoke test use `bin/c2dec`, never a system copy. Repo is private until 28 Oct.

```bash
# system deps (Linux/WSL)
sudo apt install -y build-essential pkg-config libssl-dev protobuf-compiler git cmake codec2 espeak-ng sox libsox-fmt-all python3 python3-pip python3-pytest python3-venv sqlite3 nodejs npm
pip install --break-system-packages "qrcode[pil]" scikit-learn   # qrcode for QR tests; sklearn only for the old TOPENG spike
# rust + node
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y && source ~/.cargo/env
npm install            # @grpc/grpc-js + proto-loader for spikes/s1_lightd.mjs

# wallet tool: zcash-devtool @ 5a26ee8 + Aegis Gate NU7 patch (stock devtool CANNOT broadcast on NU7 testnet)
git clone https://github.com/zcash/zcash-devtool vendor/devtool-aegis && (cd vendor/devtool-aegis && git checkout 5a26ee8)
git clone --depth 1 https://github.com/angelraph/aegis-gate vendor/aegis-gate
(cd vendor/devtool-aegis && git apply ../aegis-gate/patches/zcash-devtool-nu7.patch && cargo build --release)   # ~10 min
mkdir -p bin && cp vendor/devtool-aegis/target/release/zcash-devtool bin/devtool-aegis
```

- lightwalletd: `testnet.zec.rocks:443` (`-s zecrocks` with a testnet wallet). On a normal machine use the default `--connection direct`.
  `tools/socks2connect.mjs` + `--connection socks5://127.0.0.1:1080` were ONLY for the sandbox's HTTP proxy; ignore elsewhere.
- Faucet: `POST https://faucet.testnet.valargroup.dev/api/claim {"address": "<utest1…>"}` (0.125 TAZ/day; rejects `zu…`/`tu…` R2 addresses; use an R0 `utest1…` form).
- Wallet commands (all `bin/devtool-aegis wallet -w <dir> … -s zecrocks`): `init --name X -i X.age -n test`, `sync`, `enhance` (**required** to fetch memos), `balance`, `list-accounts` (shows UFVK), `list-addresses`, `generate-address` (new diversified UA), `list-tx`, `init-fvk --name V --fvk <ufvk> --birthday H` (view-only), `send <acct> -i X.age --address … --value <zat> --memo …`, `pay <acct> -i X.age --payment-uri "zcash:?address=…&amount=…&memo=<base64url>&address.1=…"` (multi-output; pipe `y` to confirm), `upgrade` (after switching binaries).
- Raw memos: SQLite `wallets/test/<W>/data.sqlite` → `ironwood_received_notes.memo` joined to `transactions` (`mined_height`, `tx_index`; `txid` internal order). Sender keeps `sent_notes.memo` + `transactions.raw`.

## 4. Wallets (TESTNET ONLY, throwaway; archive `zecathon-wallets-TESTNET.zip` → unzip to `wallets/`)

| Dir | Role | Keys | State (20 Oct) |
|---|---|---|---|
| `wallets/test/A` + `A.age` | contributor | spend | ~0.112 TAZ incl. a pool of 12×0.002 notes; owns reply addresses idx 1,4,5,10 |
| `wallets/test/B` + `B.age` | **choir / conductor** | spend | UFVK `uvftest1s5vnzz3xm2…` (this is the "public key"); address `zutest1sv9c9mzq54ye…`; holds the whole test corpus |
| `wallets/test/V` | public-key reader | **view-only (B's UFVK)** | renders identically to B |
| `wallets/test/L` + `L.age` | listener | spend | ~0.0099 TAZ |
| `wallets/main/M` | mainnet throwaway | spend, never funded | only for address-parsing tests |

`.age` files decrypt the mnemonics: never commit, never share. `.gitignore` already excludes `wallets/`, `*.age`, `bin/`, `vendor/`, `logs/` (keep logs locally; they hold evidence).

## 5. Protocol (v1, implemented + unit-tested in `spikes/wb_protocol.py`)

Memo 512 B. Header 12 B: `FF 'G' ver=1 | contrib_id u32 | kind(1=contribution,2=reply) | seq | total(≤3) | len u16`.
Contribution body: `[codec][data…]` + last chunk `[reply_len][reply_addr][crc32]` (`reply_len=0` = no reply). Reply: `[codec][data…][crc32]` sent **directly** to the reply address.
Codecs: 10=text UTF-8, 1=Codec2 700C, 2=Codec2 1200, 3=1300.
Phone path: `GC1:` + base64url(binary memo), 381 B binary per memo. `normalize_memo()` accepts raw / envelope / UTF-8-mangled. Replies to phones use the human-readable form `GC1R:<contrib_id in decimal>:<text>` (Zingo shows memos as text).
The CRC covers `codec+data` only, not the reply address (validate the address by parsing it; UAs carry their own checksum). Wallets trim trailing zero bytes, so the decoder must zero-pad each memo back to `12 + len` before reading the body (the spike decoder does not: ~1/256 contributions, those whose CRC ends in `0x00`, fail; fixed in `protocol/`, spike left as evidence).
`'G'`, `GC1:` and `GC1R:` are protocol markers, not the brand; changing them is a protocol version bump (not before the deadline).
Canonical order = `(mined_height, tx_index, action_index)` → **miner order within a block, not send order** (observed; say so in README).

## 6. Privacy claims (exact wording matters)

MAY say: "we, the operator, cannot learn who contributed"; "replies travel directly between two wallets, never through us"; "anyone can re-render the whole work from one key and get the same hash".
MAY NOT say: "anonymous", "untraceable", "nobody can ever connect you to your secret".
MUST say: secrets are public to every key holder, forever (key is irrevocable); content and voice can identify you (hence text→TTS default); **your own wallet stores what you sent** (`sent_notes`) — kiosk uses an ephemeral wallet; replies to a per-contribution address can be spammed by anyone holding the public key; lightwalletd sees your IP (Tor is on the roadmap); the choir's own spends are public (full viewing key).
Content filter: renderer may skip flagged txids (open list in repo) but never reorders/edits others; chain data remains.
Copy rule: never imply the secret itself stays hidden (its content is public to every key holder); what stays private is the link between sender and secret. "No one will ever know it was you" is forbidden; "it does not ask your name" is fine (the protocol needs no identity).
Handling rules (decided 21 Oct): the choir UFVK is published deliberately (README + the Séance reveal) but never appears in code, tests, logs or commits. Reply addresses are never persisted outside the wallet DB: `score.json` carries only `has_reply`; the Whisper Back button re-reads the address from the wallet DB when pressed.

## 7. Scope rules for the build (from the critical review)

- Vertical slice first (must run by day 5): kiosk (text→TTS→Codec2→send) → chain → view-only renderer → offline deterministic mix + render hash → God 2D reacting to audio → second laptop shows the same hash.
- Separate milestones that may fail without killing the demo: Whisper Back UI, phone QR contributions, Codec2 in browser, conductor voice.
- God visual ≤ ~15% of team hours; Canvas 2D, three parameters from audio, no `Math.random()`.
- Audio mixing offline with integer arithmetic; WebAudio only plays the buffer (browser mixing is not bit-exact).
- Demo rule: at least one contribution sent live; pre-sent ones are labelled as such; never fake tx status.
- Do not build anything for revenue in this window (grants/installations come after).

## 8. Gotchas (each cost us time)

- Stock devtool / released crates fail on NU7 testnet with `incorrect consensus branch id`; use the patched build. Mainnet (NU6.3) could use stock, untested (G5).
- Memos are NOT in compact blocks: run `enhance` before reading memos.
- A rejected broadcast locks the note until expiry (~40 blocks ≈ 20 min). Keep the note pool.
- Own-account outputs are flagged `is_change=1` and are trusted (spendable after 3 confs); inbound from others needs 10.
- Patched SDK prints Revision-2 UAs (`zu…` shielded-only, `tu…` with transparent). Zingo accepts them; the faucet doesn't.
- ZIP-302: binary memos start with `0xFF` (we used `0xF5` once; it is legacy/ambiguous).
- Wallet DB txids are byte-reversed vs explorers/Zingo.
- Old regexes broke on new address encodings; match `(zu|tu|u)test1…`.
- `scripts/smoke.sh` has two chain checks: **regression** (`spikes/g6_render.py` at the fixed height 4522002 must give `c46dd5de…`, 7 accepted) and **health** (current height; V and B must agree). `as_of` is inside every hash, so a render at the current height never equals the G6 value.
- Editing files from Windows over `\\wsl.localhost\…` resets the exec bit; `chmod +x` scripts afterwards (`git diff --summary` shows mode changes).

## 9. Next (day 3 →) — full checklist in `TODO.md`

1. ~~Repo layout, `protocol/`, renderer daemon, README~~ — done on Day 2 (see TODO.md). Use them:
   `python3 -m pytest` (95 tests; chain regression needs `wallets/`), `python3 -m renderer once --wallet wallets/test/V --as-of 4522002` (→ `out/score.json` + `out/render_hash`; anchors: g6 `c46dd5de…`, score/1 `41530793…`), `python3 -m renderer daemon --wallet wallets/test/V`.
2. ~~Offline composer~~ — done Day 3 (`renderer/composer.py` `choir/1`, `renderer/tts.py`): `out/mix.wav` stereo 8 kHz; render/1 anchor at 4522002 = `4b724009…`. Any change to the composer, the voice params or the pins bumps `COMPOSER_VERSION` and `RENDER_HASH` in `renderer/tests/test_chain_regression.py`. **sox must run with `-D`** (default dither is random → non-deterministic). Per-offering integer features for the creature are in `score.json` → `render.timeline` (`energy`, `zero_crossings`, `samples`, `start`, `pan`, `pitch_layer`).
3. ~~Kiosk~~ — done Day 4 as a CLI (`kiosk/`, see its README): `preview`, `session open|status|close` (ephemeral wallet under `wallets/kiosk/current/`, funded from `wallets/test/A`, split into 0.002 notes), `offer [--reply]`, `inbox`, `offer --from <wallet>` for seeding. Choir address in `config/choir.json`. First live kiosk tx `91621cb4…` @4525215. Kiosk web UI is still open (Day 5/6).
4. ~~God 2D on Canvas~~ — done Day 5 (`web/`): `python3 -m web --port 8765` serves `web/`, `config/brand.json`, `out/`; creature from `score.json` timeline, playback of `out/mix.wav`, both hashes on screen. Port 8080 on this machine is taken (Oracle TNS). Remaining Day-5 gate: live send → second laptop same hash (needs the second machine).
5. Milestones: ~~M2 Whisper Back~~ done Day 5 (`renderer/whisper.py`, `python3 -m renderer whisper <txid> [--send-from W]`, web limb click → `/whisper/<txid>` → QR, `kiosk inbox`; live loop `8d02a6b0…` → `143f91ee…`, V sees 0). ~~M1 conductor voice~~ done Day 5: protocol `kind=3` (`encode_conductor`), valid only on the choir wallet's own spends (`is_change`), else skipped `forged-conductor`; `kiosk speak "…" --from wallets/test/B` (`--forge` from A for the demo); composer `choir/2` (render/1 anchor `9b6c1b9d…`); `wallet.py` falls back to `sent_notes` for own outputs so B == V. Live: god `d6bcb9f7…`, forgery `b126b3c7…` @4525280. Open: M3 phone contributions (envelope), M4 Codec2 in browser, M5 Séance reveal, web visuals for conductor / NOT THE GOD.
6. README is generated (`python3 scripts/gen_readme.py`; edit `docs/README.template.md`, never `README.md`); demo video; submit by 28 Oct (sealed until judging). Open decision: A/B/C roles.

## 10. Repo map (also: `docs/evidence-index.md` = claim → txid → log; `scripts/setup.sh` builds everything; `scripts/smoke.sh` verifies it)

Product: `protocol/` (wire format v1, envelope, `GC1R`, address checksum + tests), `renderer/` (wallet reader, score, hashes, pinned decoder, G6 legacy, CLI/daemon + tests), `kiosk/` + `web/` (Day 4–5), `config/` (`brand.json`, `skiplist.txt`), `scripts/` (`setup.sh`, `smoke.sh`, `gen_readme.py`, `tests/`), `docs/README.template.md`, `docs/lore.md`, `LICENSE`, `THIRD_PARTY_NOTICES.md`. GitHub: private `agadape/<slug from brand.json>` = `origin` of this repo; `git push` works from WSL (repo-local credential helper = Windows `gh.exe`).
Evidence: `spikes/` S1–S13 scripts (+`wb_protocol.py`, `wb_harness.sh`, `g6_render.py`, `s7_near_intents.mjs`, `s1_lightd.mjs`), `radio/` Codec2 voice experiment (S12), `topeng-spike/` (rejected idea, stylometry test), `ai/` reports + `phone-test/` QR + Zingo screenshot, `docs/` concept v3 + critical review, `logs/` raw evidence, `tools/socks2connect.mjs` (sandbox only), `scripts/` (setup, smoke, NU7 patch), `SPIKE_LOG.md` the source of truth for "what works".
