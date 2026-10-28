# Network fallback — what if testnet.zec.rocks is down?

Probed 21 Oct 2026 (~12:40 UTC, from WSL). Method: `GetLightdInfo` via a copy of `research/spikes/s1_lightd.mjs` and
`bin/devtool-aegis wallet -w wallets/test/V get-info -s <server>` (read-only). Our chain = `test`, consensus branch `77190ad9` (NU7).

## Servers tested

| Server | Chain | Branch id | Height (zec.rocks = 4525554) | Latency | Verdict |
|---|---|---|---|---|---|
| `testnet.zec.rocks:443` (alias `zecrocks`, ECC lightwalletd v0.5.4) | test | `77190ad9` | 4525554 | ~1.3 s | **works, our only usable server** |
| `testnet.lightwalletd-rs-beta.zecdev.org:443` (lightwalletd-rs 0.2.0) | test | `37a5165b` | 4417161 (~108k blocks behind) | ~1.2 s | **rejected: other branch / stale, not our NU7 chain** |
| `zaino.testnet.unsafe.zec.rocks:443` (Zaino) | – | – | Hosh listed 4395574 (stale) | – | **rejected: HTTP 503 now; stale per Hosh** |
| `lwd.testnet.zec.pro:443` | – | – | – | – | down: HTTP 521 |
| `testnet.lightwalletd.com:443/9067` | – | – | – | – | down: DNS does not resolve |
| `testnet.zec.rocks:9067` | – | – | – | – | no listener (socket disconnected) |
| `lightwalletd.testnet.electriccoin.co:9067` | – | – | – | – | timeout (15 s) |
| `*.zecdev.org`, `testnet.zec.pro` (guessed names) | – | – | – | – | DNS does not resolve |
| Logos onion testnet server (port 9067) | – | – | – | – | not tested: needs an `.onion` address we do not have; third party, reported "still syncing" |

Sources: Hosh uptime page https://hosh.zec.rocks/zec (lists only the zaino testnet server), the lightwalletd-rs forum thread,
https://github.com/logos-co/logos-zcash-node-module/pull/4 (states testnet had **one** NU7-capable public server: testnet.zec.rocks).

**Conclusion: no second public testnet lightwalletd serves our NU7 chain.** Step "sync V against an alternative and compare the hash" was
therefore not possible. Do not point a wallet at the zecdev server: it is on another fork and would just report nothing useful.
The only fallbacks are (1) direct or Tor to the same server (Tor is the default, below), (2) the pre-synced wallet
DBs, (3) the demo video.

## Tor mode (devtool built-in) — the DEFAULT since 23 Oct

Every lightwalletd connection the product makes goes over Tor by default: kiosk (`session open`, `offer`, `speak`,
`inbox`, `pool`), the web kiosk, Whisper Back sends (`renderer whisper --send-from`), the renderer (`once --sync`,
`daemon`, `summon` incl. its `init-fvk`) and `scripts/demo.sh`. The devtool bundles Arti (no tor daemon, no sudo);
`renderer/network.py` adds `--connection tor` to every devtool command that opens a connection
(`sync enhance send pay init init-fvk get-info`) and to nothing else.

- **Choosing direct is deliberate:** `--connection direct` on the kiosk / renderer command, or `LWD_CONNECTION=direct`
  (also for `scripts/demo.sh`). Any other value is refused. lightwalletd then sees this machine's IP address.
- **GitHub Actions publisher stays direct:** with `GITHUB_ACTIONS=true` and no `LWD_CONNECTION`, the default is
  `direct`. The scheduled render runs on a GitHub machine from the public key; its IP protects nobody, and Tor there
  would only add flakiness. Nothing else changes in `scripts/ci_*.sh`.
- **Fail closed:** if Tor cannot connect, the command fails with exit 1 and a message that names the escape hatch.
  Neither our code nor the devtool falls back to direct (devtool `remote.rs`: `BuiltInTor` → `connect_over_tor`,
  errors propagate; the only direct path in that branch is for a plain-http localhost server).
- **Same-route retry:** `sync` and `enhance` only read and resume where they stopped, so the renderer retries a
  failed one up to 3 times over the same route (10 s apart). Sends (`pay`/`send`) are never retried by the wrapper:
  `scripts/demo.sh` retries them with the note pools, as before.
- **Hashes:** the route changes nothing in the data. Measured below: the render/1 anchor and the live hash are
  identical over Tor and direct.
- Not covered: a phone contribution (`kiosk qr` → Zingo!) is sent by the phone's own wallet to its own server.
- Tor helps against a path/ISP/venue block of zec.rocks and hides the client IP from the server; it does **not** help
  if zec.rocks itself is down, it does not hide *when* a transaction appears on chain, and the sending wallet still
  stores what it sent.

### Measured (23 Oct 2026, WSL, wallet V a few blocks behind the tip)

| What | Tor | Direct |
|---|---|---|
| `sync` (3 runs) | 10.8 / 11.4 / 17.7 s | 1.3 / 1.7 / 2.5 s |
| `enhance` (3 runs) | 14.9 (exit 1, see below) / 9.7 / 16.3 s; 6 more: 9–22 s, all ok | 3.6 / 2.9 / 3.1 s |
| sockets the devtool opened (`ss -tnp`, 50 ms samples) | Tor relays only (`89.58.48.237:9001`, `2.56.164.157:443`); **no** zec.rocks IP | `66.241.124.102:443` = testnet.zec.rocks |
| self-send 0.001 TAZ from A (`sync` + `send`, 3 runs, not offerings) | run 1 **failed** after 27 s ("Timed out while waiting for answer from exit"); run 2 **failed** after 20 s (TLS reset); run 3 10.6 + 16.7 s (`5de38970…`, mined 4,531,909) | 1.7 + 7.5 s, 2.6 + 8.9 s, 3.5 + 7.1 s (`78e5e0e6…`, `49367cc5…`, `a5821f61…`) |
| kiosk `session open --notes 8` (cold Tor state, before the cache seeding) | 994 s, ready; funding `68653009…` (sent in 18 s), split `7157641b…` (25 s) | — |
| kiosk `offer` from that session | 18 s, `fc4dd939…103c` (the Tor-layer test offering) | — |
| `renderer once --sync --as-of 4522002` | `9b6c1b9d…2bc0` (= render/1 anchor), 7 offerings | — (anchor, unchanged) |
| Watcher from the key alone (`renderer summon`, empty dir), `--as-of 4527794` | 905 s (cold Tor bootstrap inside `init-fvk` 10 min 51 s, sync + render 4 min 14 s), `6ae73985…444e` | 79 s, `6ae73985…444e` |
| same, wallet V (`once --sync --as-of last`, Tor) | `6ae73985…444e`, 43 offerings, 16 skipped = the live page | — |
| `mix.wav` sha256, V / Tor Watcher / direct Watcher | `0ebf92c5…1ade9`, identical in all three | |

- One `enhance` over Tor failed (exit 1) in 9 runs; the cause was not captured. The renderer now retries it on Tor.
- **Sends are less reliable over Tor:** 4 of 6 sends over Tor went through (3 of 3 kiosk sends, 1 of 3 self-sends);
  3 of 3 direct. A failed send is never retried by the wrapper. The run-2 failure had already built a transaction
  (`f2a373a4…`, expiry 4,531,945) before the connection broke: its notes stay locked until expiry, and a send that
  reports failure may still have reached the server. Retry only from a note pool, and check the chain before
  sending the same offering again: `scripts/demo.sh` retries `speak` and `whisper` from pools but does not check
  whether a failed attempt landed (the kiosk `offer` itself is never retried). Outcome this time: `f2a373a4…`
  was never mined (A scanned to 4,531,947, past its expiry; ZecBlock: not found), so nothing went out twice.
- A Watcher's **first** contact over Tor is slow: Arti downloads the Tor directory into `<wallet>/tor/` (~40 MB)
  before the first request. On 23 Oct a fresh `init-fvk` over Tor took 5 min 46 s in one run and 10 min 51 s in
  another; in the first run the full sync (~25,000 blocks) then broke with "stream closed because of a broken
  pipe", and the same-route retry was added for that (the second run needed no retry). A judge who wants the hash
  fast can choose `--connection direct` for `summon`: the hash is the same. Later commands reuse the cache (warm sync ~11 s). Same cold cost for the operator wallets: the first
  `kiosk session open` over Tor spent 7 min 45 s before funding (cold `sync` of the pool wallet A + cold `init` of
  the session wallet).
- **Seeded cache (kiosk):** the Tor directory is public data, so `session open` copies `tor/arti-cache` (only that,
  never `tor/arti-data` with the guards) from the pool wallet into the new session wallet. Measured on copies of V:
  cold `sync` 93.0 s vs seeded 18.3 s; a seeded `init` of a throwaway wallet over Tor 10.3 s, and it picked its own
  fresh guards.

### Tor failure drills (23 Oct 2026)

1. Tor cannot start, network fine: a copy of V whose `tor` path is a plain file. `sync --connection tor` → exit 1
   at once (`Error: File exists (os error 17)`), **no socket opened**. `renderer once --sync` and the kiosk wrapper
   both stop with: `… [over Tor: if Tor cannot connect from here, rerun deliberately with --connection direct (or
   LWD_CONNECTION=direct); lightwalletd will then see this machine's IP address]`.
2. No network at all (`unshare -rn`): `sync --connection tor` → exit 1 after 30.7 s (`transport error: deadline has
   elapsed`). `renderer once --sync` in the same namespace: two `retrying over tor` warnings, then exit 1 after
   112 s with `devtool sync failed … (3 attempts over tor) [over Tor: … --connection direct …]`.

### Where Arti keeps its state

`<wallet dir>/tor/`: `arti-cache/` (the public Tor directory: consensus + microdescriptors, ~40 MB) and
`arti-data/state/` (`guards.json` = the guard relays this wallet uses, `circuit_timeouts.json`). Inside `wallets/`,
so git-ignored. Checked on V: no own public IP, hostname or server name in any file. A kiosk session's Tor state is
deleted with the session (`session close`), so each session starts with new guards; V and the operator wallets keep
theirs. Nothing about Tor is written to our logs (devtool output is never echoed).

## Switching server (if a good one ever appears)

`-s <alias|host:port|https://host:port>` on every devtool command; for node spikes `LWD_TESTNET=host:port` (see `.env.example`).
Before trusting any new server: `node research/spikes/s1_lightd.mjs test` must show branch `77190ad9` and a height within a few blocks of zec.rocks.

## Operator procedure at the show

1. Everything already runs over Tor. If a command fails with the "[over Tor: …]" message, check plain reachability:
   `bin/devtool-aegis wallet -w wallets/test/V sync -s zecrocks --connection direct`.
2. Direct works, Tor does not (the venue blocks Tor) → decide on purpose, and say it on stage: lightwalletd will see
   the venue IP. Then `export LWD_CONNECTION=direct` for the kiosk, renderer and `scripts/demo.sh`.
3. Both fail → zec.rocks is down: stop sending, run the renderer on the **pre-synced wallet DBs** (`python3 -m renderer once --wallet wallets/test/V --as-of <height>`), say so on stage, and play the demo video for the live-send part. Never fake tx status.

## Rehearsal over Tor and the Watcher's cold start (24 Oct)

- `./scripts/demo.sh` over Tor (default): **PASS** in 1,124 s (log `logs/demo_20261024T105133Z.log`). Offering `d4d69be5…` heard after 80 s, whisper `7b7c65ee…` received after 87 s, god line `a1edea89…` accepted after 87 s, forgery `e117d0bf…` refused as `forged-conductor` after 25 s, Watcher = V = `8b332fe6…` at 4,535,682 with the same audio.
- The Watcher step took **633 s**: a new wallet downloads the whole Tor directory (~40 MB) before its first sync.
- Fix: `renderer summon --tor-cache-from <warm wallet>` copies only the public directory cache (`tor/arti-cache`, never the guards in `tor/arti-data`), as `kiosk session open` already does. `demo.sh` passes `--tor-cache-from wallets/test/V`. Measured: a fresh Watcher over Tor from the key alone in **129 s**, same `render_hash` `8b332fe6…`.
- On a real second laptop: run one Watcher (or one Tor sync of any wallet) there before the show so its cache is warm, then pass `--tor-cache-from` that wallet.

## Rehearsals after the privacy fixes (25 Oct)

| Run | Log | Result | Cause / fix |
|---|---|---|---|
| 1 | `logs/demo_20261025T094951Z.log` | FAIL at the live offer | the kiosk's pre-pay `sync` over Tor died ("stream closed because of a broken pipe") and was not retried. Fix `df135d9`: kiosk `sync`/`enhance` retry 3x over the same route; `pay`/`send` never retry |
| 2 | `logs/demo_20261025T100331Z.log` | FAIL in preflight | `demo.sh`'s own sync of B over Tor dropped once. Fix `db97866`: preflight syncs retry 3x over the same route |
| 3 | `logs/demo_20261025T100439Z.log` | **PASS, 637 s** | offering `9722cf47…` heard after 60 s; whisper `a523f45c…` received by `kiosk inbox <contrib_id>` after 90 s; god line `c24752f1…` accepted after 88 s; forgery `be4a48ee…` refused as `forged-conductor` after 28 s; Watcher over Tor with the seeded cache in 173 s, `78d33def…` at 4,539,886, same audio |

Tor drops a stream now and then (twice in two runs on 25 Oct). Read-only calls are retried over the same route; a send is never retried automatically. On stage keep `LWD_CONNECTION=direct` as the deliberate fallback (it tells lightwalletd the venue IP; say so).

