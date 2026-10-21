# Privacy review (Day 7, 21 Oct 2026)

Scope: the product code (`protocol/`, `renderer/`, `kiosk/`, `web/`), its outputs and logs. Spikes and logs under
`logs/` are historical evidence and stay local (git-ignored). Wording rules: `CLAUDE.md` §6.

## What each component writes or prints

| Component | Writes / prints | Contains | Verdict |
|---|---|---|---|
| renderer daemon / once | stderr log lines | txid (display order), height, reason code, hashes, wallet *path* | OK: no memo content, no addresses, no keys |
| renderer | `out/score.json`, `out/render_hash`, `out/mix.wav` | score (txids, heights, codec, byte counts, `has_reply`, `conductor`), timeline, hashes, pins; the mixed audio | OK: public content only; no reply addresses (`has_reply` is a flag) |
| renderer | `out/cache/<sha256>.c2` | Codec2 frames of text offerings (ghost voice of public chain content) | OK on a renderer; **removed from the kiosk** (see fixes) |
| renderer whisper | stdout | the reply request URI (contains the offering's reply address) + QR | Intended: the listener must pay it. Printed on demand, never written |
| renderer summon | stderr | birthday, wallet path | OK: the key comes from a file or `SUMMON_KEY`, never argv, never logged |
| web server | nothing (request logging disabled) | — | OK |
| web `/whisper/<txid>` | JSON to the browser | reply address inside the URI | Intended, on demand, not persisted |
| kiosk preview/offer/qr/speak | stdout | byte counts, contrib_id, txid + explorer link, labels | OK: never the text, never an address |
| kiosk `--wav` / `--png` | files the operator names | the ghost voice / the QR (= the request incl. memo) | Operator's explicit choice |
| kiosk session | `wallets/kiosk/current/state.json` | `contrib_id → txid` for `inbox` matching, funding/split txids | Documented; wiped by `session close` |
| kiosk inbox | stdout | the whisper's text | Intended: it is addressed to this wallet |
| kiosk reveal | stdout (+ `--to` file on request) | the choir's full viewing key | The sanctioned publication act (M5) |
| devtool wrapper errors | exception text | exit code + last line with addresses replaced by `<address>` | OK |

## Fixes made during the review

1. **Shell history.** `kiosk offer "text"` put the secret into the operator's shell history and `ps`. All four
   text commands now accept `-` or no argument and read the secret from a prompt / stdin (`read_text`).
2. **Kiosk TTS cache.** The kiosk shared the renderer's `out/cache/`, so the ghost voice of every secret sent from
   that machine stayed on disk. The kiosk now runs the voice without a cache.
3. **espeak-ng argv.** The text was passed to espeak-ng on its command line (visible in `ps` to every local
   process). It now goes in on stdin with a trailing newline, which is byte-identical to the argv path (verified
   against the chain regression at 4,522,002; the voice fingerprint is unchanged).
4. Control characters in text are mapped to spaces before TTS so stdin and argv inputs stay equivalent.

## Known residual exposure (say it, do not hide it)

- **The sending wallet remembers.** `sent_notes` holds the plaintext memo and the destination; the kiosk wallet is
  ephemeral for that reason. A phone user's own wallet keeps what they sent.
- **`ps` on the kiosk during a send.** `devtool-aegis wallet pay --payment-uri …` carries the memo (base64) on its
  command line for the seconds the transaction is built. Only local processes on the kiosk can see it. Mitigation
  needs a devtool change (payment request on stdin); not done in the hackathon window.
- **Temporary files.** TTS and Codec2 use a `tempfile.TemporaryDirectory()` per call (deleted on return); they live
  in `/tmp` for well under a second. A hardened kiosk can point `TMPDIR` at a tmpfs.
- **lightwalletd sees the kiosk's and every renderer's IP** and which transactions `enhance` fetched. Tor mode exists
  in devtool (`--connection tor`) and is on the roadmap, not enabled by default.
- **Reply addresses are public to every key holder** (they sit in the memo). Anyone can write to them. The renderer
  never persists them; it re-reads them from the wallet DB on demand.
- **Everything a Watcher renders is public forever.** That is the design, stated on the kiosk before every send.

## What the repository itself exposes (by design)

- `config/choir.json`: the god's public address. Everyone needs it to send an offering.
- Historical evidence keeps full testnet addresses of the throwaway spike wallets: `ai/phone-test/*.uri.txt`
  (reply addresses of wallet A at diversifier indices 5 and 10, and the choir address) and `radio/payment_uri.txt`.
  They are testnet, throwaway, and already public in the spike reports; they are kept as evidence and never reused.
- No viewing key, seed or `.age` identity is tracked; `git log --all` is scanned for key prefixes before every push
  (last scan: 29 commits, clean).

## Checked and unchanged

- No `Math.random` / `random` in the renderer, composer or page (grep); the only randomness is the sender's
  `contrib_id` (`secrets.randbits`), chosen on the sender's machine.
- No network calls other than lightwalletd through devtool; the web page fetches only its own server.
- No viewing key, seed, `.age` identity or `wallets/` path is committed (`git log --all` scan on every push).
