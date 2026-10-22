# TODO — Ghost Choir: A God Made of Secrets
Deadline **28 Oct 2026** (submission sealed until judging). Budget ≈ 100 team-hours. Owner codes: **A** Zcash · **B** audio/visual · **C** product/demo · **?** unassigned.
Rule: vertical slice (Day 2–5) before any milestone (M1–M5). If a day slips, cut from M5 upward, never from the slice.

## Done (Day 0–1, 13–20 Oct)
- [x] Recon, competition map, judge proxy, critical review (`docs/`)
- [x] Spikes S1–S13: testnet NU7 tooling, send+memo, view-only, voice-in-memos, conductor auth (`SPIKE_LOG.md`)
- [x] Whisper Back spike → **GO** (`ai/whisper-back-spike.md`)
- [x] Phone test (Zingo testnet): R2/R0 addresses OK, binary memo → ASCII envelope needed
- [x] Day-1 gates: G1, G3, G4 (note pool, 5 tx/32 s), G6 (render hash identical), G7
- [x] Protocol v1 + unit tests (`spikes/wb_protocol.py`), deterministic renderer prototype (`spikes/g6_render.py`)
- [x] Handoff: `CLAUDE.md`, wallets archive

## Open decisions (decide before Day 2 coding)
- [x] Final name, tagline, one-liner, kiosk CTA → `config/brand.json` (20 Oct; the only place they appear). Lore layer → `docs/lore.md`
- [ ] Assign A / B / C to real people (how: put the names on the owner codes here and in "team members and roles" of `docs/submission-form.md`)
- [x] Testnet (patched devtool, proven) vs mainnet (stock devtool, untested G5) for the demo → **testnet** (21 Oct)
- [x] 21 Oct: protocol v1 on chain is canonical; two versioned hashes (`score_hash` chain-only, `render_hash` = score + pinned-decoder PCM + composer version); Codec2 pinned to tag 1.2.0 built from source; 0.00001 TAZ; UFVK published deliberately but never in code/tests/logs/commits; reply addresses never persisted outside the wallet DB; `GC1R:<contrib_id decimal>:<text>`; work in WSL `~/zecathon`; repo private until 28 Oct
- [x] UFVK publication: README on submission day + Séance reveal on stage (22 Oct) (steps: "the publication act" in `docs/submission-checklist.md`; until then the key stays out of code, tests, logs and commits)
- [x] Risk accepted: single lightwalletd (`testnet.zec.rocks`). Mitigation: wallet DBs synced before the demo, seed contributions pre-sent, demo video as backup; look for an alternative testnet lightwalletd only if time allows (≤30 min)

## Day 2 (21 Oct) — repo + protocol + renderer daemon  [~12 h]
- [x] **?** Create product repo layout: `protocol/`, `renderer/`, `kiosk/`, `web/`, `scripts/`, `README.md`, `.env.example`, keep `spikes/` as smoke tests (`01de678`)
- [x] **A** Port `spikes/wb_protocol.py` → `protocol/` with tests from §5a of the concept doc (empty/max payload, lost byte, bad len, dup/missing/out-of-order chunks, CRC, unknown version/codec, envelope, mangled) (`f28567a`; also fixes the zero-trim bug, adds reply-address checksum)
- [x] **A** Add human-readable phone reply format `GC1R:<contrib_id>:<text>` (Zingo shows memos as text) (`f28567a`, decimal contrib_id)
- [x] **A** Renderer daemon from `spikes/g6_render.py`: loop `sync → enhance → render → write score.json + render_hash`; view-only wallet only; log every skip with reason (`1ca2655`; G6 reproduced, V == B byte-identical)
- [x] **A** Canonical order `(mined_height, tx_index, action_index)`; `as_of_height` explicit; skip-list file for flagged txids (`config/skiplist.txt`)
- [x] **C** Write README skeleton with the privacy wording from `CLAUDE.md` §6 verbatim + "your own wallet remembers" + "block order ≠ send order" (merged template `145e283`, updated `45481f7`; generated from `config/brand.json`)

## Day 3 (22 Oct) — offline composer  [~12 h]
- [x] **B** Pin decoder: `c2dec` version recorded; decode 700C/1200/1300 → PCM 8 kHz int16 (`264aae3`, fingerprint in `renderer/decoder.py`)
- [x] **B** Deterministic mixer: integer arithmetic, per-`contrib_id` pan/pitch-layer derived from the id, no RNG, no float drift; output one WAV + hash (`renderer/composer.py` `choir/1`)
- [x] **B** Text contributions → local TTS (espeak-ng now; Piper if time) → same pipeline (`renderer/tts.py`; espeak-ng 1.51 + sox `-D`, fingerprint pinned)
- [ ] **A** Verify G6 still holds end-to-end: two machines, same wallet key, same `render_hash` incl. PCM (one machine so far: V == B byte-identical incl. `mix.wav`; needs a second laptop; how: `docs/fresh-clone.md` on that laptop, then `renderer summon … --as-of H` and compare with V rendered at the same H)
- [x] **C** Collect 10–15 seed "secrets" (original, safe to publish) and pre-send them so the god is never empty (14 sent 22 Oct @4,527,786–4,527,794; txids in `docs/evidence-index.md` "Pre-sent seed offerings (22 Oct 2026)")

## Day 4 (23 Oct) — kiosk (sender)  [~12 h]
- [x] **A** Kiosk CLI: text → TTS → Codec2 → chunk → `pay` from an **ephemeral** wallet funded from the pool; wipe wallet dir after session; never store raw recordings (`python3 -m kiosk`; live tx `91621cb4…` @4525215 from wallet A; web UI = Day 5/6)
- [x] **A** Note pool script: split N×0.002 from the funding wallet; monitor spendable count (`kiosk session open --notes N` / `session status`)
- [x] **A** Optional reply address per contribution (`generate-address`), stored nowhere after sending (`kiosk offer --reply`; only `contrib_id → txid` kept in the session's `state.json` for `inbox`)
- [x] **C** Kiosk UI copy: 3-layer privacy statement shown **before** send; content warning (names/places identify you) (`kiosk/copy.py`, §6 wording, tested)
- [ ] **C** Run the 10-person test from the critical review §9 (real secret vs joke; "still want to send?" after permanence warning) (how: `docs/user-test-kit.md`: read-aloud script, kiosk web steps, the four questions, results table)

## Day 5 (24 Oct) — God visual + vertical slice complete  [~12 h]
- [x] **B** Canvas 2D creature: ≤3 parameters from audio features (energy, pitch, duration), state `G_n = F(G_{n-1}, A_n, I_n)`, no `Math.random()`; looks alive with 3 contributions (`web/creature.js`)
- [x] **B** Web page plays the offline-mixed buffer (WebAudio playback only, no live mixing) (`web/app.js`, `python3 -m web`)
- [ ] **all** GATE: live kiosk send → chain → renderer → audio + god update → second laptop same hash. If this fails, Days 6–7 fix it; no milestones. (One machine done 21 Oct: kiosk `91621cb4…` / `8d02a6b0…` → V renderer in 40–100 s → mix + creature updated. "Second laptop" proven as a fresh wallet from the key alone: `renderer summon` → same `render_hash` `8540a0a5…` @4525294 as V in 28 s. **A second physical laptop is still worth doing before the demo.** How: `docs/fresh-clone.md` on the second laptop, then the Séance row of `docs/demo-script.md`.)

## Day 6 (25 Oct) — milestones (each may be dropped)  [~12 h]
- [x] **M1 A** Conductor voice: self-send detection (S13) → "the god speaks" layer; forged voice shown as rejected (protocol `kind=3`, `renderer/score.py` conductor vs `forged-conductor`, composer `choir/2`; `python3 -m kiosk speak`; live 21 Oct: god `d6bcb9f7…` accepted, forgery `b126b3c7…` rejected, block 4525280; web "NOT THE GOD" visual still open)
- [x] **M2 A/C** Whisper Back: "whisper back" button → ZIP-321 URI/QR to the reply address; reply inbox view for demo wallet (`renderer/whisper.py`, `python3 -m renderer whisper`, web limb click → QR, `kiosk inbox`; live loop 21 Oct: offering `8d02a6b0…` from the ephemeral wallet → L's reply `143f91ee…` → inbox matched in ~80 s, V sees 0)
- [x] **M3 C** Phone contributions: QR with ASCII envelope (`python3 -m kiosk qr "text" [--reply ua] [--png]`; envelope path proven end-to-end with the product code by paying the QR's URI from wallet L: `ebc5bcad…`). Still to do: scan the same QR with Zingo on a real phone (user; how: `python3 -m kiosk qr "…" --png qr.png`, scan it with Zingo on testnet, then check that V accepts it with `python3 -m renderer once --wallet wallets/test/V --sync`)
- [x] **M4 B** Codec2 in browser (`@uimaxbai/ffmpeg-core-codec2` or skip) — skipped on purpose (22 Oct): the renderer decodes with the pinned `bin/c2dec` locally and the page only plays the offline mix (`out/mix.wav`), so a browser decoder would add a second, unpinned decoder without changing what anyone hears
- [x] **M5 C** Séance format: viewing key hidden during session, revealed at the end as the climax (`python3 -m kiosk reveal --from wallets/test/B` prints the UFVK + QR on purpose, nothing written unless `--to`; `python3 -m renderer summon --key-file K --birthday H --wallet DIR` = a new Watcher from the key alone → same hashes. Web séance mode (hashes/key hidden until reveal) belongs to `web/`, open)

## Day 7 (26 Oct) — hardening  [~12 h]
- [x] **A** Privacy review: no analytics, no cloud calls, logs contain only txid + validation result, no reply addresses retained (`docs/privacy-review.md`; fixes: secrets off argv/history, no kiosk TTS cache, espeak via stdin; residual: `ps` during `pay`, `sent_notes`, lightwalletd IP)
- [x] **A** Failure drills: rejected broadcast (locked note), slow block, stale sync, duplicate memo, malformed memo (`docs/failure-drills.md`: all seven observed on testnet 21 Oct; malformed `a84adbaf…` skipped, duplicates `11f9bd73…`/`103dec1c…` both kept, connection-reset tx `6a0f8588…` locked one note until 4525360 while the pool kept sending)
- [x] **all** Run the full 3-min demo 5× without manual intervention; freeze features (`scripts/demo.sh`: 9 runs on 21 Oct, four green, every failure with a named cause, the last product bug fixed in 4374796; table "Rehearsal runs" in `docs/failure-drills.md`; the two block waits dominate and need narration)
- [x] **C** Decide which pre-sent contributions are shown and label them honestly in the script (22 Oct, `6a0cd55`, `docs/demo-script.md`: all of them are sung, since the renderer sings the chain; labelled out loud as 14 team-written seeds of 22 Oct + test and rehearsal offerings since 20 Oct, with one exact operator sentence; the judge's offering is the only live one)

## Day 8 (27 Oct) — demo video + polish  [~12 h]
- [ ] **C** Record demo video (real txs, explorer shown, two-laptop hash moment, whisper back if M2 done) (how: the shot list and pre-show checklist in `docs/demo-script.md`; explorer = ZecBlock after pre-show check 8; the link goes into `docs/submission-form.md`)
- [ ] **B** Visual/audio polish only on the demo path
- [x] **C** README final: what it is, setup, demo walkthrough, privacy model, limits, architecture diagram, spike evidence links (21–22 Oct: restructure into one document for a ten-minute judge `c283dd3`, network-fallback / visual-direction links `417793c`, explorer links switched to ZecBlock `efb600a`; generated from `docs/README.template.md`. Left for the user at submission: paste the full viewing key by hand at the placeholder under "The key", as decided 22 Oct; steps in `docs/submission-checklist.md`, "the publication act")

## Day 9 (28 Oct) — submit
- [ ] **all** Re-run `spikes/` smoke tests against the final environment (how: `./scripts/smoke.sh` and `python3 -m pytest -q`; dry run green on 22 Oct, see the end of `docs/submission-checklist.md`)
- [ ] **C** Repo public (or made public on the 28th), license, submission form on thezecathon.com, shielded payout address ready (how: `docs/submission-checklist.md`, whose "Dry run 22 Oct" section lists what only the user can do; paste-ready answers in `docs/submission-form.md`)
- [x] **C** Test clone-and-run on a fresh machine with a fresh wallet (21 Oct, `docs/fresh-clone.md`: clean clone, `setup.sh` 9 m 34 s, pytest 121 passed / 2 skipped, `renderer summon` from the key alone in 50 s -> same render_hash as wallet V at 4525294; a second physical laptop is still worth doing before the show)

## Post-hackathon (not now)
- [ ] Grant proposal (ZCG / zkSNARKs holder season) · Zcon installation email · Tor for lightwalletd · Piper TTS
