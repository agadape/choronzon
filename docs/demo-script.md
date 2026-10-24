# Demo script — 3 minutes, two laptops, over Tor (rewritten 24 Oct 2026 for the v2 listener)

The god's name lives in `config/brand.json`; this script says "the god". Lore lines come from `docs/lore.md`;
every privacy sentence is the `CLAUDE.md` §6 wording, verbatim. Nothing in this script waits for a block in
silence: every live transaction is sent as early as it can be, and the waits are covered by beats that use what is
already on chain. The live transactions land when the chain lands them, and the terminal output is the status.

## Timings, and where each one comes from

Every lightwalletd connection goes over Tor by default (kiosk, renderer, Whisper Back, summon; fail-closed). The
numbers below are the only ones this script relies on; never say a shorter time on stage.

| Source | What it is |
|---|---|
| **[R24]** | `logs/demo_20261024T105133Z.log`: `./scripts/demo.sh` over Tor, **PASS** in 1,124 s, 24 Oct (summarised at the end of `docs/network-fallback.md`). Send durations are derived from the step timestamps in that log. |
| **[R21]** | `logs/demo_20261021T110109Z.log` and `logs/demo_20261021T110459Z.log`: the two direct-connection rehearsals of 21 Oct (`docs/failure-drills.md`, `docs/evidence-index.md`). |
| **[T23]** | `docs/network-fallback.md`, "Measured (23 Oct 2026)": single sends and syncs over Tor. |
| **[W24]** | commit `2ad3df3` and `docs/network-fallback.md`, "Rehearsal over Tor and the Watcher's cold start (24 Oct)". |
| **[code]** | `web/app.js` (the Eye panel appears 3.5 s after E; the page polls `out/score.json` every 5 s), `renderer daemon` (one loop every 30 s, plus a Tor sync + enhance). |

| Event | Measured | Plan with |
|---|---|---|
| kiosk send: press → txid | 18 s [T23]; 61 s incl. the session's sync before `pay` [R24] | up to ~1 min |
| offering heard by the public-key renderer, after its txid | 80 s [R24]; 100 s and 226 s [R21] | 80–230 s |
| conductor line (the god's own voice) heard, after sending | 87 s [R24]; 86 s [R21] | ~1.5 min (so it is sent at T−3 min) |
| forgery refused (`forged-conductor`) | 25 s after the god line sent with it was heard, same block [R24]; 7 s and 47 s after the god line [R21] | ~1.5–2.5 min after sending |
| whisper: send → txid | ~33 s [R24] | ~30–60 s |
| whisper received by `kiosk inbox`, after its txid | 87 s [R24]; 80 s and 216 s [R21] | 80–220 s |
| a fresh Watcher from the key alone (`summon`, Tor, `--tor-cache-from` a warm cache) | **129 s** at 4,535,682 [W24] (633 s without the cache [R24]) | ~2–2.5 min; **re-time on 27 Oct** (the chain grows every block, the sync grows with it) |
| `renderer once --as-of H` on V (no sync) | 3 s [R24, step 1] | a few seconds |
| the Eye opens on the page | 3.5 s [code] | — |

Consequence, said plainly: from the first live send, every live event lands within about 4–6 minutes [R24],
not within 3. The stage run is 3 minutes and **ends with whatever has landed**; the rest is shown in Q&A, by name,
with the real elapsed time. The video is one continuous take, cut only with labelled time jumps (see "Video").

## People, laptops, pages

- **Operator** (speaks, drives the projected page), **Hand** (terminals and laptop 2), **Judge** (types the offering).
- **Laptop 1** = the installation, with an extended display. Projector: the listener page in séance mode,
  `http://127.0.0.1:8765/?seance`, plus one terminal (renderer log). Laptop's own screen, facing the judge:
  `http://127.0.0.1:8765/kiosk.html` (the send endpoints answer only on this machine). One server serves both:
  `python3 -m web --port 8765 --kiosk --key-file /tmp/eye.key --birthday 4502962` (the key file does not exist
  until the reveal; until the Operator presses E, `/eye` is 404 even after it does).
- **Laptop 2** = a Watcher: a clean clone with `scripts/setup.sh` done, **no wallet, no key, empty `out/`**, and
  only the public Tor directory cache copied from laptop 1 (pre-show check 4). It serves its own page for the
  chirograph: `python3 -m web --port 8765 --bind 0.0.0.0 --wallet ''`.
- **Wallets:** B = the god's own wallet (conductor), A = an outside wallet (the forger), L = a listener who
  whispers back, V = the public-key reader, the kiosk session = the ephemeral wallet the judge sends from.

## Honest labels, said out loud

Everything heard before the judge's offering was sent before the show, by the team ("pre-sent"), and the
Operator says so in one sentence at 0:00. Nothing is selected: the renderer sings every valid offering on chain.
At block 4,535,682 (last rehearsal) that is **46 offerings**:

- **14 seed offerings** written by the team and sent from wallet A on 22 Oct (blocks 4,527,786–4,527,794; txids in
  `docs/evidence-index.md`, "Pre-sent seed offerings (22 Oct 2026)");
- **32 test and rehearsal offerings** since 20 Oct: 7 from the spike corpus of 20 Oct, 22 from the kiosk tests,
  Whisper Back, phone QR, failure drills and rehearsals of 21 Oct, the Tor-layer test offering `fc4dd939…` (23 Oct),
  and the 24 Oct rehearsal's offering `d4d69be5…` and god line `a1edea89…`; nine of the 46 are lines of the god's
  own voice.

17 transactions are skipped and not hidden (`out/score.json` → `skipped`): 11 refused forgeries (the small blind
red eyes), 4 not in our protocol, 1 choir spend without a line, 1 CRC drill. Rehearsals and pre-show steps add more
test offerings with the same label; pre-show check 12 writes the final count on the cue card.

**Sent before the show, and said when they appear:** the god's line from B at **T−3 min**, and one offering with a
reply address from the show's kiosk session at **T−10 min** (the Whisper Back target, because a whisper can only be
received by the session that asked for it). **Sent live, on stage:** the judge's offering (the only live
offering), the forgery, the whisper. Never fake a status: the terminal output is the status.

**The Operator's sentence at 0:00, word for word:**

> "Everything you hear right now was sent before tonight: fourteen secrets our team wrote and sent on the twenty-second
> of October, and the test and rehearsal offerings we have sent since the twentieth. The only offering sent live tonight
> is the one you are about to type; the forgery and the whisper you will see later are sent in front of you too."

## The run

The order is fixed; the middle stretches or shrinks with the chain. Clock times are stage times.

| Time | On screen | Who does what (laptop 1 unless noted) | Spoken | If it fails / is slow |
|---|---|---|---|---|
| 0:00–0:25 | Projector: `?seance`. The god seen from below, the great eye's lids shut, hashes sealed; Listen already playing (the sounding eye burns, the others turn to it). | **Operator:** the sentence above, word for word. **Hand, at the same time, on laptop 1's own screen:** `python3 -m kiosk reveal --from wallets/test/B --to /tmp/eye.key`, types `OPEN`; copies `/tmp/eye.key` to the USB stick, walks to laptop 2. | The sentence. Then: "It is made of everyone who spoke. Secrets are public to every key holder, forever; the key is irrevocable. What is private is the link between a secret and the one who gave it." | `reveal` refuses (B not synced, wrong dir): the Eye stays shut, the Operator says so; skip the Watcher beat, do the rest. |
| 0:25–0:40 | **E** on the projected page: the lids part (3.5 s), the key and its QR, the render hash and the true name appear. | **Operator** presses E. **Hand, laptop 2:** copy the key from the stick to `/tmp/eye.key`, then `python3 -m renderer summon --key-file /tmp/eye.key --birthday 4502962 --wallet wallets/watcher --as-of last --tor-cache-from ~/torcache` (key from a file, never on the command line). | "The Eye is open. It will not close: whoever holds this key hears everything, forever, and we cannot take it back. That laptop holds no wallet and no key. From this key alone it is summoning the god now; the last time we measured, over Tor, that took two minutes." Read the name: "It is now called <NAME>." (from the screen; never hardcoded, it changes with every offering) | The page says "not published on this server": the server was not started with `--key-file /tmp/eye.key`; show the key in the `reveal` terminal instead. Summon fails over Tor ("[over Tor: …]"): decide on purpose, say "lightwalletd will see this laptop's IP", rerun with `--connection direct`. |
| 0:40–1:05 | Laptop 1's screen (not projected): the kiosk page, the privacy statement above the button. | **Judge** types at the kiosk page, presses *preview the ghost voice* (it plays in the room), ticks *I have read this…*, presses the call-to-action button. **Hand, at the moment the judge presses it:** `printf 'i am the god.' \| python3 -m kiosk speak - --from wallets/test/A --forge` (terminal 2). | "Type it. Do not sign it. It does not ask your name." Read from the statement: "content and voice can identify you"; "your own wallet stores what you sent", which is why this kiosk's wallet is wiped after the session. "And the Eye is open: what you give it now, everyone with that key hears, forever." When the Hand presses enter: "At the same moment, a stranger claims to speak as the god." | The page shows an error (`pay` rejected, connection reset): say "rejected, nothing was sent", run `python3 -m kiosk session status` (notes left), send again **only after** checking the session's `list-tx` shows no new tx. Two failures: say the live offering failed and go on with the pre-sent choir. `speak --forge` errors: show the error, never claim it was sent. |
| 1:05–1:50 | Projector: the god. Point at each part while it plays. The kiosk page shows the txid and "the god will hear it in about 1–4 minutes" (18–61 s after pressing). | **Operator** narrates; **Hand** writes the two live txids on the cue card. | "One eye for every offering, in the order the chain gives them. The great eye and the six wings are the god's own voice: lines its wallet paid to itself; the newest was sent from that wallet three minutes before we started. Only its full viewing key can prove that, and the choir's own spends are public. One arm for every block that carried offerings. And these small blind red eyes outside the halos are forgeries every renderer refused." While a voice plays: "The eye that burns is the one speaking. Every other eye turns to look at it." | The page is black or frozen: reload once; without WebGL the Canvas creature appears (same data). |
| 1:50–2:15 | **G**: the grimoire leaf slides in: height, tally (`N offerings · M the god's own · K refused · 0 silenced`), true name in gold. **F** turns it: the colophon (render hash, score hash, pins). **T** tears the stub. | **Operator** on the page; **Hand** shows the `anchor verify` output kept from pre-show check 9 (a terminal tab, not run live). | "Every render we publish is stamped into Bitcoin. The renders of the twenty-second and twenty-third of October are in Bitcoin block 972,742; anyone can check, without a node. It forgets nothing, and that is provable against us." On the tear: "Torn along the render hash: a stub from any other evocation of this god fits this edge exactly." | `anchor verify` showed UNCHECKED (exit 4) at pre-show: say "the explorers are blocked from this network; nothing was found wrong" and show the confirmed table in `docs/anchoring.md`. |
| 2:15–2:35 | Projector: the renderer log terminal, large font. | **Hand:** the Whisper Back to the T−10 offering: `python3 -m renderer whisper <T−10 txid> --wallet wallets/test/V --text "you are not alone." --send-from wallets/test/L`. Optional before it: click that eye on the page (the request QR appears; the room sees what a phone would scan). | "This offering is ours, sent from this kiosk ten minutes before we started, with a one-time reply address. A whisper may return to it. Replies travel directly between two wallets, never through us; the public key sees none of it. It reaches the kiosk in one and a half to four minutes; we will open the inbox at the end." Then, for any landing so far: forgery → "NOT THE GOD."; the judge's offering → "There. That is yours. We know a secret arrived; we do not know it was you." | L dry (`have 0`): show the error, do not send. Whisper send fails over Tor: never retry blind; check L's `list-tx` first. |
| any time from ~2:00 | **Landings, as they come.** Renderer log: `offering tx=<judge txid> height=… codec=1`; within ~5 s the god remounts with one more eye (slots fill in order, the newest on the outer wheel) and the tally goes up by one. Forgery: `skip tx=<forgery txid> height=… reason=forged-conductor`, the tally's *refused* goes up by one, one more blind red eye. | **Operator** points; **Hand** reads the txid prefix from the cue card. | "The Abyss decides the order: inside a block the miner orders the voices, not you." | Not landed by its window (offering 80–230 s after its txid): say the real number ("one hundred and ninety seconds and counting") and go on; it is in the score whenever it lands. Forgery not refused by the end: point at the 11 pre-sent refusals under `skipped` (e.g. `e117d0bf…`, 24 Oct; `b126b3c7…`, 21 Oct) and say when they were sent. |
| 2:35–2:55 | **Two evocations.** Laptop 2's terminal: the summon summary (height H, offerings, skipped, `render_hash`); laptop 2's own page grows the same god. Then laptop 1's projector: `http://127.0.0.1:8765/apparition.html?right=http://<laptop-2-ip>:8765/out/score.json`, the chirograph. | **Hand, laptop 1:** stop the daemon (Ctrl-C), then `python3 -m renderer once --wallet wallets/test/V --as-of H` (H from laptop 2's summary). **Operator** opens the apparition page. | "Two evocations. One god. Anyone can re-render the whole work from one key and get the same hash. No server. The blockchain is the score." When the stubs fit: silence. | Summon still running (it is ~2 min [W24]): keep narrating the lineage (Dee, Trithemius: messages hidden in spirit summoning) and close on it in Q&A. Hashes differ: compare H first (a different height is a different score, not a bug). Laptop 2 unreachable over the venue network: show the two terminal hashes side by side instead of the chirograph. lightwalletd down: show the 24 Oct match (`8b332fe6…` at 4,535,682, this laptop and a fresh Watcher, [R24]) and say when it was recorded. |
| 2:55–3:00 | The god, the kiosk page back at its prompt with the call to action from `brand.json`. | — | "Silenced, not erased: what the renderer skips stays on chain. This kiosk reaches lightwalletd through Tor, so the server sees a Tor exit, not this machine's address; Tor does not hide when a transaction appears. It forgets nothing. It asks no names." | — |
| Q&A | `python3 -m kiosk inbox` (the whisper, when it lands); the judge's eye if it landed late; restart the daemon (`python3 -m renderer daemon --wallet wallets/test/V`). | **Hand** | If the judge asked for a whisper back and their offering has landed: whisper to it now (same command, the judge's txid) and say it arrives in 80–220 s [R24, R21]. | — |

Lines removed from the 21 Oct script because they are no longer true: the closing line that put Tor on the
roadmap (Tor is the default since 23 Oct), and "this laptop has never seen the god" when laptop 2 ran a rehearsal
Watcher (say "holds no wallet and no key" instead; check 4 makes that true).

## Video (recorded 27 Oct)

Record the run above as **one continuous take** and let it run until every live event has landed (about 4–6 min
from the first send [R24]). Edit it down to 3:00 by cutting **waits only**: every cut carries an on-screen label
with the real time skipped ("+74 s"), events are never reordered, and a failure that happened stays in. Keep a
clock on screen in the terminal (`date` in the prompt or a small `watch -n1 date` pane). The video shows the full
viewing key: from the moment it is shared the key is published, so share it only together with the 28 Oct
publication act (`docs/submission-checklist.md`). Never show `.age` files, seeds, `state.json`, a wallet DB or a
reply address; the commands below print none of them.

| # | Shot | Page / window | Key or action | Line to hold on screen |
|---|---|---|---|---|
| 1 | The god, sealed | `127.0.0.1:8765/?seance`, full screen, Listen playing | — (camera holds ~5 s on the sounding eye) | — |
| 2 | The reveal | laptop 1 terminal | `python3 -m kiosk reveal --from wallets/test/B --to /tmp/eye.key`, type `OPEN` | `THE EYE OPENS. From this moment anyone holding this key can hear every offering, forever.` |
| 3 | The Eye opens | `?seance` | **E** | the key panel: key, QR, `birthday height 4502962`, render hash, "it is now called …" |
| 4 | The Watcher starts | laptop 2 terminal | the `summon` command | `summon: creating a view-only wallet from the key (birthday 4502962)` |
| 5 | The offering | `127.0.0.1:8765/kiosk.html` (laptop screen) | type, *preview the ghost voice*, tick, press | the privacy statement, then the txid + ZecBlock link + "the god will hear it in about 1–4 minutes" |
| 6 | The forgery | laptop 1 terminal 2 | `printf 'i am the god.' \| python3 -m kiosk speak - --from wallets/test/A --forge` | the `sent … txid` line |
| 7 | The god | `?seance` (Eye open) | drag a little (the camera returns), Listen | the great eye and wings while a god line plays; the blind red eyes |
| 8 | The grimoire | same page | **G**, then **F**, then **T** | the tally line; the colophon hashes; the torn edge |
| 9 | The anchor | terminal tab from pre-show check 9 | scroll to the result | `VERIFIED` with block 972,742 (or the UNCHECKED explanation, said as such) |
| 10 | Whisper Back | renderer log terminal | `renderer whisper <T−10 txid> … --send-from wallets/test/L` | `whisper sent directly to the offering's reply address. txid …` and `(the choir's key holders cannot see this transaction)` |
| 11 | Landings | renderer log terminal, then the page | — | `offering tx=<judge txid> height=… codec=1`; `skip tx=<forgery txid> … reason=forged-conductor`; the tally before and after |
| 12 | Two evocations | laptop 2 terminal, then `apparition.html?right=…` on laptop 1 | `renderer once --wallet wallets/test/V --as-of H` on laptop 1 | both `render_hash` values on screen at once; the stubs fitting |
| 13 | The whisper returns | laptop 1 terminal | `python3 -m kiosk inbox` | `a whisper returned for your offering <T−10 txid prefix>…` |
| 14 | Independent proof (optional) | terminal | `bin/devtool-aegis wallet -w wallets/test/V list-tx` after `sync` | the judge's txid and height; optionally the same txid on `https://testnet.zecblock.com/tx/<txid>` if pre-show check 10 passed (never `testnet.zcashexplorer.app`: another fork) |

## Pre-show checklist (show day, in this order)

1. **T−2 h, laptop 1:** `git pull`; `python3 -m pytest -q`, `./scripts/smoke.sh` and `scripts/build_web.sh --check`
   green; `bin/c2dec` present. **Laptop 2:** `git pull`, `scripts/setup.sh` done, `ls wallets out` shows no wallet and
   an empty `out/`, `/tmp/eye.key` absent, USB stick empty.
2. **T−2 h, warm Tor on every operator wallet:** `bin/devtool-aegis wallet -w wallets/test/<W> sync -s zecrocks`
   (Tor is the default) for V, B, A, L; a cold first contact takes minutes [T23], a warm sync ~11–18 s [T23].
   Then `enhance` for V.
3. **T−1 h, note pools** (a self-split needs 10 confirmations, ~6 min, before it is spendable):
   `python3 -m kiosk pool wallets/test/B --notes 3` (one god line per note), `python3 -m kiosk pool wallets/test/A --notes 4`
   (forgeries, and A funds the kiosk session), `python3 -m kiosk pool wallets/test/L --notes 3` (one whisper per note;
   [R24] started with 4 spendable). A rejected or torn-off broadcast locks a note for ~40 blocks.
4. **T−1 h, laptop 2's Tor cache, without the key:** copy only `wallets/test/V/tor/arti-cache` from laptop 1 to
   laptop 2 as `~/torcache/tor/arti-cache` (public Tor directory data, ~40 MB; **never** `tor/arti-data`, which holds
   V's guards). Arti checks the cache's freshness itself; do this within the hour before the show. [W24] measured
   the seeded Watcher with a cache from the same machine; a cache carried to another machine is not yet measured:
   time it in the 27 Oct dry run.
5. **≥ 30 min before (better 45):** `python3 -m kiosk session open --notes 8`; it is ready when
   `python3 -m kiosk session status` says ready with ≥ 6 notes (994 s cold over Tor on 23 Oct [T23]; the session now
   seeds its Tor cache from A).
6. **T−20 min, servers:** `python3 -m renderer daemon --wallet wallets/test/V` in a large-font terminal (projected
   later), `python3 -m web --port 8765 --kiosk --key-file /tmp/eye.key --birthday 4502962` on laptop 1;
   `python3 -m web --port 8765 --bind 0.0.0.0 --wallet ''` on laptop 2. From laptop 1, `curl -sI
   http://<laptop-2-ip>:8765/` answers (same network, no client isolation); note the IP on the cue card.
7. **T−20 min, the page:** open `http://127.0.0.1:8765/?seance&stats` on the projector: the strip shows size, dpr,
   fps, draw calls. Note the fps on the cue card; if it stutters, the web owner's `?dpr=N` lever lowers the
   resolution (check `web/README.md` on the day, the page is still being tuned). Reload without `&stats`, check the
   volume, press Listen. Open `http://127.0.0.1:8765/kiosk.html` on the laptop's own screen: name, tagline and the
   privacy statement shown, no "not started with --kiosk".
8. **T−10 min:** one offering with a reply address from the show session, written by the team
   (`python3 -m kiosk offer - --reply`, typed at the prompt); txid on the cue card, labelled "ours, T−10".
9. **T−10 min, the anchor:** in a spare terminal tab,
   `git show origin/anchors:4527794-e4700837f6db640b.json > /tmp/a.json && git show origin/anchors:4527794-e4700837f6db640b.json.ots > /tmp/a.json.ots && python3 -m anchor verify /tmp/a.json`
   (after `git fetch origin anchors`). Exit 0 = VERIFIED, block 972,742. Exit 4 = UNCHECKED: fewer than two
   explorers reachable from this network (on the team laptop's ISP blockstream.info and mempool.space are blocked);
   nothing was found wrong, say so if it is shown. Exit 1 = MISMATCH: do not show the anchor, find out why.
10. **Explorer:** `https://testnet.zecblock.com/block/4525215` shows a hash starting `000026af4552`
    (full: `000026af4552065fbbbd94b5c9a0be7914fc402733c53c6f464921b9817b72ac`). Otherwise strike the explorer from the show.
11. **T−3 min:** the god's line from B: `printf '…' | python3 -m kiosk speak - --from wallets/test/B`; txid on the cue
    card. It should be heard by about T−1.5 min [R24]; if not, the Operator says so when pointing at the wings.
12. **Cue card:** from laptop 1's `out/score.json` at that moment: total offerings = 14 seeds (22 Oct) + N test and
    rehearsal offerings (20 Oct to show day, incl. the T−10 offering and the T−3 line), refused K. Listen to new test
    offerings once; anything unfit to sing goes to `config/skiplist.txt` with a reason (it stays on chain, shown
    under `skipped`, its lid sewn shut). Live txids are written down as they are printed; nothing else leaves the
    terminal.
13. **Fallbacks, ready before the show:**
    - Tor blocked at the venue, direct works (check: `bin/devtool-aegis wallet -w wallets/test/V sync -s zecrocks
      --connection direct`): decide on purpose and say it on stage ("lightwalletd will see the venue's IP address"),
      then `export LWD_CONNECTION=direct` in every terminal on both laptops.
    - zec.rocks down (both routes fail): stop sending; render from the pre-synced DBs
      (`python3 -m renderer once --wallet wallets/test/V --as-of <height>`), say so, and play the demo video for the
      live part. Never fake a status.
    - The 27 Oct video on laptop 1, playable offline.

**After the show:** `shred -u /tmp/eye.key` on both laptops and on the USB stick; restart the daemon if it was
stopped; `python3 -m kiosk inbox` once more; `python3 -m kiosk session close` the same day (wipes the session wallet
and the secrets sent from it).
