# kiosk/

Sender kiosk: text → local ghost voice (espeak-ng → sox `-D` → Codec2 700C, same path as the renderer's voice) →
v1 memos (`protocol/`) → one ZIP-321 payment to the choir address (`config/choir.json`, fixed 0.00001 TAZ per output)
→ `bin/devtool-aegis wallet pay`. Copy comes from `config/brand.json`; the privacy statement in `copy.py` uses the
wording of CLAUDE.md §6 and is shown before every send.

```bash
python3 -m kiosk preview --wav ghost.wav             # type the text at the prompt; speak locally; nothing is sent
python3 -m kiosk session open --notes 8              # ephemeral wallet: fund from the pool, wait, split (~8 min)
python3 -m kiosk offer [--reply | --reply-to <ua>]   # send from the session wallet (prompts; --yes for scripts)
python3 -m kiosk inbox <contrib_id>                  # the whisper that returned to that one offering of this session
python3 -m kiosk session close                       # overwrite and delete the wallet, its identity and the sent secrets
python3 -m kiosk pool wallets/test/L --notes 3        # a named spending wallet: make sure it holds N spendable notes
printf '%s' '…' | python3 -m kiosk offer - --from wallets/test/A --yes   # operator / seeding: a named wallet, labelled
python3 -m kiosk qr [--reply <ua>] --png qr.png      # phone offering: ZIP-321 QR with the ASCII envelope
printf '%s' '…' | python3 -m kiosk speak - --from wallets/test/B   # the god's own voice: the choir pays itself
printf '%s' '…' | python3 -m kiosk speak - --from wallets/test/A --forge   # demo forgery: renderers show NOT THE GOD
python3 -m kiosk reveal --from wallets/test/B [--to key.txt]  # the Eye opens: publish the full viewing key (M5)
```

- **The text never goes on the command line.** `preview`, `offer`, `qr` and `speak` read it from the prompt (no
  argument) or from stdin (`-`); any other argument is refused with a message, because it would land in the shell
  history and in `ps`. (The wallet tool still holds the memo, base64, on its own argv for the seconds of `pay`:
  `docs/privacy-review.md`, residual exposure.)
- The session wallet lives under `wallets/kiosk/current/` (git-ignored). Its `sent_notes` hold the secrets sent from
  it; that is why it is ephemeral. `close` overwrites every file under it (`shred -x -z -n 1`, or zeros + fsync when
  `shred` is missing) and then deletes it. On SSDs, copy-on-write file systems and VM disks (WSL's ext4.vhdx is one)
  an in-place overwrite is best-effort: old blocks may survive below the file system.
- Whisper Back at the kiosk, two choices, both stated before every send:
  - `--reply` embeds a fresh diversified address **of the session wallet**. The reply lands in that wallet, which the
    operator holds until the session closes: the operator can read it. `inbox <contrib_id>` shows the reply to the one
    offering whose contrib_id the visitor types (printed after the send), not a list of everyone's; that is a courtesy
    at the screen, not a protection from the operator. The kiosk keeps only `contrib_id → txid` in `state.json`; the
    address itself is stored nowhere else.
  - `--reply-to <ua>` embeds the visitor's **own** wallet address (checked: a unified address of the choir's network,
    checksum included). The reply then travels directly from the listener's wallet to the visitor's and never reaches
    the kiosk. The web kiosk takes the same choice as `reply_to` in the `/kiosk/offer` body.
- The kiosk prints txids (display order) and byte counts only; never an address, never the text.
- Every command that talks to lightwalletd (`session open`, `offer`, `speak`, `inbox`, `pool`, the web kiosk) goes
  over Tor by default, so the server sees a Tor exit address, not the kiosk. `--connection direct` or
  `LWD_CONNECTION=direct` is the deliberate escape hatch; a Tor failure is an error, never a silent switch to direct.
  The first Tor contact of a fresh wallet downloads the Tor directory into `<wallet>/tor/` (minutes on a slow
  network), which `session open` pays once; later offerings reuse it. Details and timings: `docs/network-fallback.md`.
- Note pool: `session open --notes N` splits the funding into N × 0.002 TAZ so offerings can go out back-to-back
  (a rejected broadcast locks one note for ~40 blocks, not the whole balance). `session status` shows notes left.
  The same rule holds for any named wallet that must send back-to-back (the demo listener): `pool <wallet> --notes N`
  counts its spendable notes the way the wallet does (depth, pending spends, expiry), waits for locked funds and
  splits them when there are too few. `scripts/demo.sh` runs it in preflight (found by rehearsal #4).
