# Auto-publish: the listener page refreshes itself

`.github/workflows/publish-web.yml` keeps the public listener page (`https://<slug>.vercel.app`, slug from
`config/brand.json`) current without the team laptop. Every 30 minutes a GitHub-hosted runner does what any
Watcher can do: it builds the renderer from source, summons the god from the published viewing key alone,
and deploys a new static snapshot to Vercel production **only when the render changed**.

## What one run does

1. **Checkout**, then compute the cache keys from the pins (`scripts/ci_build_tools.sh --key`).
2. **Tools.** Restore `bin/` (`devtool-aegis`, `c2enc`, `c2dec`) from the Actions cache. The key is the runner
   distro + arch, the devtool commit (`5a26ee8`), the sha256 of `scripts/patches/zcash-devtool-nu7.patch` and the
   Codec2 commit; the pins are read from `scripts/setup.sh`, so the two cannot drift. On a miss,
   `scripts/ci_build_tools.sh` builds them exactly as `setup.sh` steps 3–4 do (Codec2 `1.2.0` static with
   `-ffp-contract=off`, devtool + NU7 patch, `cargo build --release`) and saves the cache at once.
   `setup.sh` itself is not run: its smoke step needs `wallets/`.
3. **System packages**: `espeak-ng sox libsox-fmt-all` every run, plus the build packages on a cache miss.
   The runner is `ubuntu-24.04`, the same distro as the voice pins (espeak-ng 1.51, sox 14.4.2).
4. **Watcher wallet.** Restore `wallets/watcher` (view-only, created from the key) from the cache, so a run only
   syncs the blocks since the last saved copy. A new copy is saved when the restored one is 240+ blocks (~5 h)
   old, or at once when the restored copy failed and the wallet had to be re-created from the key.
5. **Key file.** The secret `CHOIR_UFVK` is written to `$RUNNER_TEMP/choir.key` with `umask 077` (mode 0600).
   It is shredded in an `if: always()` step right after the render, so also when the render fails.
6. **Render** (`scripts/ci_render.sh`): `python3 -m renderer summon --key-file …` (init-fvk on the first run,
   sync, enhance). A failed summon is retried once on the same wallet and once on a wallet re-created from the
   key. Then it checks that the wallet is scanned up to the chain tip lightwalletd reported (the upper bound of
   its scan queue) and syncs again, up to three times, if not; a wallet that stays behind fails the job. Then a
   second render at **the height of the newest transaction the key can see** (see below). The job **fails** if
   `decoder_matches_pin` or `voice_matches_pin` is false: that render_hash would be reproducible on no other
   machine, so it is never published.
7. **Compare** with the live site (`/out/render_hash` and `/static.json`). Same `render_hash`: the run stops with
   the notice *no new offering*. Live snapshot at a **higher** height (a manual `publish_web.sh` renders at the
   tip): also stop, a snapshot is never replaced by one at a lower height. Otherwise (or the site unreachable):
   continue.
8. **Build** `dist/` with `scripts/build_web.sh` (the allow-list check is in there) and **deploy** with the pinned
   CLI, `npx --yes vercel@62.7.0 deploy dist --prod --yes --token "$VERCEL_TOKEN"`, into the project named by the
   repo variables `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` (`scripts/ci_deploy.sh`). It then polls the production
   domain until it serves the new `render_hash` (2 min at most) and fails otherwise.

The console shows the height, the `render_hash` and, after a deploy, the deployment URL; the run's summary
page shows the same three. A concurrency group (`publish-web`) makes sure two runs never overlap.

### Why "the height of the newest transaction", not the tip

`as_of_height` is inside both hashes (CLAUDE.md §8), so a render at the tip changes with every block (~75 s)
and would redeploy every run. A render at the block of the newest transaction the key can see has the same
score as a render at the tip (nothing happened since), and its `render_hash` changes only when a new offering
or god line is mined, when `config/skiplist.txt` changes, or when the composer changes. The page prints that
height; anyone reproduces the published hash with

```bash
python3 -m renderer summon --key-file key.txt --birthday 4502962 --wallet wallets/watcher --as-of <height on the page>
```

Checked on 22 Oct with a copy of wallet V: newest transaction at 4,527,794 (tip 4,527,930), `ci_render.sh`
printed `render_hash 6ae73985…`, and `python3 -m renderer once --wallet wallets/test/V --as-of 4527794` printed
the same value.

## Schedule and its limits

- `cron: "*/30 * * * *"` (UTC) plus `workflow_dispatch` (Actions tab → publish-web → Run workflow, or `gh`).
- GitHub runs scheduled workflows on a best-effort basis: a run can start 5–30 minutes late, and under load a
  slot can be skipped. A new offering therefore reaches the page within ~30–60 minutes, not seconds. On stage,
  use the local page (`python3 -m web`), not the public snapshot.
- Schedules only run from the default branch (`main`). In a public repository GitHub disables schedules after
  60 days without repository activity; re-enable with the command under *Pause / resume*.

## Cost

Private repository (until 28 Oct): GitHub-hosted Linux minutes count against the account's monthly quota
(Free 2,000 min, Pro 3,000 min; each job is rounded up to the whole minute). Public repository (from 28 Oct):
standard runners are free.

| Run | Billed minutes (estimate, see *Measured* below) |
|---|---|
| tools cached, no new offering (almost every run) | 1–2 |
| tools cached, new offering → deploy | 2 |
| cache miss (first run, or a pin/patch change): builds the devtool | 15–25 |

48 runs a day ≈ 50–100 min/day ≈ 300–600 min from 22 to 28 Oct. A whole month as a private repository would be
1,500–3,000 min, more than GitHub Free includes; if the repository stays private, switch the cron to hourly
(`"0 * * * *"`) or pause it. Vercel: each deploy is a static deployment of ~4.5 MB (mostly `out/mix.wav`), and
deploys happen only when an offering arrives.

Caches (repository limit 10 GB, entries unused for 7 days are evicted): `bin/` ~100 MB before compression
(the devtool binary), cargo registry (cache miss only) a few hundred MB, watcher wallet ~6 MB per saved copy,
at most ~5 a day.

## Setup (once)

**Variables** (not secret; set on 22 Oct with `gh variable set` from the Windows Vercel link
`%LOCALAPPDATA%\<slug>-web\.vercel\project.json`):

| Variable | Value |
|---|---|
| `VERCEL_ORG_ID` | `orgId` from that file |
| `VERCEL_PROJECT_ID` | `projectId` from that file |
| `WATCHER_CACHE_GEN` | optional; unset means `1` (see *Reset the watcher wallet*) |

**Secrets**: a person adds them; no script and no assistant ever handles their values.

`CHOIR_UFVK`, from WSL (prints nothing; the temporary file is private and shredded):

```bash
cd ~/zecathon && (umask 077 && python3 -m kiosk reveal --from wallets/test/B --yes --to /tmp/eye.key >/dev/null) && "/mnt/c/Program Files/GitHub CLI/gh.exe" secret set CHOIR_UFVK --repo agadape/choronzon < /tmp/eye.key; shred -u /tmp/eye.key
```

`VERCEL_TOKEN`: create a token at <https://vercel.com/account/tokens> with the scope set to the account that
owns the project (the same scope as `VERCEL_ORG_ID`) and an expiry after judging, then, from Windows PowerShell,
paste it at the prompt:

```bash
gh secret set VERCEL_TOKEN --repo agadape/choronzon
```

Check (names and dates only, never values):

```bash
gh secret list --repo agadape/choronzon
```

First run: `gh workflow run publish-web.yml --repo agadape/choronzon`, then `gh run watch --repo agadape/choronzon`.

## Operate

| Want | Do |
|---|---|
| run now | `gh workflow run publish-web.yml --repo agadape/choronzon` |
| deploy even if the hash is unchanged (or the live snapshot is higher) | `gh workflow run publish-web.yml --repo agadape/choronzon -f force=true` |
| pause the schedule | `gh workflow disable publish-web.yml --repo agadape/choronzon` (or Actions → publish-web → ⋯ → Disable workflow) |
| resume | `gh workflow enable publish-web.yml --repo agadape/choronzon` |
| reset the watcher wallet once | `gh workflow run publish-web.yml --repo agadape/choronzon -f reset_wallet=true` |
| drop the watcher cache for good (corrupt copy) | `gh variable set WATCHER_CACHE_GEN --repo agadape/choronzon --body 2` (any new value) |
| publish from the laptop instead | `./scripts/publish_web.sh` (WSL, Windows Vercel CLI) |

The manual fallback renders wallet V at the **tip**, so its height is above the newest transaction. Scheduled
runs leave it up (they never replace a higher snapshot with a lower one) until an offering is mined above that
height; then they deploy as usual. `force=true` replaces it at once.

When a run fails, the page keeps serving the last good snapshot: nothing is deployed unless the render, the pin
check, the allow-list build and the deploy all succeed.

## What the runner holds and what the logs show

- The key lives in the secret, in a 0600 file under `$RUNNER_TEMP` during the render, and (as on every Watcher)
  inside the watcher wallet's database. GitHub masks the secret's value in logs. The devtool receives the key on
  its command line during `init-fvk`, which happens only on the first run and after a cache reset, on a
  single-use GitHub-hosted VM.
- The cached watcher wallet holds the viewing key and the decrypted offerings: no spending key, and nothing that
  is not public by design once the key is published (README + Séance, 28 Oct). Workflows of this repository can
  restore it; that is no more than holding the key.
- No step or script uses `set -x` (`scripts/tests/test_ci.py` checks it, together with secrets reaching steps
  only through `env:`). The renderer's own log (txids, heights, reason codes, hashes; never memo content, never
  addresses) stays on the runner; only its last lines are printed when a render fails.
- Logs of a public repository are public. They contain heights, txids and hashes, which the chain and the README
  already publish.
- `dist/` is the allow-list of `scripts/build_web.sh` (pages, scripts, `config/brand.json`, `out/score.json`,
  `out/mix.wav`, `out/render_hash`, `static.json`, `vercel.json`): no kiosk, no Whisper Back, no key.

## Measured

Filled in after the first runs (cache miss, then cache hit).
