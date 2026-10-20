# Ghost Choir: A God Made of Secrets — research & spike repository

ZECATHON 2026 (Zcash privacy hackathon by zkSNARKs) · track **WILDCARD** · deadline **28 Oct 2026**.

> A collective god whose voice and body are made of secrets people release through Zcash shielded transactions.
> Anyone holding one public viewing key can hear everything; nothing links a secret to its sender; strangers can whisper back.

**Start here**
1. `CLAUDE.md` — the handoff: decisions, what is proven, environment, protocol, privacy wording, gotchas.
2. `TODO.md` — day-by-day checklist with owners and gates.
3. `docs/ghost-choir-refined.md` — concept v3 (architecture, demo script, 9-day plan).
4. `docs/evidence-index.md` — every claim → txid → log file.

**Set up a machine**
```bash
./scripts/setup.sh        # deps, Rust, patched zcash-devtool → bin/devtool-aegis (~10–15 min)
unzip zecathon-wallets-TESTNET.zip   # testnet wallets A (contributor), B (choir), V (public reader), L (listener)
./scripts/smoke.sh        # protocol tests, codec2, lightwalletd, deterministic render hash
```

**Layout**
```
CLAUDE.md TODO.md SPIKE_LOG.md           handoff · checklist · on-chain proof log
docs/      concept v3, critical review, evidence index
ai/        Whisper Back spike report, phone-test QRs + Zingo screenshot
spikes/    S1–S13 scripts, wb_protocol.py (protocol v1 + tests), wb_harness.sh, g6_render.py (deterministic renderer)
scripts/   setup.sh, smoke.sh, patches/zcash-devtool-nu7.patch
radio/     voice-in-memos experiment (S12), from_chain.wav = audio rebuilt from the chain
topeng-spike/  rejected idea (stylometry) kept for the record
logs/      raw evidence (txids, memos, timings)
tools/     socks2connect.mjs — only for sandboxes behind an HTTP proxy
```

Never commit `wallets/`, `*.age`, `.env`, `bin/`, `vendor/` (see `.gitignore`). Testnet only.
