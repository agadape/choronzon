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
- [ ] Final name: "Ghost Choir", "God Made of Secrets", or "Ghost Choir: A God Made of Secrets" (working title until then; the human-facing name lives only in `config/brand.json`)
- [ ] Assign A / B / C to real people
- [x] Testnet (patched devtool, proven) vs mainnet (stock devtool, untested G5) for the demo → **testnet** (21 Oct)
- [x] 21 Oct: protocol v1 on chain is canonical; two versioned hashes (`score_hash` chain-only, `render_hash` = score + pinned-decoder PCM + composer version); Codec2 pinned to tag 1.2.0 built from source; 0.00001 TAZ; UFVK published deliberately but never in code/tests/logs/commits; reply addresses never persisted outside the wallet DB; `GC1R:<contrib_id decimal>:<text>`; work in WSL `~/zecathon`; repo private until 28 Oct
- [x] Risk accepted: single lightwalletd (`testnet.zec.rocks`). Mitigation: wallet DBs synced before the demo, seed contributions pre-sent, demo video as backup; look for an alternative testnet lightwalletd only if time allows (≤30 min)

## Day 2 (21 Oct) — repo + protocol + renderer daemon  [~12 h]
- [ ] **?** Create product repo layout: `protocol/`, `renderer/`, `kiosk/`, `web/`, `scripts/`, `README.md`, `.env.example`, keep `spikes/` as smoke tests
- [ ] **A** Port `spikes/wb_protocol.py` → `protocol/` with tests from §5a of the concept doc (empty/max payload, lost byte, bad len, dup/missing/out-of-order chunks, CRC, unknown version/codec, envelope, mangled)
- [ ] **A** Add human-readable phone reply format `GC1R:<contrib_id>:<text>` (Zingo shows memos as text)
- [ ] **A** Renderer daemon from `spikes/g6_render.py`: loop `sync → enhance → render → write score.json + render_hash`; view-only wallet only; log every skip with reason
- [ ] **A** Canonical order `(mined_height, tx_index, action_index)`; `as_of_height` explicit; skip-list file for flagged txids
- [ ] **C** Write README skeleton with the privacy wording from `CLAUDE.md` §6 verbatim + "your own wallet remembers" + "block order ≠ send order"

## Day 3 (22 Oct) — offline composer  [~12 h]
- [ ] **B** Pin decoder: `c2dec` version recorded; decode 700C/1200/1300 → PCM 8 kHz int16
- [ ] **B** Deterministic mixer: integer arithmetic, per-`contrib_id` pan/pitch-layer derived from the id, no RNG, no float drift; output one WAV + hash
- [ ] **B** Text contributions → local TTS (espeak-ng now; Piper if time) → same pipeline
- [ ] **A** Verify G6 still holds end-to-end: two machines, same wallet key, same `render_hash` incl. PCM
- [ ] **C** Collect 10–15 seed "secrets" (original, safe to publish) and pre-send them so the god is never empty

## Day 4 (23 Oct) — kiosk (sender)  [~12 h]
- [ ] **A** Kiosk CLI/web: text → TTS → Codec2 → chunk → `pay` from an **ephemeral** wallet funded from the pool; wipe wallet dir after session; never store raw recordings
- [ ] **A** Note pool script: split N×0.002 from the funding wallet; monitor spendable count
- [ ] **A** Optional reply address per contribution (`generate-address`), stored nowhere after sending
- [ ] **C** Kiosk UI copy: 3-layer privacy statement shown **before** send; content warning (names/places identify you)
- [ ] **C** Run the 10-person test from the critical review §9 (real secret vs joke; "still want to send?" after permanence warning)

## Day 5 (24 Oct) — God visual + vertical slice complete  [~12 h]
- [ ] **B** Canvas 2D creature: ≤3 parameters from audio features (energy, pitch, duration), state `G_n = F(G_{n-1}, A_n, I_n)`, no `Math.random()`; looks alive with 3 contributions
- [ ] **B** Web page plays the offline-mixed buffer (WebAudio playback only, no live mixing)
- [ ] **all** GATE: live kiosk send → chain → renderer → audio + god update → second laptop same hash. If this fails, Days 6–7 fix it; no milestones.

## Day 6 (25 Oct) — milestones (each may be dropped)  [~12 h]
- [ ] **M1 A** Conductor voice: self-send detection (S13) → "the god speaks" layer; forged voice shown as rejected
- [ ] **M2 A/C** Whisper Back: "whisper back" button → ZIP-321 URI/QR to the reply address; reply inbox view for demo wallet
- [ ] **M3 C** Phone contributions: QR with ASCII envelope; test on Zingo again
- [ ] **M4 B** Codec2 in browser (`@uimaxbai/ffmpeg-core-codec2` or skip)
- [ ] **M5 C** Séance format: viewing key hidden during session, revealed at the end as the climax

## Day 7 (26 Oct) — hardening  [~12 h]
- [ ] **A** Privacy review: no analytics, no cloud calls, logs contain only txid + validation result, no reply addresses retained
- [ ] **A** Failure drills: rejected broadcast (locked note), slow block, stale sync, duplicate memo, malformed memo
- [ ] **all** Run the full 3-min demo 5× without manual intervention; freeze features
- [ ] **C** Decide which pre-sent contributions are shown and label them honestly in the script

## Day 8 (27 Oct) — demo video + polish  [~12 h]
- [ ] **C** Record demo video (real txs, explorer shown, two-laptop hash moment, whisper back if M2 done)
- [ ] **B** Visual/audio polish only on the demo path
- [ ] **C** README final: what it is, setup, demo walkthrough, privacy model, limits, architecture diagram, spike evidence links

## Day 9 (28 Oct) — submit
- [ ] **all** Re-run `spikes/` smoke tests against the final environment
- [ ] **C** Repo public (or made public on the 28th), license, submission form on thezecathon.com, shielded payout address ready
- [ ] **C** Test clone-and-run on a fresh machine with a fresh wallet

## Post-hackathon (not now)
- [ ] Grant proposal (ZCG / zkSNARKs holder season) · Zcon installation email · Tor for lightwalletd · Piper TTS
