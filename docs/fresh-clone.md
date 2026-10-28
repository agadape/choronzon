# Fresh clone: evoke the god on a machine that has nothing but the key

This is the judge's path, run end to end on 21 Oct 2026 on a second clone of the repository
(`~/zecathon-clone`, WSL Ubuntu 24.04). Nothing was copied from the working checkout: no `wallets/`,
no `bin/`, no `vendor/`. Every command below was run as written; the times are what it took here
(8 logical cores, apt packages already installed, cold cargo cache).

What it proves: anyone who holds the published full viewing key can build the renderer from source,
create their own view-only wallet from that key, and print the same `score_hash` and `render_hash`
as the operator's own wallet at the same block height. The key is irrevocable and public, so a judge
needs nothing from us except the key itself.

## 1. Clone and build

```bash
git clone https://github.com/agadape/choronzon.git ~/zecathon-clone
cd ~/zecathon-clone
./scripts/setup.sh
```

The repository is private until 28 Oct, so before then the clone asks for a GitHub login. Inside WSL,
clone into the Linux filesystem (`~`), never under `/mnt/c`: cargo is slow there and the SQLite wallet
locks. No `sudo` is needed when the apt packages are already present.

`setup.sh` is idempotent and does, in order:

| Step | What | Measured |
|---|---|---|
| 1/6 | apt packages; escalates with `sudo` only when something is missing, otherwise prints `all apt packages present` | seconds |
| 2/6 | rustup if `cargo` is absent, `npm install` (gRPC client for the lightwalletd check), `pip install qrcode` | ~10 s |
| 3/6 | Codec2 tag `1.2.0` built from source into `bin/c2enc` and `bin/c2dec` (pinned: the decoder is part of `render_hash`) | ~40 s |
| 4/6 | zcash-devtool `5a26ee8` + the Aegis Gate NU7 patch, `cargo build --release` into `bin/devtool-aegis` | 8 m 37 s |
| 5/6 | looks for `wallets/`; on a fresh machine it prints `!! wallets/ missing` and carries on. **Expected.** | – |
| 6/6 | `scripts/smoke.sh` | ~25 s |

**Total: 9 m 34 s** wall clock (`time ./scripts/setup.sh`), exit code 0. The cargo step dominates and
scales with your core count. Rust prints about 20 deprecation warnings from the devtool crate; they
are harmless.

Expected tail of the output on a machine without wallets:

```
== 5/6 wallets ==
!! wallets/ missing. Unzip zecathon-wallets-TESTNET.zip into this directory (gives A, B=choir, V=view-only, L).
   Or create fresh ones: ./research/spikes/s3_wallets.sh init  (then fund A at https://faucet.testnet.valargroup.dev with its utest1… address)
== 6/6 smoke ==
[protocol unit tests]
  ✅ wb_protocol self-tests
[product tests]
  ✅ pytest: 121 passed, 2 skipped in 1.39s
[codec2 / tts]
  ✅ codec2 pinned (bin/c2dec)
  ✅ espeak-ng
[devtool]
  ✅ bin/devtool-aegis present
[lightwalletd testnet]
  ✅ testnet.zec.rocks reachable
[wallets] not present — skipping chain render
setup done. Tools: bin/devtool-aegis, bin/c2enc, bin/c2dec   Choir wallet: wallets/test/B   Public reader: wallets/test/V
```

The wallets archive is the team's testnet corpus (spending keys for the kiosk and the choir). A judge
does not need it: section 3 builds a wallet from the key alone.

## 2. Tests without wallets

```bash
python3 -m pytest        # 121 passed, 2 skipped in ~9 s
./scripts/smoke.sh       # exit 0 in ~25 s; ends with "[wallets] not present — skipping chain render"
```

The two skipped tests are the chain regression in `renderer/tests/test_chain_regression.py`, which
needs `wallets/test/V`. Everything else runs: wire format, phone envelope, the pinned decoder against
recorded PCM, the voice fingerprint, kiosk parsing, README generation.

## 3. Summon a Watcher from the published key

The key is the choir wallet's unified full viewing key (`uvftest1…`, one line of 512 characters). It
is published in the README and shown at the Séance; the operator prints it with
`python3 -m kiosk reveal`. Put it in a file (or in the `SUMMON_KEY` environment variable); the renderer
never takes it from our command line, so it stays out of your shell history; the wallet tool receives it on its
own command line for the moment `init-fvk` runs (the key is public, so this reveals nothing new).

`summon` connects over Tor by default. A fresh machine first downloads the Tor directory: a fresh Watcher took
633 s and 905 s over Tor in our runs (`docs/network-fallback.md`). `--connection direct` gives the same hash
faster (79 s at 4,527,794), but then lightwalletd sees your IP.

```bash
# key.txt holds the one line shown at the Séance
python3 -m renderer summon --key-file key.txt --birthday 4502962 --wallet wallets/watcher --as-of 4525294 --out out
cat out/render_hash
```

- `--birthday 4502962` is the block the god was born at (the first offering). Older is fine, just slower.
- `--as-of 4525294` pins the block height so two machines compare the same score. Without it the render
  is at the wallet's scanned tip; the height is part of both hashes, so two machines must agree on it
  before comparing.
- `wallets/watcher` is created on the spot (`init-fvk` from the key: no spending key anywhere), synced
  from `testnet.zec.rocks:443` and enhanced (memos are not in compact blocks), then rendered.

Measured on the fresh clone: **49.8 s** for create + sync from the birthday (about 22 000 blocks) +
enhance + render, exit code 0. Re-runs take seconds: the wallet persists and `summon` only syncs the
delta. The watcher wallet is 5.7 MB.

Expected last lines (the per-offering `INFO` lines above them list every txid in canonical order):

```
INFO rendered as_of=4525294 offerings=11 skipped=5 score_hash=94b8b3c5… render_hash=8540a0a5…
{
 "as_of_height": 4525294,
 "offerings": 11,
 "skipped": 5,
 "score_hash": "94b8b3c5244ee03361f1bf3a7c90d803bd02c774a9f79a7fc29d92b9121b596a",
 "render_hash": "8540a0a57d6f80d409d4ed5948789f64e524fc08252a15ea3bd904dd58fa1af5",
 "g6_hash": "5c4bce4e8a4aba4950720ee8df638324fc144cd7c032eb33e31ab176ebfe0489",
 "mix_seconds": 29,
 "decoder_matches_pin": true,
 "voice_matches_pin": true
}
```

### The comparison

| Machine | Wallet | `render_hash` at 4525294 |
|---|---|---|
| working checkout (`~/zecathon`) | `wallets/test/V` (view-only, synced since 19 Oct) | `8540a0a57d6f80d409d4ed5948789f64e524fc08252a15ea3bd904dd58fa1af5` |
| fresh clone (`~/zecathon-clone`) | `wallets/watcher` (built from the key during this run) | `8540a0a57d6f80d409d4ed5948789f64e524fc08252a15ea3bd904dd58fa1af5` |

**Identical**, byte for byte, including `score_hash` (`94b8b3c5…`) and the decoded audio that
`render_hash` covers. The 5 skipped entries are the same on both sides and each is logged with its
reason: three `not-protocol` memos from the spike days before the wire format existed, one
`choir-own-spend` that carries no conductor line, and the forged conductor line `b126b3c7…`
(`forged-conductor`, sent from a wallet that is not the choir). They stay on chain and are never sung.

`out/score.json` carries both hashes and the full score; `out/mix.wav` is the audio. The renderer
refuses to run on a wallet that holds a spending key, so a Watcher can only ever be a reader.

## 4. Listen on the clone

```bash
python3 -m web --port 8766      # any free port; 8080 is taken on the team machine
```

Open http://localhost:8766 : the page reads the clone's own `out/score.json` and `out/mix.wav`, grows
the creature from the score timeline, plays the mix and shows both hashes. Checked in this run: the
page served from `~/zecathon-clone` shows `8540a0a5…`, the same value as the working checkout's page
on port 8765.

## 5. Clean up

```bash
rm -rf ~/zecathon-clone key.txt
```

`wallets/watcher` holds no secret (the key is public); deleting it only costs the next sync.

## What this run changed

- `scripts/setup.sh`: the Codec2 clone printed git's "detached HEAD" lecture (a tag checkout). Silenced.

Everything else worked unchanged on the fresh clone: executable bits survive the clone, the apt step
skips itself when the packages are present (no `sudo`), the NU7 patch applies cleanly, `npm install`
needs the network only for the first install, and `summon` creates `wallets/` itself.
