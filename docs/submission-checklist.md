# Submission checklist (deadline 28 Oct 2026, one submission, one track: Wildcard)

Rules recap (from `SPIKE_LOG.md`): all code written in the window, open source by 28 Oct, one submission, one
track, prize paid in ZEC to a shielded address. The repo stays private until the day of submission.

## Before making the repository public

- [ ] `python3 -m pytest -q` green on a fresh clone (`docs/fresh-clone.md`); `./scripts/smoke.sh` exits 0
- [ ] `python3 scripts/gen_readme.py --check` passes (README, brand SVGs, package name generated from `config/brand.json`)
- [ ] `./scripts/demo.sh` passed on the day (see the rehearsal table in `docs/failure-drills.md`)
- [ ] secret scan of the full history: no `wallets/`, `logs/`, `*.age`, `*.sqlite`, `*.zip`, `*.key`; no `uvf…`/`uvi…` keys,
      no mnemonics (`git log --all -p | grep …`, see `docs/privacy-review.md`)
- [ ] `LICENSE` (MIT) and `THIRD_PARTY_NOTICES.md` present; the NU7 patch's origin credited
- [ ] README privacy section still the exact §6 wording; no "anonymous" / "untraceable" anywhere in product copy
      (`git grep -niE "anonymous|untraceable" -- README.md docs/README.template.md kiosk web`)
- [ ] `config/skiplist.txt` reviewed: anything on chain that must not be sung at the show is listed with a reason
- [x] decided 22 Oct: the choir's full viewing key is published in the README on submission day **and** revealed on
      stage at the Séance
- [ ] **Submission day: the publication act.** Last step before the repository goes public, after every box above is
      ticked and the final secret scan is clean. `CLAUDE.md` §6 forbids the key in code, tests, logs or commits until
      this moment; after it the key is public forever and cannot be revoked.
      1. `python3 -m kiosk reveal --from wallets/test/B --to /tmp/eye.key` (type `OPEN`; the file lives outside the
         repo; never under `logs/`, never piped through `tee`)
      2. open `docs/README.template.md` in an editor and replace the HTML-comment placeholder under "### The key" **by
         hand** (no script, no `sed`) with a fenced text block holding the key on one line, the birthday height
         4502962, and the one-line command a reader runs after saving the key as `eye.key`:
         `python3 -m renderer summon --key-file eye.key --birthday 4502962 --wallet wallets/watcher` (the key goes in a
         file, never on a command line). In the paragraph above it, change "possibly pasted here" to "pasted here".
      3. `python3 scripts/gen_readme.py`, then `python3 scripts/gen_readme.py --check`; `git status` shows only
         `docs/README.template.md` and `README.md` changed
      4. commit with a message that says this is the deliberate publication act (e.g. "README: publish the choir's
         full viewing key (deliberate publication act, irrevocable)", via `git commit -F`), then push
      5. `shred -u /tmp/eye.key`
      6. re-run the secret scan (dry-run check 4): the key must now appear only in `README.md` and
         `docs/README.template.md`, and only from the publication commit on

## Submission form (thezecathon.com)

- [ ] project name, tagline, one-liner: copy from `config/brand.json`
- [ ] track: Wildcard
- [ ] repository URL (public by then), commit hash of the submitted state, licence
- [ ] demo video link (Day 8): real transactions, explorer shown, the two-laptop hash moment, whisper back
- [ ] a short "why Zcash" paragraph: the README's "Why it needs Zcash" table
- [ ] evidence: `docs/evidence-index.md` (every claim → txid → block)
- [ ] team members and roles (A/B/C still unassigned in `TODO.md`)
- [ ] shielded payout address: a fresh address from a wallet the team controls, **not** a testnet address and not
      any wallet in this repo; verify it parses (`protocol.is_unified_address`) and keep it out of the repository

## After submission

- [ ] tag the submitted commit (`git tag -a zecathon-2026 -m "submitted"`), push the tag
- [ ] keep `wallets/`, `logs/` and the submitted `out/` locally (evidence), do not delete the testnet wallets
- [ ] post-hackathon items stay in `TODO.md` (grant proposal, Zcon email, Tor, Piper)

## Dry run 22 Oct 2026

Everything above that a script can check, run on the working checkout in WSL (wallets present) between `efb600a` and
`db56891` (only docs changed in between), with no transaction, no spend and nothing made public. The boxes above stay open: they are ticked on submission day. Raw output
of pytest + smoke: `logs/dryrun_20261022.log` (git-ignored, kept locally).

| # | Check | Command | Result |
|---|---|---|---|
| 1 | Tests | `python3 -m pytest -q` | **PASS**: exit 0, 142 passed in 5.4 s (includes the chain regression; a fresh clone without wallets gave 121 passed, 2 skipped on 21 Oct, `docs/fresh-clone.md`) |
| 2 | Smoke | `./scripts/smoke.sh` | **PASS**: exit 0; G6 regression `c46dd5de…` with 7 accepted; health at 4,527,834: V and B agree (`94383f71…`); lightwalletd reachable |
| 3 | Generated files | `python3 scripts/gen_readme.py --check` | **PASS**: README, brand SVGs and package name up to date |
| 4 | Keys in history | `git log --all -p`, regex `(uvf\|uvi\|uivk\|uview\|zxview\|secret-extended-key)[a-z0-9]{30,}` | **PASS**: 3 hits, all one dummy in `kiosk/tests/test_kiosk.py` (added in `e873362`, replaced by `uvftest1qqqq…` in `4374796`): 54 chars = the 18-char prefix already public in `CLAUDE.md` + filler `0123456789abcdef…`. Not a prefix of any wallet's 512-char UFVK (compared with B, V and A without printing them) |
| 5 | Age identities | `git log --all -p \| grep AGE-SECRET-KEY` | **PASS**: 0 |
| 6 | Mnemonics | every added/removed line of `git log --all -p` with ≥ 12 consecutive BIP39 words (bip0039 English list) | **PASS**: 0 |
| 7 | Forbidden paths | `git log --all --name-only` matched against `wallets/`, `logs/`, `*.age`, `*.sqlite`, `*.db`, `*.zip`, `*.key` | **PASS**: 0 of 135 paths ever committed; `git check-ignore` covers `wallets/`, `logs/`, `bin/`, `vendor/`, `*.age` |
| 8 | Licences | `ls LICENSE THIRD_PARTY_NOTICES.md`; `sha256sum scripts/patches/zcash-devtool-nu7.patch` | **PASS**: MIT licence present; notices credit Aegis Gate for the NU7 patch; patch sha256 `0ea94fe3…` = the value recorded in the notices |
| 9 | Forbidden wording | `git grep -niE "anonymous\|untraceable\|no one will ever know\|nobody can ever" -- README.md docs/README.template.md kiosk web docs/submission-form.md docs/demo-script.md docs/lore.md docs/user-test-kit.md` | **PASS**: only the expected lines: `README.md:111` and `docs/README.template.md:111` ("What we never claim: …"), `docs/lore.md:37` (the FORBIDDEN list), `kiosk/tests/test_kiosk.py:139` (the test that bans the words). Nothing in kiosk or web copy, the form, the demo script or the user test kit |
| 10 | §6 wording in README | `grep -ciF "<phrase>" docs/README.template.md` for the eight MAY/MUST phrases | **PASS**: all eight present (operator cannot learn who contributed; replies never through us; re-render from one key, same hash; public to every key holder, forever; your own wallet stores what you sent; spammed by anyone holding the public key; lightwalletd sees your IP; the choir's own spends are public) |
| 11 | README txid links | the 19 distinct `testnet.zecblock.com/tx/<txid>` in `README.md` → `curl https://api.testnet.cipherscan.app/api/tx/<txid>` | **PASS**: 19/19 `status: confirmed`, `isCanonical: true`; `/api/block/4525215` hash `000026af4552…` (our chain) |
| 12 | Seed offerings (extra) | the 14 txids of `docs/evidence-index.md` "Pre-sent seed offerings" → same API | **PASS**: 14/14 confirmed and canonical, blocks 4,527,786–4,527,794 |
| 13 | Repository still private | `gh repo view agadape/choronzon --json visibility` | **PASS**: `PRIVATE` |
| 14 | Form answers | `docs/submission-form.md` against `config/brand.json` and current facts | **FAIL (stale wording, not fixed here)**: line 94 still says the public testnet explorer follows another chain and its links are not proof; since `efb600a` the links point to ZecBlock, which is on our chain. Suggested: "ZecBlock (testnet.zecblock.com) shows these transactions on our chain; an explorer shows only that a shielded tx exists, the independent proof is a view-only wallet (`list-tx`) or a render from the key." Name and tagline match `brand.json`; the one-liner is not in the form word for word (the form has a 508-char short description instead): copy it from `brand.json` if the form has a one-liner field |
| 15 | Skip list | `grep -v '^#' config/skiplist.txt` | no entries; reviewing what must not be sung is a content call (user, below) |

Only the user can do:

- run `./scripts/demo.sh` on the day (it sends testnet transactions) and keep its log;
- review `config/skiplist.txt`: listen to the test and rehearsal offerings once (pre-show check 5 in `docs/demo-script.md`);
- the publication act on submission day (decided 22 Oct: README + Séance; steps above): reveal to `/tmp/eye.key`,
  paste by hand under "### The key", regenerate, commit as the deliberate publication act, `shred -u`, re-run checks 3, 4 and 9;
- assign A / B / C and fill "team members and roles"; record the demo video and add its link;
- the second-laptop run (`docs/fresh-clone.md`) and the 10-person test (`docs/user-test-kit.md`);
- create the shielded payout address (mainnet, a team wallet, not in this repo; `protocol.is_unified_address` must accept it);
- make the repository public on 28 Oct, submit the form on thezecathon.com with the submitted commit hash, then tag
  `zecathon-2026` and push the tag.
