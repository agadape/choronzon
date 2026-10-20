# S10 — Can a browser build/sign an Ironwood (v6) shielded tx? (timebox 60 min)

Why: a web demo that "connects a wallet" needs this. Two known paths:

**A. WebZjs (ChainSafe)** — https://github.com/ChainSafe/WebZjs
- Recon fact: last commit on main is 16 Apr 2026 and the repo has **no mention of Ironwood**
  (checked 13 Oct 2026). Ironwood (NU6.3, v6 tx) activated on mainnet ~28 Jul 2026 and
  Orchard no longer accepts new outputs. So hypothesis = WebZjs can't create new shielded
  outputs on mainnet today.
- Spike: `git clone`, follow README `just build` / `yarn`, run the demo web wallet against
  testnet/mainnet, try one send. Log exact error. ❌ here kills "pure browser wallet" ideas.

**B. Own WASM signer (Aegis Gate approach)** — they compiled FROST signing to WASM and kept
proving + broadcast in a Rust engine. Pattern: browser holds the key / signs the PCZT,
server (devtool/librustzcash) builds + proves + broadcasts. Spike only if an idea needs it:
`pczt` commands in devtool (`bin/devtool-* pczt --help`) → create → prove → sign → send.

**C. Deep link fallback** — the web app never touches keys; it shows a ZIP-321 QR (S9) and
watches with a viewing key (S5). Already covered by S5+S9; this is the cheapest path.

Log which of A/B/C is ✅. Most likely winner for a 15-day build: **C**.
