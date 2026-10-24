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
| renderer summon | stderr | birthday, wallet path | OK: the key comes from a file or `SUMMON_KEY`, never on our command line, never logged; the wallet tool receives it on its own argv for the moment `init-fvk` runs (see residual exposure; the key is public from 24 Oct) |
| web server | nothing (request logging disabled) | — | OK |
| web `/whisper/<txid>` | JSON to the browser | reply address inside the URI | Intended, on demand, not persisted; loopback clients only (404 to the LAN), Host must name the server |
| kiosk preview/offer/qr/speak | stdout | byte counts, contrib_id, txid + explorer link, labels | OK: never the text, never an address |
| kiosk `--wav` / `--png` | files the operator names | the ghost voice / the QR (= the request incl. memo) | Operator's explicit choice |
| kiosk session | `wallets/kiosk/current/state.json` | `contrib_id → txid` for `inbox` matching, funding/split txids | Documented; overwritten and deleted by `session close` (best-effort on SSD/VM disks) |
| kiosk inbox | stdout | the whisper's text, for the one `contrib_id` typed in | Intended: it is addressed to this wallet. The operator holds the wallet and can read every reply to a `--reply` address; the kiosk statement says so |
| kiosk reveal | stdout (+ `--to` file on request) | the choir's full viewing key | The sanctioned publication act (M5) |
| devtool wrapper errors | exception text | exit code + last line with addresses replaced by `<address>` (+ the Tor hint) | OK |
| kiosk offer / speak | stdout | one `route to lightwalletd: Tor …` / `DIRECT …` line | OK: says what the server could see |

## Fixes made during the review

1. **Shell history.** `kiosk offer "text"` put the secret into the operator's shell history and `ps`. All four
   text commands now accept `-` or no argument and read the secret from a prompt / stdin (`read_text`).
2. **Kiosk TTS cache.** The kiosk shared the renderer's `out/cache/`, so the ghost voice of every secret sent from
   that machine stayed on disk. The kiosk now runs the voice without a cache.
3. **espeak-ng argv.** The text was passed to espeak-ng on its command line (visible in `ps` to every local
   process). It now goes in on stdin with a trailing newline, which is byte-identical to the argv path (verified
   against the chain regression at 4,522,002; the voice fingerprint is unchanged).
4. Control characters in text are mapped to spaces before TTS so stdin and argv inputs stay equivalent.

## Second pass (read-only code review, 21 Oct evening)

An independent review of the product code found **one DQ-class bug**, fixed the same evening (`9a61d6e`):

- `python3 -m web` served `/out/<path>` without confining the path: `/out//etc/hostname` and `/out/../wallets/…`
  returned any readable file, including the kiosk session wallet's `data.sqlite` (whose `sent_notes` hold the
  secrets sent from it) and `.age` identities, and the default bind was `0.0.0.0`. Now every path is decoded,
  resolved and confined to `web/` or `out/` (404 otherwise, verified with absolute, `..` and `%2e%2e` forms), the
  default bind is `127.0.0.1`, `Access-Control-Allow-Origin: *` is sent only for `out/score.json`, `out/mix.wav`
  and `out/render_hash`, kiosk POSTs need `Content-Type: application/json` and a same-host `Origin`, `/eye` is 404
  until the operator opens it from loopback, and remote `score.json` fields on the apparition page are validated
  and rendered as text. Tests in `web/tests/`.
- Operational consequence: the kiosk session wallet that existed while the server was LAN-reachable is closed after
  the rehearsals and a fresh one is opened before the show.
- The reviewer also confirmed, with the SDK source, that `is_change` is set only for transactions that spent the
  account's own notes (`zcash_client_backend` `scanning.rs`), so a conductor line cannot be spoofed by paying the
  choir's internal address from outside: the S13 claim has a code basis.
- Protocol: the reply-block split search can mis-split a memo only with probability about 2⁻³³ per message, and
  only the sender's own message; no cross-message effect. Renderer and composer: no float, RNG, locale or byte-order
  dependence found.
- Robustness items (not privacy): output write order, daemon resilience, offer locking, CLI EOF, terminal escape
  sequences in `inbox`, `setup.sh` patch check. Tracked with the rehearsals work.

## Third pass (privacy audit, 24 Oct)

No disqualifying leak; seven claims that were not exactly true, or holes in the local servers, fixed:

1. **Kiosk replies went through the operator** while the copy implied otherwise. The statement now says a kiosk
   `--reply` lands in the session wallet the operator holds and can read; `kiosk offer --reply-to <ua>` (and
   `reply_to` on the web kiosk) embeds the visitor's own wallet address instead (unified-address checksum and network
   checked); `kiosk inbox <contrib_id>` shows only that offering's reply, not every visitor's
   (`test_inbox_shows_only_the_reply_for_the_typed_contrib_id`, `test_reply_to_must_be_a_unified_address_…`).
2. **Route line.** The statement still said "lightwalletd sees the kiosk's IP address" after Tor became the default.
   It is now built at runtime: the CLAUDE.md §6 Tor wording when the kiosk goes over Tor, an explicit
   "CONNECTED DIRECTLY … sees this kiosk's IP" when the operator chose direct (CLI `confirm` and `/kiosk/copy`;
   `test_privacy_statement_uses_the_section_6_wording`, `test_confirm_prints_the_route_this_process_uses`,
   `test_kiosk_copy_states_the_route_in_use`).
3. **"Wiped" was `rmtree`.** `session close` now overwrites every file under the session (`shred -x -z -n 1`, or
   zeros + fsync) before deleting it; the copy says "overwritten and deleted … best-effort" on SSD/VM disks
   (`test_session_close_overwrites_every_file_before_deleting`, both paths, checked through a hard link).
4. **`/whisper/<txid>` answered the LAN** when the server ran with `--bind 0.0.0.0`: it now returns 404 unless the
   client is loopback, like `/kiosk/*` and `/eye/open` (`test_whisper_post_body_and_loopback_only`).
5. **DNS rebinding.** `same_origin()` compared Origin with Host only, so a page on a domain re-pointed at 127.0.0.1
   passed. Every POST and every `/eye`, `/whisper/*`, `/kiosk/*` request now needs a Host of `127.0.0.1`,
   `localhost` or `[::1]` with the server's port, the explicit `--bind` address, or an `--allow-host`; anything else
   is 403 (`test_dns_rebinding_host_is_refused_on_every_guarded_endpoint`, 10 endpoints × 5 foreign Hosts).
6. **Secrets on argv.** `preview`, `offer`, `qr` and `speak` refused nothing: a positional text is now refused with
   the reason (stdin `-` and the prompt stay); `renderer whisper --text` is refused, the whisper comes from stdin,
   `--text-file` or the prompt; `/whisper/<txid>` accepts the text in a POST JSON body (GET `?text=` still works
   until the page switches) (`test_a_secret_on_the_command_line_is_refused`,
   `test_text_on_the_command_line_is_refused_before_any_wallet_is_opened`). `scripts/demo.sh` pipes the whisper.
7. **The key on argv.** The docs said "never argv" for `summon`; the wallet tool does take it on its own argv
   (below). Wording fixed here and in `renderer/__main__.py`.

## Known residual exposure (say it, do not hide it)

- **The sending wallet remembers.** `sent_notes` holds the plaintext memo and the destination; the kiosk wallet is
  ephemeral for that reason. A phone user's own wallet keeps what they sent.
- **`ps` on the kiosk during a send.** `devtool-aegis wallet pay --payment-uri …` carries the memo (base64) on its
  command line for the seconds the transaction is built. Only local processes on the kiosk can see it. Mitigation
  needs a devtool change (payment request on stdin); not done in the hackathon window.
- **`ps` during a Watcher's first run.** The key never goes on *our* command line (`--key-file` or `SUMMON_KEY`),
  but the wallet tool receives it on its own argv: `renderer summon` runs `devtool-aegis wallet init-fvk --fvk …`
  for the few seconds of that command, once per Watcher (found 23 Oct while checking the Tor runs). Local processes
  can see it there. The choir key is published on purpose from 24 Oct (site + README), so this is now low risk: it
  exposes nothing that is not already public. Same mitigation as above (devtool change), not done.
- **A kiosk `--reply` goes through the operator.** The reply address is a fresh address of the kiosk's session
  wallet, which the operator holds until the session closes, so the operator can read every reply to it (`inbox`
  shows only the one typed `contrib_id`, but that is a courtesy, not a protection). "Replies travel directly between
  two wallets, never through us" is true only for a reply address of the visitor's own wallet (`kiosk qr --reply`,
  `kiosk offer --reply-to`). The kiosk statement says this before every send.
- **Overwrite is best-effort.** `session close` overwrites every file before deleting it, but on SSDs, copy-on-write
  file systems and VM disks (WSL's `ext4.vhdx`) old blocks can survive below the file system. Full-disk encryption
  or a tmpfs for `wallets/kiosk/` is the stronger setup for a hardened kiosk.
- **Tor state on disk.** Arti keeps the public Tor directory and this wallet's guard relays in `<wallet dir>/tor/`
  (git-ignored with `wallets/`; no own IP, hostname or server name in it, checked 23 Oct). The kiosk session's copy
  is deleted with the session.
- **Temporary files.** TTS and Codec2 use a `tempfile.TemporaryDirectory()` per call (deleted on return); they live
  in `/tmp` for well under a second. A hardened kiosk can point `TMPDIR` at a tmpfs.
- **lightwalletd and the client's IP: closed by default since 23 Oct.** Every connection the kiosk, Whisper Back
  sends, the renderer and a Watcher make goes over Tor (`renderer/network.py`; measured in
  `docs/network-fallback.md`), so lightwalletd sees a Tor exit address, not the machine. What remains: lightwalletd
  still sees *what* is fetched and broadcast (a broadcast transaction; which transactions `enhance` fetched, so the
  set fetched over one connection belongs to one client), and everyone sees *when* a transaction lands on chain.
  An operator can still choose `--connection direct` / `LWD_CONNECTION=direct` (then the IP is visible again); a
  Tor failure never falls back to direct by itself. The GitHub Actions publisher connects directly (a GitHub
  machine's IP, rendering public data). `scripts/smoke.sh` health checks still sync V and B directly from the
  operator machine (operator wallets, not a contributor's). **Not covered: phone contributions.** A phone wallet
  (Zingo! via `kiosk qr`) connects to its own server with its own settings; our Tor default does not reach it.
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
- No network calls other than lightwalletd through devtool; the web page fetches only its own server. Only
  `kiosk/devtool.py` and `renderer/wallet.py` start the devtool, so no call site can skip the Tor flag
  (`kiosk/tests/test_connection.py` checks the spawners and the flag on every network command).
- No viewing key, seed, `.age` identity or `wallets/` path is committed (`git log --all` scan on every push).
