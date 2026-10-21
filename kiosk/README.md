# kiosk/

Sender kiosk: text → local ghost voice (espeak-ng → sox `-D` → Codec2 700C, same path as the renderer's voice) →
v1 memos (`protocol/`) → one ZIP-321 payment to the choir address (`config/choir.json`, fixed 0.00001 TAZ per output)
→ `bin/devtool-aegis wallet pay`. Copy comes from `config/brand.json`; the privacy statement in `copy.py` uses the
wording of CLAUDE.md §6 and is shown before every send.

```bash
python3 -m kiosk preview "text" --wav ghost.wav      # speak locally, show memo sizes; nothing is sent
python3 -m kiosk session open --notes 8              # ephemeral wallet: fund from the pool, wait, split (~8 min)
python3 -m kiosk offer "text" [--reply]              # send from the session wallet (prompts; --yes for scripts)
python3 -m kiosk inbox                               # whispers that returned to this session's wallet
python3 -m kiosk session close                       # wipe the wallet, its identity and the sent secrets
python3 -m kiosk pool wallets/test/L --notes 3        # a named spending wallet: make sure it holds N spendable notes
python3 -m kiosk offer "text" --from wallets/test/A  # operator / seeding: a named wallet, labelled as such
python3 -m kiosk qr "text" [--reply <ua>] --png qr.png   # phone offering: ZIP-321 QR with the ASCII envelope
python3 -m kiosk speak "text" --from wallets/test/B  # the god's own voice: a conductor line the choir pays to itself
python3 -m kiosk speak "text" --from wallets/test/A --forge   # demo forgery: every renderer shows NOT THE GOD
python3 -m kiosk reveal --from wallets/test/B [--to key.txt]  # the Eye opens: publish the full viewing key (M5)
```

- The session wallet lives under `wallets/kiosk/current/` (git-ignored) and is deleted on `close`. Its `sent_notes`
  hold the secrets sent from it; that is why it is ephemeral.
- `--reply` embeds a fresh diversified address of the session wallet; the kiosk keeps only `contrib_id → txid` in
  `state.json` so `inbox` can match replies while the session is open. The address itself is stored nowhere else.
- The kiosk prints txids (display order) and byte counts only; never an address, never the text.
- Note pool: `session open --notes N` splits the funding into N × 0.002 TAZ so offerings can go out back-to-back
  (a rejected broadcast locks one note for ~40 blocks, not the whole balance). `session status` shows notes left.
  The same rule holds for any named wallet that must send back-to-back (the demo listener): `pool <wallet> --notes N`
  counts its spendable notes the way the wallet does (depth, pending spends, expiry), waits for locked funds and
  splits them when there are too few. `scripts/demo.sh` runs it in preflight (found by rehearsal #4).
