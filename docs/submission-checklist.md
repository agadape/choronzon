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
- [ ] decide whether the choir's full viewing key goes into the README at submission (CLAUDE.md §6 says yes,
      deliberately, as the publication act) or only on stage at the Séance; if in the README, add it by hand, never
      via a script, and note the birthday height 4502962 next to it

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
