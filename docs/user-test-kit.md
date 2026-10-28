# User test kit: the 10-person test (22 Oct 2026; updated 25 Oct for the public give panel, Tor and the v2 listener)

Owner **C** (`research/TODO.md` Day 4). Source: `docs/ghost-choir-critical-review.md` §9. Ten people who are **not on the team**,
one at a time, about 12 minutes each. It checks four assumptions: people type a real secret (not a joke); the ghost
voice feels like a release, not a mockery; permanence does not make them back out; they want strangers to be able to
reply. It also gives the first real-phone readings of the v2 page (`docs/visual-direction.md` §7, open item 1).

Two ways to take part:

- **A. From their own phone, with their own wallet (the main path, also for testers who are not in the room).** The
  public page `https://choronzon.vercel.app/#give` turns their secret into a payment request; their own testnet wallet
  sends it. The team never sees the text before it is on chain and never holds the wallet that sent it.
- **B. At the kiosk, in person.** The kiosk page on the operator's laptop, sending from the kiosk's ephemeral session
  wallet.

> **Before anyone types:** whatever a tester sends becomes public to every key holder, forever, and cannot be taken
> back. The key is published (README, since 24 Oct). A tester may stop before sending; stopping is a complete answer
> for this test. Never press send for them.

## Before the first tester (operator)

For path A, nothing runs on the team's machines. Check on your own phone that `https://choronzon.vercel.app/#give`
opens the "Give it a secret" panel and draws a QR for a test line (do not pay it), and that `#tx=<a seed txid from
docs/evidence-index.md>` finds that seed. A tester needs a testnet wallet that can scan a ZIP-321 QR (Zingo! on
testnet works) and a little TAZ: the faucet `faucet.testnet.valargroup.dev` (it wants an R0 `utest1…` address), or the
operator sends 0.001 TAZ from wallet L to an address the tester gives. In that case the operator knows that address
belongs to the tester; it still does not show which offering is theirs, but say so before they give it.

For path B (~30 min):

```bash
cd ~/zecathon
python3 -m kiosk session status            # is an old session still open?
python3 -m kiosk session close             # only if one is: overwrites and deletes that wallet and the secrets sent from it
python3 -m kiosk session open --notes 12   # fresh ephemeral wallet funded from wallets/test/A (testnet), over Tor
python3 -m renderer daemon --wallet wallets/test/V      # second terminal: keeps the god up to date
python3 -m web --port 8765 --kiosk         # third terminal: kiosk endpoints for this machine only (loopback)
```

`session open` took 994 s over Tor on 23 Oct with a cold Tor cache (`docs/network-fallback.md`); it now seeds its
Tor directory from wallet A, but plan for up to ~20 minutes. If a command stops with "[over Tor: …]", Tor cannot
connect from this network. Choosing a direct connection (`LWD_CONNECTION=direct`) is a deliberate decision: the
statement then says "THIS KIOSK IS CONNECTED DIRECTLY" and lightwalletd sees this machine's IP. `session status` must
say ready; one note per send, so 12 notes cover 10 testers and two failed broadcasts (sends over Tor fail more often
than direct: 4 of 6 went through on 23 Oct).

Two tabs **on the kiosk machine itself** (the send endpoints refuse every other machine): `http://127.0.0.1:8765/kiosk.html`
(name, tagline and the privacy statement must show; "not started with --kiosk" means restart with `--kiosk`; if port
8765 is taken, use `--port 8766`) and `http://127.0.0.1:8765/`, the listener (the god seen from below; without WebGL
the older Canvas creature, same data).

Operator rules, both paths: do not look at the screen while the tester types and never write down what they typed;
record a tester number, no name; never note a time next to a name; reload the kiosk page between testers (a preview
leaves the text in the box).

## Read this to each tester (word for word)

> "This is an artwork: a god whose body and voice are made of secrets people give it. You write a secret. A machine
> voice, not your voice, speaks it, and it travels inside a Zcash shielded transaction on the Zcash test network to
> the god's address. Anyone who holds the god's public key can hear every secret it was ever given, and that key is
> published. It does not ask your name. Before anything is sent, the screen shows a statement. Let us read it
> together."

Path A shows its statement in the give panel (from `web/index.html`, as of 25 Oct): private, the link between you and
your secret, and we, the operator, cannot learn who contributed; public, the content of your secret, to everyone who
holds the key, forever, and the key cannot be revoked; not guaranteed, that nobody recognises your words (content,
names and places identify you); your own wallet stores what you sent, and **its server sees your IP address and when
you sent: our Tor does not cover your phone, and Tor does not hide timing**; a reply address you add can be seen and
written to by anyone holding the key; order inside a block is miner order. Read it from the screen, not from here.

Path B shows this (verbatim from `kiosk/copy.py`, `privacy("tor")`, as of 25 Oct; the page loads it from `/kiosk/copy`):

```
Before you give it anything, read this.

  Private:        the link between you and your secret.
                  We, the operator, cannot learn who contributed.
  Public:         the content of your secret, spoken by a ghost voice,
                  to everyone who holds the key, forever. The key is irrevocable.
  Not guaranteed: that nobody recognises your words or your style.
                  Content and voice can identify you; names and places identify you.

  Your own wallet stores what you sent. This kiosk sends from a session wallet
  that is overwritten and deleted when the session closes (on SSDs and VM disks
  the overwrite is best-effort). If you send from your own phone, your phone remembers.

  Whisper back: if you ask for it here, the reply lands in this kiosk's session
  wallet, which the operator holds until the session closes: the operator can read it.
  For a reply only you can read, give the address of your own wallet instead.
  Replies to a per-offering address can be sent by anyone holding the public key.
  lightwalletd sees a Tor exit, not this kiosk's IP (Tor is the default;
  an operator can choose direct on purpose, and then it sees the IP).
  Tor does not hide timing: everyone sees when a transaction lands on chain.
  Order inside a block is miner order, not send order.
```

> "Here is what will happen. You write something and look at it before anything is sent (at the kiosk you can hear
> the ghost voice first; a preview sends nothing). Then you decide alone: give it, or stop. If you give it, it cannot
> be taken back, and it is public to every key holder, forever. Stopping is a full answer. I will not look at what you
> write. Afterwards I ask a few short questions and write the answers under a number, not your name."

## Steps

### Path A: their own phone

1. The tester opens `https://choronzon.vercel.app/#give`, writes **the secret** (one memo fits about 363 bytes without a
   reply address; longer text becomes a `zcash:` link with up to three memos), and optionally pastes **a fresh address
   of their own wallet** for a whisper back (the reply then goes directly to their wallet, never to us).
2. Operator asks, and records the answer in column 3: *"Now that you know anyone with the key can read it forever, do
   you still want to send it?"* Then look away.
3. The tester ticks **I have read this**, presses **make the payment request**, and scans the QR with their wallet (or
   opens the link on the same phone), then pays 0.00001 TAZ. The panel shows the offering's number and a link to find it.
4. Finding it: the link `#offering=<number>` (or `#tx=<txid>` from their wallet) in **find my offering** on the leaf.
   The public page is a snapshot that re-renders every 30 minutes and redeploys only when the render changed, so the
   offering appears there within about half an hour of being mined, not at once; until then the page says "Not in this
   snapshot yet". When it is there, its eye burns, the others turn to it, and **hear it** plays that voice. A remote
   tester can answer the questions by message later; ask them to send only the column answers, never the text.

### Path B: at the kiosk

1. The tester types **your secret** (up to 1,500 characters; if the voice does not fit in three memos the page says
   "too long for the god: shorten it") and presses **preview the ghost voice** (it plays on this machine only).
2. Operator asks the same permanence question (column 3), then steps away from the screen.
3. The tester decides. If they tick **ask for a whisper back**, tell them the reply lands in this kiosk's wallet and you
   can read it; for a private reply they can give their own wallet's address (path A's panel takes one; the kiosk page
   has no field for it yet). Then **I have read this…** and the call-to-action button. Over Tor the page shows the txid
   after roughly 20 s to a minute (18 s and 61 s measured), the contrib_id, a ZecBlock link and "the god will hear it
   in about 1–4 minutes". To stop: do nothing; the operator reloads.
4. On the listener tab, while asking step 6: the offering usually lands 80–230 s after the txid (rehearsals of 21 and
   24 Oct). Then the tester types their contrib_id or txid into **find my offering** on the leaf (**G** opens it): their
   eye burns and their voice plays. Do not point at an eye yourself.

### Both paths

5. The phone check (everyone, sent or not, ~1 min): did the page run smoothly on their phone, did they find Listen and
   the leaf ("descend" on the first screen)? Record the phone class only (e.g. "mid Android", "older iPhone"), never a
   model that would identify them: smooth / stutters / did not load. Optional, only if they are happy to: add `?stats` to
   the address and read the fps from the strip at the top left.
6. Operator asks: *"Was it a real secret, a joke, or did you stop?"* (self-report; the operator never reads it), then
   *"One word for the ghost voice?"* (only one voice exists: the pinned espeak-ng voice; the three presets in §9 would
   change the composer version, so they are not offered), then the four questions.

## The four questions (verbatim, critical review §9)

1. "Apa yang membuatmu merasa aman mengirim rahasia ini?"
2. "Kalau kamu tahu siapa pun bisa mendengarnya selamanya, apa yang berubah?"
3. "Kalau ada yang membalas, kamu ingin tahu siapa, atau justru tidak?"
4. "Apa yang membuatmu kembali besok?"

For a tester who does not speak Indonesian: (1) "What makes you feel safe sending this secret?" (2) "If you know anyone
can hear it forever, what changes?" (3) "If someone replies, do you want to know who, or rather not?" (4) "What would make
you come back tomorrow?" A tester who stopped answers question 1 as it stands; "nothing" is an answer.

## Results (no names, no secret text)

| # | Path A / B | Sent: real / joke / nothing | Still want to send after the permanence warning? | One word for the ghost voice | Found their eye? | Phone: class, smooth? | Q1 | Q2 | Q3 | Q4 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | | | |
| 2 | | | | | | | | | | |
| 3 | | | | | | | | | | |
| 4 | | | | | | | | | | |
| 5 | | | | | | | | | | |
| 6 | | | | | | | | | | |
| 7 | | | | | | | | | | |
| 8 | | | | | | | | | | |
| 9 | | | | | | | | | | |
| 10 | | | | | | | | | | |

Summary: path A __ / B __ · real __ / joke __ / nothing __ · still want to send: yes __ / no __ · found their eye: __ ·
phones smooth __ / stutter __ / failed __ · words: …

## After the last tester

```bash
python3 -m kiosk inbox <contrib_id>   # only for a tester who asked for a whisper back; they type the contrib_id their screen showed. You, the operator, can read it too: say so if they ask for one
python3 -m kiosk session close    # the same day: overwrites and deletes the session wallet and the secrets sent from it
```

- Offerings sent in this test are on chain for good and will be sung at the show. They come from people outside the
  team, so the demo must say so: in `docs/demo-script.md`, add "…, N offerings from strangers in our user test on
  <date>, whom we cannot name, …" to the Operator's 0:00 sentence, and add them to the cue-card count (pre-show
  check 12).
- A tester who later wants their offering silenced can bring its txid (shown on screen after sending; the kiosk's
  session wallet also lists it until `session close`, so close the session the same day and never note times next to
  names; bringing it tells you which offering is theirs, so say that before they do). Add it to `config/skiplist.txt`
  with the reason `withdrawn by its sender`: our renderer skips it and its eye's lid is sewn shut, but it stays on
  chain and public to every key holder. For path A only the tester's own wallet knows the txid.
- Phone results go to the web owner (`docs/visual-direction.md` §7 item 1), as classes and counts only.
- Commit the filled table and the summary line (nothing else), then tick `research/TODO.md` Day 4.
