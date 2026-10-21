# web/

Listener page: a Canvas 2D creature grown from `out/score.json` plus WebAudio **playback** of `out/mix.wav`
(nothing is mixed in the browser; browser mixing is not bit-exact). Copy comes from `config/brand.json`.

```bash
python3 -m renderer daemon --wallet wallets/test/V   # keeps out/ fresh
python3 -m web --port 8765                            # http://localhost:8765/ (stdlib static server, no deps)
```

- `creature.js`: `G_n = F(G_{n-1}, A_n, I_n)`. One limb per offering in score order; `A_n` = the integer features
  from the composer (`energy` → width, `samples` → length, `zero_crossings` → hue and whether it grows an eye),
  `I_n` = `contrib_id` → angle, curl and which earlier limb it attaches to (an integer hash, no `Math.random()`).
  The same `score.json` draws the same body on every machine.
- While the mix plays, the limb whose voice is sounding (from `start`/`samples` in the timeline) brightens and pulses.
- The page shows `render_hash` and `score_hash` so two laptops can be compared on screen, and whether the decoder and
  voice match the pinned builds. It polls `out/score.json` every 5 s and regrows when the hash changes.
- The server exposes only `web/`, `config/brand.json` and the `out/` directory; every path is decoded, resolved
  and confined to its directory (`..`, absolute and percent-encoded escapes are 404), and nothing is listed.
- It binds to **127.0.0.1 by default**. `--bind 0.0.0.0` only when a second laptop must read this machine's
  `out/score.json` + `out/mix.wav` (the only files sent with `Access-Control-Allow-Origin: *`).
- POSTs (`/kiosk/*`, `/eye/open`) require `Content-Type: application/json`, a small JSON object, and an `Origin`
  header (when the browser sends one) that names this server, so another tab cannot trigger a send.
- `web/tests/test_server.py` pins these properties (confinement, CORS scope, kiosk gating, Eye gating).

## Kiosk page (`--kiosk`, loopback only)

`python3 -m web --port 8765 --kiosk` adds `http://127.0.0.1:8765/kiosk.html`: a judge types the secret on a
screen instead of a terminal. The page shows the privacy statement from `kiosk/copy.py` verbatim before the send
button (the CTA from `config/brand.json`), "preview the ghost voice" (`POST /kiosk/preview` → WAV from
`kiosk.offering.make_offering` + the pinned decoder, nothing written), an optional "ask for a whisper back", and
the send button (`POST /kiosk/offer` → `kiosk.session.Session.current().offer(...)`, exactly like
`python3 -m kiosk offer`; refused with a message when no session is ready). The endpoints and the page exist only
with `--kiosk` **and** for clients on 127.0.0.1/::1: a listener page served on a LAN never exposes a send
endpoint. Responses carry txid, contrib_id, byte counts and seconds; the text and any address are never returned
or logged. After a send the page clears the text, shows the txid with the explorer caveat (it may be on another
fork; the proof is `wallet -w wallets/test/V list-tx`) and "the god will hear it in about 1–4 minutes".

## Demo pages

- **Séance** `http://localhost:8765/?seance`: the body grows, but the hashes stay sealed. "open the eye" (or the
  `E` key) runs a thin aperture across the body over 6 s, then shows THE EYE IS OPEN with the published key if the
  server was started with `--key-file KEY --birthday H` (the file written by `kiosk reveal --to KEY`). The key is
  served at `GET /eye` only after `POST /eye/open`, which the page sends when the button is pressed and which the
  server accepts from its own machine only; before that `/eye` is 404 even with `--key-file`, and it never closes
  again while the server runs. Without a key file the page reveals the hashes only.
- **Two evocations** `http://localhost:8765/apparition.html?right=http://<other-laptop>:8765/out/score.json`:
  left = this machine's score, right = the other machine's (its server sends `Access-Control-Allow-Origin: *`).
  Both bodies are grown from their own `score.json`; the real `render_hash` values are compared, revealed in
  synchronised blocks, and on a match thin lines join the corresponding chambers, the divider fades and the page
  goes still: TWO EVOCATIONS. ONE GOD. A mismatch stops at the first differing block in the anomaly colour.
  Without `?right=` it compares the page with itself and says so.
