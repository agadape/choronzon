# Network fallback — what if testnet.zec.rocks is down?

Probed 21 Oct 2026 (~12:40 UTC, from WSL). Method: `GetLightdInfo` via a copy of `spikes/s1_lightd.mjs` and
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
The only fallbacks are (1) Tor to the same server (below), (2) the pre-synced wallet DBs, (3) the demo video.

## Tor mode (devtool built-in) — WORKS

`bin/devtool-aegis wallet -w wallets/test/V sync -s zecrocks --connection tor` (arti, bundled; no tor daemon, no sudo).
- Bootstrap + sync of V to the tip: **~7 s** (12:40:42 → 12:40:49), `enhance` over Tor: ~10 s total.
- Result: `renderer once --wallet wallets/test/V --as-of 4525294` → `render_hash` = `8540a0a5…1af5` (matches the expected value) after syncing/enhancing over Tor.
- Tor helps if the problem is a path/ISP/venue-network block of zec.rocks; it does **not** help if zec.rocks itself is down. It also hides the venue IP from the server.
- Flags are per command: add `--connection tor` to every `sync` / `enhance` / `send` / `pay`. Default is `--connection direct`.

## Switching server (if a good one ever appears)

`-s <alias|host:port|https://host:port>` on every devtool command; for node spikes `LWD_TESTNET=host:port` (see `.env.example`).
Before trusting any new server: `node spikes/s1_lightd.mjs test` must show branch `77190ad9` and a height within a few blocks of zec.rocks.

## Operator procedure at the show

1. zec.rocks unreachable → try Tor: `bin/devtool-aegis wallet -w wallets/test/V sync -s zecrocks --connection tor` (then `enhance … --connection tor`); if that works, run the renderer/kiosk with the same flag.
2. Tor fails too → zec.rocks is down: stop sending, run the renderer on the **pre-synced wallet DBs** (`python3 -m renderer once --wallet wallets/test/V --as-of <height>`), say so on stage, and play the demo video for the live-send part. Never fake tx status.
