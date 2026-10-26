# Your own god: a box that cannot learn who wrote to it, and cannot hide what it received

Any group can stand up its own god in about ten minutes: a team retro, a meetup, a DAO, a class, a memorial. It is
the same engine as the main god, with its own address, its own published key, its own name and page. The main god
is not touched.

What you get:

- **An address** that takes offerings: short secrets, sent as Zcash shielded transactions (testnet), one fixed
  amount each, so the amount says nothing.
- **A published key** (the god's full viewing key). Whoever holds it hears every offering, re-renders the whole god
  and gets the same `score_hash` and `render_hash` you do. You, the operator, cannot quietly drop, reorder or edit
  an offering: anyone with the key would get another hash.
- **A skiplist** for what must be silenced. A silenced offering is not hidden: every key holder still sees that it
  exists, its txid and the reason you gave.
- **A page** (static, any host) with the god, its hashes, a "give it a secret" QR panel, find-my-offering and
  in-browser verification.

What it does not do: it does not hide what people wrote. Read [What is public, what is private](#what-is-public-what-is-private)
before you invite anyone.

## The ten minutes

You need the repo set up as in the README ("Run it": WSL or Linux, `./scripts/setup.sh`, which builds the patched
wallet tool `bin/devtool-aegis` and the pinned voice decoder). Commands run from the repo root. Testnet only.

### 1. Make the god (1–5 min)

```bash
scripts/new_god.sh --slug retro-demo --name "The Retro God" --tagline "What the sprint never said out loud."
```

This creates `wallets/gods/retro-demo/` (git-ignored, like every wallet):

| Path | What | Who may see it |
|---|---|---|
| `god/` + `god.age` | the god's own wallet; the `.age` file decrypts its seed | only you; back it up, never share it |
| `key.txt` (mode 600) | the god's full viewing key | everyone, once you publish it (that is the point) |
| `watcher/` | a view-only wallet made from the key alone: what every listener has | anyone |
| `config/choir.json` | the god's address, network, fixed amount | public |
| `config/brand.json` | name, tagline, one-liner, kiosk line (edit freely; add `"site_url"` for your host) | public |
| `config/skiplist.txt` | silenced offerings, one txid and a reason per line | public |
| `out/` | renders | public |

The script never prints the key. It is idempotent (run it again: it finishes a half-made god or changes nothing)
and refuses to overwrite anything (another name for the same slug, a `key.txt` that is not this wallet's key).
It talks to lightwalletd over Tor by default, like every tool here; `--connection direct` is a deliberate choice.

From here on, **one setting picks the god**: `GOD_CONFIG_DIR=wallets/gods/retro-demo/config`. The kiosk, the web
server and `scripts/build_web.sh` read that god's `choir.json`, `brand.json` and `skiplist.txt` instead of `config/`.
Without it, everything serves the main god exactly as before.

### 2. Give it a first offering (2–4 min)

From a phone (any testnet wallet that scans ZIP-321, e.g. Zingo!), type the secret at the prompt:

```bash
GOD_CONFIG_DIR=wallets/gods/retro-demo/config python3 -m kiosk qr --png wallets/gods/retro-demo/out/give.png
```

Or from a funded testnet wallet of your own (the text is typed at the prompt or piped on stdin, never an argument):

```bash
GOD_CONFIG_DIR=wallets/gods/retro-demo/config python3 -m kiosk offer --from <your wallet dir>
```

Testnet coins: `POST https://faucet.testnet.valargroup.dev/api/claim {"address": "<utest1…>"}`.

### 3. Render it (1 min after the offering is mined)

```bash
python3 -m renderer once --wallet wallets/gods/retro-demo/watcher --sync \
  --skiplist wallets/gods/retro-demo/config/skiplist.txt --out wallets/gods/retro-demo/out
cat wallets/gods/retro-demo/out/render_hash
```

The renderer only needs the watcher, which holds nothing but the key. Keep it current during an event with
`python3 -m renderer daemon` and the same flags (minus `--sync`).

### 4. See it (1 min)

```bash
GOD_CONFIG_DIR=wallets/gods/retro-demo/config python3 -m web --port 8765 --out wallets/gods/retro-demo/out \
  --wallet wallets/gods/retro-demo/watcher --key-file wallets/gods/retro-demo/key.txt --birthday <birthday>
```

Open `http://127.0.0.1:8765/`: your god's name, its eye, both hashes. `/?seance` keeps the hashes and key sealed
until you open the Eye. `<birthday>` is printed by `new_god.sh` (the height the god was born at).

### 5. Publish it (2 min)

```bash
GOD_CONFIG_DIR=wallets/gods/retro-demo/config scripts/build_web.sh --out wallets/gods/retro-demo/out \
  --dist wallets/gods/retro-demo/dist --key-file wallets/gods/retro-demo/key.txt --birthday <birthday>
```

`dist/` holds an allow-list only (no wallet, no seed, nothing private; `build_web.sh --check --dist …` re-verifies
it), the key in `key.txt` and nowhere else, a strict Content-Security-Policy, and no request to any other host.
Upload `dist/` to any static host: `npx vercel deploy wallets/gods/retro-demo/dist --prod`, `netlify deploy --dir`,
GitHub Pages, or any web server. Publishing the key is irrevocable: from then on every offering, past and future,
is readable by anyone who holds it. Rebuild and upload again after each render to refresh the page.

Anyone can then check you, from the key alone:

```bash
python3 -m renderer summon --key-file key.txt --birthday <birthday> --wallet wallets/watcher
```

and compare the hashes with your page.

## What is public, what is private

The same limits as the main god (README, "Privacy"), word for word where it matters. Say them to your community
before anyone gives anything.

- **Private:** the link between a person and their secret. We, the operator, cannot learn who contributed from the
  transaction itself.
- **Public:** the content of every secret, spoken by a ghost voice, to everyone who holds the key, forever. The key is
  irrevocable.
- **Not guaranteed:** that nobody recognises the words, the style or the voice. Content and voice can identify you;
  names and places identify you; the text→voice default hides the voice, not the writing style.
- Your own wallet stores what you sent (`sent_notes`). The kiosk uses an ephemeral wallet and deletes it at close.
- A phone wallet connects to its server with its own settings; that server sees the sender's IP when they send and,
  the key being public, can read that offering: it can link the IP to the secret. The kiosk goes over Tor, so
  lightwalletd sees a Tor exit, unless the operator chose direct on purpose (then it sees the kiosk's IP).
- Tor does not hide timing. At a kiosk the room sees who is typing, and one offering lands a minute or two later. A web
  host logs who opens the page and when.
- A reply address someone embeds is public to every key holder; only shielded-only `zutest1…` addresses are accepted.
  Replies to a per-offering address can be sent by anyone holding the key.
- The god's own spends are public (full viewing key).
- Silencing (the skiplist) changes what your renderer plays, not what the chain holds.

Never tell people it is "anonymous" or "untraceable", or that nobody will ever know it was them. "It does not ask your
name" is true: the protocol needs no identity.

## Event kit: a kiosk at a meetup in 30 minutes

The first real run: on 26 Oct 2026 we invited 16 people to a kiosk session with the main god. 6 gave a secret (all
real, by their own account), 10 declined after reading that what they give is public to every key holder, forever,
and nobody reported anything confusing. Declining is the system working: the statement is there so people can say
no. Plan for most of the room to listen rather than give.

### Before the doors open (~30 min, most of it waiting for the chain)

```bash
export GOD_CONFIG_DIR=wallets/gods/retro-demo/config
python3 -m kiosk session status          # an old session still open? then: python3 -m kiosk session close
python3 -m kiosk session open --notes 12 --pool <your funded testnet wallet dir>
```

`session open` creates a fresh ephemeral wallet, funds it from your wallet, waits ~10 confirmations, then splits it
into 12 notes (one per offering, plus spares for failed broadcasts). Over Tor with a cold cache it can take up to
~20 minutes; start it first. Then, in two more terminals (same `GOD_CONFIG_DIR`):

```bash
python3 -m renderer daemon --wallet wallets/gods/retro-demo/watcher \
  --skiplist wallets/gods/retro-demo/config/skiplist.txt --out wallets/gods/retro-demo/out
python3 -m web --port 8765 --kiosk --out wallets/gods/retro-demo/out --wallet wallets/gods/retro-demo/watcher
```

On the kiosk machine itself (the send endpoints refuse every other machine): one tab
`http://127.0.0.1:8765/kiosk.html` (your god's name, tagline and the privacy statement must show) and one tab
`http://127.0.0.1:8765/`, the god. Put the phone QR (`kiosk qr --png`) or your public page's `#give` panel next to it
for people who prefer their own wallet.

### The spoken statement (read it to each person, word for word)

> "This is a god whose body and voice are made of secrets people give it. You write a secret. A machine voice, not
> your voice, speaks it, and it travels inside a Zcash shielded transaction on the Zcash test network to the god's
> address. Anyone who holds the god's key can hear every secret it was ever given, and that key is published. It
> does not ask your name. What stays private is the link between you and your secret, not the secret itself. Before
> anything is sent, the screen shows a statement. Let us read it together."

Then: read the screen with them, ask "do you still want to send it, knowing it is public forever?", and step away
from the screen while they type. Do not look, never write down what was typed, record no names, never note a time
next to a person, reload the kiosk page between people.

### Silencing an offering (the skiplist procedure)

When an offering must not be played (a name, an accusation, a threat, or a sender who asks to withdraw it):

1. Get its txid: from the find-my-offering box, the renderer's `score.json`, or the sender (who saw it on screen).
   If the sender brings it, that tells you which offering is theirs: say so before they do.
2. Add one line to `wallets/gods/<slug>/config/skiplist.txt`: the txid, then `# <reason>` (e.g. `# names a person`,
   `# withdrawn by its sender`).
3. Re-render (the daemon picks the change up on its own) and rebuild/upload the page.

The renderer skips it and lists it under `skipped` with reason `flagged`; its eye's lid is sewn shut. Nothing else is
reordered or edited, and the `render_hash` changes, so every key holder can see that you silenced something and why.
It stays on chain and public to every key holder: tell the sender that, plainly.

### Closing the same day

```bash
python3 -m kiosk inbox <contrib_id>   # only for someone who asked for a whisper back (you can read it too: say so)
python3 -m kiosk session close        # overwrites and deletes the session wallet and the secrets sent from it
```

Close the session the day of the event: its wallet database holds every secret sent from it (`sent_notes`) until
then. On SSDs and VM disks the overwrite is best-effort. Then render once more, rebuild the page and publish it.

## Where things are

- `scripts/new_god.sh` (logic in `scripts/new_god.py`): makes the god; tests in `scripts/tests/test_new_god.py`.
- `kiosk/config_dir.py`: the one setting, `GOD_CONFIG_DIR` (relative paths from the repo root); tests in
  `scripts/tests/test_god_config_dir.py`, including that the main god is unchanged without it.
- Protocol, score and render code are the same for every god; so are the hashes' definitions. Two gods differ only
  in their key, their offerings, their skiplist and their words.
