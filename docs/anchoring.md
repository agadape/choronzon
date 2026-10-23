# Anchoring: "it forgets nothing", provable against us

Every published state of the work is stamped in **Bitcoin** with [OpenTimestamps](https://opentimestamps.org).
Anyone can then check that a given render (its `score_hash`, `render_hash`, height, skiplist) existed no later than
a given Bitcoin block, and that we, the operator, did not quietly publish a different history afterwards: another
order of offerings, an edited `config/skiplist.txt`, a dropped offering. This is an **integrity** layer. It hides
nothing and adds no privacy.

## What it proves, and what it does not

| Proves | Does not prove |
|---|---|
| this exact `anchor.json` existed no later than the time of Bitcoin block N | that the chain data behind the hashes is complete (a render can only show what the key and lightwalletd let it see) |
| so its `score_hash` / `render_hash` / `skiplist_sha256` at `as_of_height` were fixed by then: a later, different render for that height is visibly not the anchored one | that the statement was made *at* that time (only *no later than*); a stamp proves existence, not authorship |
| | anything while the proof is **pending**: a pending proof is a calendar's promise, not yet in Bitcoin |

Calendars (and, when verifying, block explorers) see the IP of whoever contacts them. For the GitHub Actions path
that is a GitHub runner; from a laptop it is the laptop's IP (set `ANCHOR_SOCKS5=127.0.0.1:9050` to stamp
through a local Tor).

## The statement: `anchor.json`

`python3 -m anchor statement --out out` builds it from a render's `out/score.json`, the skiplist and the repo
commit. Canonical bytes (sorted keys, one field per line, ASCII, trailing newline): the same render always gives
the same bytes (`scripts/tests/test_anchor.py`). The builder copies these fields and nothing else, and validates
every value (`anchor.check`):

| Field | Meaning |
|---|---|
| `statement` | format version, `anchor/1` |
| `network` | `zcash-testnet` (from `config/choir.json`; only that field is read) |
| `as_of_height` | the render height |
| `score_hash`, `score_hash_version` | chain data only ("the blockchain is the score") |
| `render_hash`, `render_hash_version`, `composer` | score + decoded PCM + composer version |
| `decoder_fingerprint`, `voice_fingerprint` | the pinned Codec2 decoder and espeak-ng/sox voice |
| `g6_hash` | the legacy G6 regression hash at that height |
| `offerings`, `skipped` | counts |
| `skiplist_sha256` | sha256 of `config/skiplist.txt` as rendered |
| `repo_commit` | the commit whose code built the statement (`$GITHUB_SHA` in CI) |

Nothing private: no viewing key, no address, no memo content, no txid (tests refuse extra fields and look for
address and key prefixes).

## What leaves the machine when stamping

Read from the pinned client (`opentimestamps-client 0.7.2`, `opentimestamps 0.4.5`):
`otsclient/cmds.py stamp_command` hashes the file locally, appends 16 random bytes (a nonce), hashes again, and
`opentimestamps/calendar.py RemoteCalendar.submit` POSTs only that 32-byte digest to `<calendar>/digest`. The file
itself never leaves. Upgrading asks each calendar for `GET /timestamp/<its own commitment>`. Default calendars
(spike, 23 Oct 2026, `ots -v stamp`, 2-of-4, 4.5 s):

- aggregators contacted: `a.pool.opentimestamps.org`, `b.pool.opentimestamps.org`, `a.pool.eternitywall.com`,
  `ots.btc.catallaxy.com`
- the proof then waits at `alice.btc.calendar.opentimestamps.org`, `bob.btc.calendar.opentimestamps.org`,
  `finney.calendar.eternitywall.com`, `btc.calendar.catallaxy.com`

The digest is of public data anyway (every hash in the statement is already on the page).

## Where proofs live

1. **The page**: `https://<slug>.vercel.app/anchor.json` and `/anchor.json.ots` for the snapshot being served
   (`scripts/build_web.sh --stamp`; both are on its allow-list). The `.ots` served there is the one made at
   deploy time and stays *pending* on the page until the next deploy; the verifier below upgrades it on the fly.
2. **The `anchors` branch** of this repository: every statement ever deployed, append-only and
   content-addressed (`<height>-<sha256(statement)[:16]>.json` + `.ots`). Written by the `anchor` job of
   `publish-web.yml` after each deploy, and by `python3 -m anchor persist` from a laptop. Git plumbing only
   (`hash-object`, `mktree`, `commit-tree`, fast-forward `push`): files are only added; a proof is only replaced by
   its upgraded version. A new deploy replaces the site; it never touches this branch.

## Pipeline

| Step | Where | On failure |
|---|---|---|
| render, compare with the live site (unchanged guards: deploy only a new `render_hash`, never a lower height) | `publish` job | stop, nothing deployed |
| install the client into its own venv from hash-pinned wheels (`scripts/ci_anchor.sh`, `anchor/requirements.txt`) | `publish` job, only when deploying | warning; deploy goes on without a proof |
| `build_web.sh --stamp`: write `anchor.json`, stamp it (`python3 -m anchor stamp --soft`) | `publish` job | warning; deploy goes on |
| deploy | `publish` job | as before |
| add statement + proof to `anchors` | `anchor` job: `contents: write`, no secrets, `GITHUB_TOKEN` only | job fails, the site is already live; rerun it |
| upgrade pending proofs; stamp statements that have none | `anchor-upgrade.yml`, every 3 h + dispatch, `contents: write`, no secrets | retried next run |

The `publish` job (which holds `CHOIR_UFVK` and `VERCEL_TOKEN`) keeps `contents: read`; only the two jobs
without secrets can write, and only to `anchors`.

## Pending → in Bitcoin

A fresh proof is pending. Each calendar aggregates digests and publishes one Bitcoin transaction every few hours;
once it has a confirmation, `upgrade` adds the path from our digest to that block's merkle root. Typical: 1–6 h.

```bash
python3 -m anchor upgrade --branch                  # every proof on `anchors` (commits + pushes if any changed)
python3 -m anchor upgrade dist/anchor.json.ots      # one file, in place
```

`anchor-upgrade.yml` runs the first one every 3 hours.

## How to verify (judges)

Get a statement and its proof, from the page or the branch:

```bash
curl -fsSO https://<slug>.vercel.app/anchor.json && curl -fsSO https://<slug>.vercel.app/anchor.json.ots
```

Then any one of:

1. **No install**: on <https://opentimestamps.org> (in-browser stamp & verify), drop `anchor.json.ots`, then
   `anchor.json` when it asks for the stamped file. It says which Bitcoin block attests it, or that it is pending.
2. **Our helper, no Bitcoin node** (`pip install --break-system-packages opentimestamps-client==0.7.2` once):

   ```bash
   python3 -m anchor verify anchor.json
   ```

   It checks that the proof commits to `sha256(anchor.json)`, upgrades a pending proof from the calendars in
   memory, and for every Bitcoin attestation fetches the block hash at that height from **two** explorers
   (mempool.space and blockstream.info, which must agree), downloads the 80-byte header, checks that it hashes to
   that block hash and meets its proof-of-work target, and compares its merkle root with the proof's. Prints the
   block height, hash and time; exit 0 = in Bitcoin, 3 = only pending, 1 = does not match. Trust: you rely on the
   explorers agreeing on the block at that height (a header with valid proof-of-work is expensive to fake; a
   node removes even that).
3. **With a Bitcoin node**: `ots verify anchor.json.ots` (the reference client asks your `bitcoind`).

`ots info anchor.json.ots` prints the proof's operations offline.

Then check that the statement *is* the work: re-render from the published key at `as_of_height`
(`python3 -m renderer summon --key-file key.txt --birthday 4502962 --wallet wallets/watcher --as-of <height>`) and
compare `score_hash` / `render_hash`; check `skiplist_sha256` against `git show <repo_commit>:config/skiplist.txt |
sha256sum`. A different hash for an anchored height means the history was changed after it was anchored.

## Historic anchors

Stamped on 23 Oct 2026 from the laptop (wallet V, `renderer once --as-of <h>`), so they prove existence *no later
than* their Bitcoin block, not at the time the hashes were first computed (that is in `SPIKE_LOG.md` and git
history). Statements built by commit `7fcdc3c`; files on the `anchors` branch:

| Height | What | score_hash | render_hash | g6_hash | File |
|---|---|---|---|---|---|
| 4,522,002 | the G6 / score/1 / render/1 regression anchors (7 accepted) | `41530793…` | `9b6c1b9d…` | `c46dd5de…` | `4522002-5e7a489d70dcc34c.json` |
| 4,527,794 | the seeded corpus, the render the page served from 22 Oct (43 offerings) | `2649909b…` | `6ae73985…` | `747b446a…` | `4527794-e4700837f6db640b.json` |
