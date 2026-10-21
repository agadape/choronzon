# Failure drills (Day 7, 21 Oct 2026)

Each drill is a real failure against the product code on testnet. The rule from the demo script: never fake
transaction status; when something fails, the screen says so.

Explorer links below did not resolve on 21 Oct 2026: the public explorer testnet.zcashexplorer.app followed a
different testnet chain that day (its block 4,487,269 has another hash than the one testnet.zec.rocks serves, and
every txid here returned "Transaction Not Found"). The evidence is our own synced wallet: `bin/devtool-aegis wallet
-w wallets/test/V list-tx` after `sync`; the kiosk says the same after every send.

| # | Failure | How it was provoked | Observed behaviour | Verdict |
|---|---|---|---|---|
| 1 | lightwalletd unreachable / stale sync | `python3 -m renderer daemon --server nonexistent` | Every loop logs `WARNING devtool sync failed with exit code 2; rendering what is already synced` and keeps writing `out/` at the last scanned height (4,525,294); no crash, no address in the message | OK |
| 2 | Overspend / insufficient funds | `Devtool.send(choir, 50 TAZ)` from wallet L | `DevtoolError: devtool send exit 1: Error: Insufficient balance (have 0, need 5000010000 including fee)`; fails before any broadcast, so no note is locked | OK |
| 3 | Malformed memo on chain (CRC flipped) | a v1 memo with a corrupted CRC paid to the choir from L: [`a84adbaf…`](https://testnet.zcashexplorer.app/transactions/a84adbaf35cf3688b02db9e5f23c654e0e684e785a24dde41fb75a836443dcd8), block 4,525,319 | `skip tx=a84adbaf… reason=crc-mismatch`; offering count unchanged (11); render continues; the tx stays on chain and is listed under `skipped` in `score.json` | OK |
| 4 | Duplicate memo (same bytes, two transactions) | the same v1 memo (`contrib_id` 777) paid twice from A: [`11f9bd73…`](https://testnet.zcashexplorer.app/transactions/11f9bd7384c7b304d29ab8c7c41c9ff5bbb5bc0db39a5f7494fd1a2842f1c4d1) then [`103dec1c…`](https://testnet.zcashexplorer.app/transactions/103dec1cbd777f8ef036c1e2799cc6b4a6b4149b8562ebba33f558157e16122d), both in block 4,525,321 | both accepted as separate offerings (11 → 13), same `contrib_id`, unique key = txid. The one sent second (`103dec1c…`) renders first: **miner order inside a block, not send order**, observed again | OK |
| 5 | Failed broadcast → locked note | not provoked on purpose, but it happened: a `pay` from A hit `connection reset` at lightwalletd; the wallet recorded tx `6a0f8588…` as sent (change pending) while the network never saw it | At height 4,525,323 the tx is still unmined; its input note (0.002 TAZ) is locked until expiry 4,525,360 (~37 blocks ≈ 20 min). A kept sending from its other notes (drill 4 ran right after): **the note pool is the mitigation**. The kiosk session splits funds into N notes (`session open --notes N`); one locked note costs one offering, not the session; `session status` shows notes left. Closed at tip 4,525,495: `6a0f8588…` is still unmined, expiry 4,525,360 has passed, wallet A shows `locked_value` 0 and 9,204,000 zat spendable, so the note was released at expiry as expected | OK (observed, closed) |
| 6 | Slow block / long confirmation | nothing to provoke: testnet blocks are ~35 s, sometimes minutes | The kiosk prints the txid and the explorer link immediately and says the explorer shows only that a shielded tx exists; the renderer shows the offering only once mined and enhanced (40–100 s observed) | honest by design |
| 8 | Stale chain tip → transaction expired before broadcast | found by rehearsal #1 (`scripts/demo.sh`): the kiosk session paid without syncing first; the wallet built the tx with an expiry height already behind the chain (`transaction must not be mined at a block Height(4525333) greater than its expiry`) | Rejected at broadcast; because the expiry was already past, no note stayed locked (6 notes spendable right after a sync). **Fixed:** `Session.offer` syncs before `pay`; the rehearsal script catches this class of error without faking a result | fixed |
| 7 | Listener wallet runs dry | wallet L after several replies: `have 0` spendable while its change waits for 3 confirmations | `renderer whisper --send-from` fails with the sanitized insufficient-balance error; the QR/URI path still works with any other wallet | OK (keep the demo listener funded with several notes) |
| 9 | Listener's only note locked by a failed broadcast | rehearsal #4 (`scripts/demo.sh`, 21 Oct): `renderer whisper --send-from L` built tx `1357d115…` (expiry 4,525,567), the broadcast failed, the wallet kept it as unmined and L's single 0.00934 TAZ note was its input | The whisper step failed, then waited 7 min for a reply that could not come; the run was reported FAIL (nothing faked). The Python traceback hid the sanitized cause because the script only grepped for `txid`. **Fixed:** `renderer whisper` now exits with `cannot send the whisper from L: …`; the script prints that line; and preflight runs `python3 -m kiosk pool wallets/test/L --notes 3`, which counts spendable notes the way the wallet does (depth, pending spends, expiry), waits for locked funds and splits them. Drill 7's advice is now enforced by the script | fixed |

## Rehearsal runs (`scripts/demo.sh`, 21 Oct 2026, testnet)

Every run sends real transactions: one offering with a reply address from the ephemeral session wallet, one direct
whisper from L, one conductor line from the choir wallet B, one forgery from A, and ends with a Watcher built from
the published key alone. `TIMES` is the script's own line: the second at which each step finished, counted from the
start of the run. Logs: `logs/demo_<timestamp>.log` (git-ignored; txids, heights, hashes, timings only).

| run | start (UTC) | commit | TIMES (s from start) | total | result |
|---|---|---|---|---|---|
| 1 | 11:01 | 761d6d4 | preflight=6 evoke=7 offer=13 heard=13 whisper=13 god=121 summon=154 | 154 s | FAIL, step 2: the session wallet paid from a stale tip, the transaction expired before broadcast (drill 8); fixed: `Session.offer` syncs first |
| 2 | 11:04 | 761d6d4 | preflight=6 evoke=7 offer=16 heard=242 whisper=466 god=528 summon=568 | 568 s | FAIL, step 5: the choir wallet had 0 spendable zat (change pending); fixed: B topped up with 0.005 TAZ from A (`1fd5848d…`, block 4,525,497) |
| 3 | 12:12 | 761d6d4 | preflight=14 evoke=15 offer=30 heard=72 whisper=208 god=377 summon=445 | 445 s | PASS |
| 4 | 12:20 | 761d6d4 | preflight=16 evoke=18 offer=46 heard=143 whisper=858 god=1006 summon=1057 | 1057 s | FAIL, step 4: L's only note was locked by a failed broadcast (drill 9); fixed: listener pool in preflight, whisper errors reported |
| 5 | 12:44 | (uncommitted) | preflight=15 evoke=16 offer=31 heard=120 whisper=836 god=1784 summon=1840 | 1840 s | FAIL, steps 4+5: the pool count said 4 notes, the wallet said 0 spendable (split outputs to an external address need 10 confirmations, not 3); the conductor line hit a lightwalletd TLS reset; the forgery took 35 blocks to be mined. Fixed: pool count by key scope + wallet cross-check, one retry per send, no reply wait after a failed send |
| 6 | 13:22 | 4374796 | preflight=20 evoke=21 offer=34 heard=161 whisper=237 god=361 summon=415 | 415 s | PASS |
| 7 | 13:29 | 4374796 | preflight=15 evoke=16 offer=28 heard=170 whisper=218 god=345 summon=406 | 406 s | PASS |
| 8 | 13:36 | 4374796 | preflight=16 evoke=18 offer=30 heard=96 whisper=147 god=353 summon=412 | 412 s | FAIL, step 4: both whisper attempts (30 s apart) hit the lightwalletd TLS reset; each failed attempt had built a transaction, so two notes of L stayed locked until expiry (~18 min). The conductor line and the forgery went through 50 s later. Fixed: four attempts with pauses of 20/40/60 s; the pools absorb the locked notes |
| 9 | 13:44 | 4374796 + retry patch | preflight=8307 evoke=8308 offer=8317 heard=8394 whisper=8512 god=8590 summon=8629 | 8629 s (demo itself 322 s) | PASS. Preflight waited 2 h 18 min: `kiosk pool` held the run until L's two notes locked by run 8 were released at expiry, and every wallet sync took ~25 min while lightwalletd was slow (five iterations). Once the pool was back to 4 notes the demo ran in 322 s with no retry |

What the green runs say about the live demo:

- **The two block waits dominate.** Of a 7-minute run, roughly 2 min is "offer heard" (the offering has to be mined
  and the public-key wallet synced + enhanced) and 1–2 min is "whisper received" (the reply has to be mined and the
  session wallet synced). Everything else is seconds. In the live demo those two waits must be covered by narration
  (the lore, the privacy model, the Eye) and not by silence; the explorer cannot be used as a stopgap because it
  may follow another fork (see the note at the top of this file).
- Testnet is uneven: a block every ~35 s on average, but a transaction was once mined 35 blocks after broadcast
  (run 5) and lightwalletd closed a TLS connection mid-send. The script retries one send once; the pre-sent
  offerings in the demo script are the fallback if the live one is late, and they are labelled as pre-sent.
- Each run consumes one note of the session wallet, one of L, one of B and one of A; `session status` and
  `kiosk pool` say how many are left before the show.
