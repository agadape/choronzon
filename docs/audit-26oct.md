# Product audit, 26 Oct 2026 (HEAD `d099811`, read-only)

Five independent read-only passes (privacy/linkability + CI + git history; README and site claims vs code;
determinism + protocol robustness; site security + anchoring + Tor; reliability + the public loop + code
quality) plus the judge's path on a fresh clone. Nothing was edited, sent or deployed during the audit.

## Verdict

No disqualifying finding and no privacy leak: nothing in the site, the CI logs, the `anchors` branch or 135
commits of history links an offering to its sender, and every hostile memo we could build fails closed with a
reason code. The determinism claim holds end to end: a fresh clone with nothing but the README key reproduced the
live site's `render_hash` (`78d33def…` at 4,539,886) in 234 s after a 454 s setup. The product is technically sound
and honest enough to submit after a handful of small fixes: a few README sentences overstate (the key is not on the
site, "every render is stamped", "no server of ours"), `smoke.sh` still syncs without Tor, and two demo-integrity
risks remain (a retry loop that can double-send on stage; the public phone path never closed by a real wallet).

## The judge's path (fresh clone, `/tmp/judge`, 26 Oct)

| Step | Result | Time |
|---|---|---|
| `./scripts/setup.sh` | exit 0 (builds devtool + NU7 patch and Codec2 from source) | 454 s |
| `python3 -m pytest -q` | 282 collected, 280 passed, 2 skipped (chain regression needs `wallets/`) | 93 s |
| `renderer summon --key-file <README key> --birthday 4502962 --as-of 4539886` | `render_hash` `78d33def…`, `decoder_matches_pin` and `voice_matches_pin` true = the live site | 234 s (Tor) |

## Findings, ranked

### DISQUALIFYING

None.

### SERIOUS (demo integrity, not privacy)

**S1. The public loop has never been closed by a real phone, and a judge without TAZ has no path.**
`README.md:291` still lists the Zingo scan as open; `docs/evidence-index.md:47` says the `GC1:` URI was paid from
wallet L, not from a phone. The `#give` panel and the README never say where to get testnet funds
(`grep -n faucet web/index.html README.md` → 0). The multi-memo ZIP-321 form (`address.1=…`) with an R2 `zutest1…`
address has only been proven for a raw-text memo on Zingo (SPIKE_LOG G1).
Fix (1–2 h): one real Zingo scan of `#give` today, txid into `docs/evidence-index.md`; one line in the panel and the
README: "no TAZ? the faucet (faucet.testnet.valargroup.dev) wants an R0 `utest1…` address from your wallet". If Zingo
rejects the multi-output URI, restrict `#give` to one memo.

**S2. `scripts/demo.sh:38-56` can double-send a god line or a whisper.** `speak_retry`/`whisper_retry` rerun
`kiosk speak` / `renderer whisper --send-from` up to 4×. The devtool stores the built transaction and locks its notes
(`send.rs:254`) and only then broadcasts (`send.rs:287`); if the gRPC reply is lost after broadcast, the command exits
non-zero while the transaction sits in the mempool, and the retry spends a different pool note: two authentic
conductor lines (or two whispers) on chain. `docs/network-fallback.md:131` already admits "does not check whether a
failed attempt landed". The kiosk `offer` is correctly never retried. The web kiosk (`kiosk.js:82`) prints "not sent"
after a failed `pay`, which the chain has not confirmed, and the visitor can press again.
Fix (2–3 h): before each retry, `sync` the sending wallet and look for a new unmined transaction
(`raw IS NOT NULL AND mined_height IS NULL AND expiry_height > tip`, or `sent_notes` count grew) and wait for mining
instead of resending; or `ATTEMPTS=1` for `speak`. Reword `kiosk.js` to "send failed or unconfirmed; the operator
checks before you try again".

### SHOULD-FIX

1. **The site does not publish the key, but `CLAUDE.md` §6/§8 and `docs/privacy-review.md` say it does since 24 Oct.**
   `publish-web.yml:201` runs `build_web.sh` without `--key-file`; the key file is shredded at :135 before the build.
   `curl -s -o /dev/null -w '%{http_code}' https://choronzon.vercel.app/key.txt` → 404. Not a leak (the key is
   deliberately public, and the README carries it), but a claim mismatch a judge can test with one curl. Fix
   (30 min): keep the key file until after the build and pass `--key-file "$RUNNER_TEMP/choir.key" --birthday
   "$CHOIR_BIRTHDAY"` (the page already handles both cases, `web/app.js:429`), or correct the internal docs to
   "README only".
2. **`scripts/smoke.sh:17-19` syncs wallets V and B over a direct connection, silently** (no `--connection`; the
   devtool default is direct, `vendor/devtool-aegis/src/remote.rs:240`). Contradicts "every lightwalletd connection the
   product makes goes over Tor" and leaks the operator laptop's IP every smoke run. Fix (5 min):
   `--connection "${LWD_CONNECTION:-tor}"`.
3. **The voice-pin check reads its own cache, so a changed espeak-ng/sox is reported as `voice_matches_pin: true`.**
   `renderer/tts.py:199-202` keys the cache on a hardcoded version constant, `fingerprint()` (`tts.py:226`) goes through
   the same cache, and `renderer/__main__.py:392` enables it for `once`, `daemon` and CI. Proof: with espeak replaced by
   `/bin/false`, cache on → "matches pin = True"; cache off → `TTSError`. Fix (30 min): `fingerprint()` bypasses the
   cache, and the cache key includes a hash of the espeak-ng, sox and c2enc binaries.
4. **A mainnet reply address is accepted on testnet and becomes a Whisper Back target.** `protocol/memo.py:196`
   validates with `is_unified_address` (any network); `renderer/whisper.py:44` and the `/whisper/<txid>` route build
   `zcash:u1…` without a network check (only the senders check: `kiosk/session.py:257`, `web/offering.js:42`). A
   listener scanning that QR with a mainnet wallet sends real ZEC to an attacker. Fix (20 min): in `whisper.find_target`
   (and the web route) require the address network to match `config/choir.json`; do not touch `decode_contribution`
   (inside `score_hash`).
5. **Composer memory grows linearly with Python lists of ints** (`renderer/composer.py:136-141`): 49 offerings →
   3.4 s, 131 MB; ~10k offerings (one spammer, one day at the faucet rate) → several GB, the CI runner and the daemon
   die, "keep the last render" fails and the site freezes. Fix (1 h, hash-neutral): `array.array("i")` for the two
   channels and per-voice slice accumulation.
6. **README sentences to correct** (exact replacements):
   - :37 "No server of ours is involved." → "No server of ours is needed: the public site is a convenience snapshot,
     and anyone with the key can rebuild the work without it."
   - :140, :286 "Every published render is stamped with OpenTimestamps" → "… when the calendars answer; if a stamp
     fails the page ships without a proof and the next upgrade job stamps it" (`publish-web.yml:192-244`: a failed
     stamp is a warning).
   - :174 "121 passed, 2 skipped" → "282 tests; on a fresh clone the two chain-regression tests that need
     `wallets/test/V` are skipped".
   - :82, :278 "refuses to run on a wallet that holds a spending key" → add "(except with `--allow-spend-key`, used
     only to compare against the choir wallet)".
   - `docs/evidence-index.md:61` "28 s" → "49.8 s including sync" (matches `docs/fresh-clone.md`).
   - Missing §6 MUST line in the kiosk statement (`kiosk/copy.py`) and the site's give panel: "The god's own lines,
     and everything its wallet spends, are public to every key holder (full viewing key)."
   - Limits (:247): add "it still sees which transactions one connection fetched and what it broadcast, so the set
     fetched over one connection belongs to one client; the wallet's Tor directory and guard state live under
     `<wallet dir>/tor/` and are deleted with the kiosk session."
7. **`key.txt` is not git-ignored** (`git check-ignore -v key.txt` → nothing) while `docs/fresh-clone.md:89-152` and
   `publish_web.sh --key-file` tell the operator to create exactly that file in the checkout; a `git add -A` commits it.
   Fix: one `.gitignore` line.
8. **No staleness signal on the installation screen.** `renderer/__main__.py:100-112` keeps `out/score.json` untouched
   on sync failure and swallows loop errors; `web/app.js:263` keeps saying "evoked at height N". A dead daemon, a hung
   lightwalletd (the loop can block up to ~90 min: 3 × 900 s × 2) or a Tor outage looks healthy on stage. Fix (1 h):
   the daemon writes `out/status.json {attempted_at, sync_ok, scanned_height, error}` every loop; the page shows
   "last synced N min ago / sync failing".
9. **Kiosk session left open 70.7 h** (`session status`: ready, 1,604,000 zat, 3 offerings; `state.json` opened
   23 Oct 08:30 UTC; the wallet holds 6 memos in `sent_notes` and 3 contrib_id→txid links). The statement promises
   deletion when the session closes and the docs say "same day". Fix: `status` prints the age and warns past 24 h;
   close it.
10. **`notes_left = spendable // NOTE_ZAT`** (`kiosk/session.py:135`) is a value estimate, not a note count;
    `demo.sh:71` asserts on it. Use `spendable_note_values()` as `kiosk pool` does (20 min).
11. **`Session.open` has no cleanup on failure** (`session.py:76`): a crash after `pool.send` leaves `current/` without
    `ready`; the only way out is `session close`, which wipes a wallet holding the funding. Fix (30 min): wipe on
    failure before funding; print `fund_txid` right after sending.
12. **`GET /whisper/<txid>?text=` is still accepted** (`web/__main__.py:140-142`; the page uses POST). Typed by hand it
    lands in the operator's browser history. Remove the GET form (10 min, one test update).
13. **Vacuous test** `kiosk/tests/test_sync_retry.py:35` calls `d._run("pay", "x")`, which never retries by
    construction; it would not catch `pay()` switching to `_run_read`. Call `d.pay(...)` with `account()` mocked.

### NOTE

- Transaction shape (memo count, `tx_index`, `action_index`) tells a key holder "kiosk-shaped" from "phone-shaped":
  software, not identity; one sentence next to "Tor does not hide timing" would be honest.
- `kiosk/devtool.py:28-30 sanitize()` masks addresses and memos, not viewing keys; `ci_render.sh:46` prints the last
  log line on failure. Harmless while the key is public; add `(uview|uvf)[a-z]*1[0-9a-z]+` to the regex.
- `kiosk qr --reply <ua>` / `offer --reply-to <ua>` take the visitor's address on argv (shell history outlives
  `session close`); the address is public in the memo anyway.
- The Actions cache holds the Watcher wallet (key + decrypted memos, all public by design); after the repo goes
  public, fork PR workflows can restore base-branch caches. Never reuse that pattern with a spend key.
- `anchor/ots.py:336`: one bogus attestation from a whitelisted calendar turns the verdict into MISMATCH even if
  another attestation verifies (false negative). "No later than" uses the block header timestamp, which Bitcoin rules
  allow to be ~2 h off; one sentence in `docs/anchoring.md`.
- Append-only `anchors` is enforced by code only (`anchor/branch.py:96-103`); a GitHub ruleset forbidding force-push
  and deletion on that branch (5 min) makes the claim hold against the repo owner too.
- `access-control-allow-origin: *` on every served path (Vercel project setting, not ours); all data public.
- Find-my-offering by number (`app.js:478`) returns the first offering with that `contrib_id`; senders choose it, so
  collisions are possible (drill 4 had duplicates). Prefer the txid.
- A wallet that strips the memo → the tx is skipped `not-protocol`; the visitor's `#offering=N` link says "not in this
  snapshot yet" forever. Add "try the txid" to that message.
- `renderer once --as-of bogus` → raw `ValueError` traceback; `load_skiplist` and `summon --key-file` read files without
  `encoding="utf-8"`.
- JS vs Python encoder differ only at wrapper level: JS `trim()` strips a BOM, Python `strip()` does not; JS refuses
  empty text, `make_offering` would encode a 0-byte offering (`kiosk qr` refuses it too).
- `kiosk/copy.py` says "your phone remembers" but not that a phone wallet talks to its own server (README does).
- The local server serves its own source and tests (`GET /__main__.py` → 200); loopback-guarded, nothing secret.

## Claims table (README unless noted)

| Claim | Verdict | Evidence |
|---|---|---|
| "we, the operator, cannot learn who contributed" | TRUE | inbound shielded notes carry no sender; renderer reads only `ironwood_received_notes` |
| "replies to the sender's own wallet address travel directly between two wallets, never through us" | TRUE | reply txids `143f91ee`, `680a334a`, `9ecb9c7e` absent from wallet V |
| "anyone can re-render the whole work from one key and get the same hash" | TRUE | fresh clone + README key → `78d33def…` = live site |
| anchors `c46dd5de…`, `41530793…`, `9b6c1b9d…` at 4,522,002 | TRUE | two renders byte-identical; `test_chain_regression.py` |
| CI runs 39727405735 / 39732713347 / 39924480381 | TRUE | `gh run view` → success; 13 m 31 s as stated |
| "anchored in Bitcoin … block 972,742" | TRUE | `anchor verify` → VERIFIED 972742 08:41:36 UTC (two explorers) |
| "Every published render is stamped" | OVERSTATED | a failed stamp is a warning; the deploy ships without a proof |
| "the page sends nothing itself", "no request outside its own origin", strict CSP, no referrer | TRUE | live headers; `give.js` has no fetch; importmap hash matches |
| "fragments never reach a server log" | TRUE | `#tx=`, `#offering=`, `#give` only |
| "recomputes the render hash from the audio you hear" | TRUE | `web/verify.js:23-28` = `renderer/hashes.py:36`, byte for byte |
| "every 30 minutes and redeploys only when the render changed" | TRUE | `publish-web.yml:13`, gated on `changed` |
| "the key is in this README … never in code, tests, logs or commits" | TRUE | history: UFVK-shaped lines only in README + template |
| key "on the public site" (CLAUDE.md §6) | FALSE today | `key.txt` → 404 |
| "Once public it cannot be revoked" | TRUE | no viewing-key revocation in Zcash |
| "overwritten and deleted … best-effort" | TRUE | `session.py:268-298` shred/zero + fsync + unlink; tested |
| "a secret given as a command-line argument is refused" | TRUE | `kiosk/__main__.py:349`, `renderer/__main__.py:121`; tested |
| "The kiosk prints this statement before every send" | TRUE for `offer` | `speak` is the operator's own line, no statement |
| "refuses to run on a wallet that holds a spending key" | TRUE with escape hatch | `--allow-spend-key` |
| reply addresses "stored nowhere else", `score.json` only `has_reply` | TRUE | `score.py:36,44`; `whisper.py:44` re-reads the DB |
| Tor wording (default, fail-closed, timing, phones, CI direct) | TRUE | `renderer/network.py`; no devtool Tor→direct fallback (`remote.rs:186-192`) |
| "every lightwalletd connection the product makes goes over Tor" (`docs/network-fallback.md`) | FALSE for `smoke.sh` | `scripts/smoke.sh:17-19` |
| "No server of ours is involved." | OVERSTATED | the snapshot is served by our Vercel project, rendered by our CI |
| "121 passed, 2 skipped on a fresh clone" | STALE | 282 collected |
| evidence txids (36 choir-bound) | TRUE | all present in wallet V at the stated heights |
| §6 MUST "the choir's own spends are public" | MISSING in kiosk statement and give panel | README:110 only |

## Verified fine (one line each)

- Determinism: `renderer once --as-of 4522002` twice → `cmp` identical (score.json, render_hash, mix.wav); `as_of` is
  inside both hashes (4521999 vs 4522000 differ); canonical JSON `sort_keys, separators=(",",":")`; integer mixing;
  pinned subprocess env; sox `-D`; espeak on stdin + newline; decoder fingerprint uses uncached vectors.
- `web/god.js`: no `Math.random`, no `Date` in geometry; noise from `genes(render_hash)`; time only modulates.
- Protocol: 45 hostile memos → every one `ProtocolError <code>` or OK, zero uncaught exceptions; a NULL memo →
  `NotReady` fail-closed; one bad memo affects only its own tx; order is chain order; skiplist only adds `flagged`.
- Conductor: `is_change` comes from the wallet's nullifier match, not the memo; 13 live forgeries → `forged-conductor`;
  kind=1 on an own spend → `choir-own-spend`; kind=2 at the choir → `wrong-kind`; `sent_notes` fallback fills only a
  NULL memo on the same tx+output, V == B byte-for-byte.
- JS encoder parity: `web/tests/test_offering.py` executes node (`v18.19.1`); 363 B, 1101 B, emoji + reply, 1102 B
  "too long" identical both ways.
- `contrib_id`: `secrets.randbits(32)` / `crypto.getRandomValues`.
- `score.json` keys: `action_index bytes codec contrib_id has_reply height memos tx tx_index [conductor]`; no text,
  address, path or timestamp; live copy identical.
- Local server: traversal (`/out/../`, `%2e%2e`, `//etc/passwd`) → 404; `/eye` 404 until opened; foreign `Host`,
  missing port, cross-origin POST → 403; non-JSON or >8 KB body → 400; kiosk endpoints 404 without `--kiosk`.
- CI: no `set -x`; key written `umask 077`, shredded `if: always()`; `publish` job `contents: read`,
  `persist-credentials: false`; anchor jobs carry no secrets and push fast-forward only; wheels hash-pinned.
- `anchors` branch: 43 files, statement fields only, zero key/address/memo hits; served `anchor.json` sha256 equals the
  branch copy; served `.ots` (pending at deploy) verifies online → block 973082.
- Anchor verify: header sha256d, PoW floor (difficulty ≥ 1e13 after 700k), two explorers must agree, merkle root ==
  proof commitment; statement is 15 fixed fields, non-canonical bytes rejected.
- Vendored libs: three r160 and `qrcode-generator@1.4.4` sha256 equal THIRD_PARTY_NOTICES.md and the npm tarballs.
- Site: only `style-src 'unsafe-inline'` (style attributes); every score-derived DOM write is `textContent`; `innerHTML`
  only for server-made QR SVG on the installation server; no `eval`/`new Function`.
- Tor: all seven network commands get `--connection`; sync/enhance retried 3× same route; pay/send never retried in
  the wrappers; `seed_tor_cache` copies only `arti-cache` (public directory), never `arti-data` (guards).
- Kiosk: 10-confirmation rule by `recipient_key_scope`, unexpired pending spends excluded; multi-memo offering is one
  `pay` (no partial send); `DevtoolError` redacts addresses and memos; "sent. txid …" never claims mined.
- Git history (135 commits, all refs): no `wallets/`, `*.age`, `*.sqlite`, mnemonic or age secret ever tracked; full
  testnet addresses only in `config/choir.json`, `ai/phone-test/*.uri.txt`, `radio/payment_uri.txt`.
