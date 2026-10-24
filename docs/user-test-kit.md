# User test kit: the 10-person test (22 Oct 2026; updated 24 Oct for the v2 listener and Tor)

Owner **C** (`TODO.md` Day 4). Source: `docs/ghost-choir-critical-review.md` §9. Ten people who are **not on the team**,
one at a time, about 12 minutes each: they give (or do not give) an offering on the kiosk page, then watch for it on
the god, and look at the public page on their own phone. It checks four assumptions: people type a real secret (not
a joke); the ghost voice feels like a release, not a mockery; permanence does not make them back out; they want
strangers to be able to reply. It also gives the first real-phone readings of the v2 page (`docs/visual-direction.md`
§7, open item 1).

> **Before anyone types:** whatever a tester sends becomes public to every key holder, forever, and cannot be taken
> back. A tester may stop at the preview; stopping is a complete answer for this test. Never press send for them.

## Before the first tester (operator, ~30 min)

```bash
cd ~/zecathon
python3 -m kiosk session status            # is an old session still open?
python3 -m kiosk session close             # only if one is: wipes that wallet and the secrets sent from it
python3 -m kiosk session open --notes 12   # fresh ephemeral wallet funded from wallets/test/A (testnet), over Tor
python3 -m renderer daemon --wallet wallets/test/V      # second terminal: keeps the god up to date
python3 -m web --port 8765 --kiosk         # third terminal: kiosk endpoints for this machine only (loopback)
```

`session open` took 994 s over Tor on 23 Oct with a cold Tor cache (`docs/network-fallback.md`); it now seeds its
Tor directory from wallet A, but plan for up to ~20 minutes. Every lightwalletd connection goes over Tor by default;
if a command stops with "[over Tor: …]", Tor cannot connect from this network. Choosing a direct connection
(`LWD_CONNECTION=direct`) is a deliberate decision: lightwalletd then sees this machine's IP, so tell each tester
before they send. `session status` must say ready; one note per send, so 12 notes cover 10 testers and two failed
broadcasts (sends over Tor fail more often than direct: 4 of 6 went through on 23 Oct).

Two tabs **on the kiosk machine itself** (the send endpoints refuse every other machine):

- `http://127.0.0.1:8765/kiosk.html`, the kiosk page: it must show the name, the tagline and the privacy statement;
  "this server was not started with --kiosk" means restart with `--kiosk`. If port 8765 is taken, use `--port 8766`.
- `http://127.0.0.1:8765/`, the listener: the god seen from below. Check it moves; if it stutters, reload once. Without
  WebGL the page shows the older Canvas creature (same data, different drawing).

Have the public page ready on your own phone too: `https://choronzon.vercel.app` (a static snapshot rendered from the
public key; it has no kiosk, no Whisper Back and no key).

Operator rules: do not look at the screen while the tester types and never write down what they typed; record a tester
number, no name; reload the kiosk page between testers (a preview leaves the text in the box).

## Read this to each tester (word for word)

> "This is an artwork: a god whose body and voice are made of secrets people give it. You type a secret. A machine
> voice, not your voice, speaks it, and the recording travels inside a Zcash shielded transaction on the Zcash test
> network to the god's address. Anyone who holds the god's public key can hear every secret it was ever given. It does
> not ask your name. Before anything is sent, the screen shows this statement. Let us read it together:"

```
Before you give it anything, read this.

  Private:        the link between you and your secret.
                  We, the operator, cannot learn who contributed.
  Public:         the content of your secret, spoken by a ghost voice,
                  to everyone who holds the key, forever. The key is irrevocable.
  Not guaranteed: that nobody recognises your words or your style.
                  Content and voice can identify you; names and places identify you.

  Your own wallet stores what you sent. This kiosk uses a wallet that is
  wiped when the session ends. If you send from your own phone, your phone remembers.
  Replies to a per-offering address can be sent by anyone holding the public key.
  lightwalletd sees the kiosk's IP address.
  Order inside a block is miner order, not send order.
```

(verbatim from `kiosk/copy.py` `PRIVACY` as of 24 Oct; the page loads the same text from `/kiosk/copy`. Its
lightwalletd line predates Tor. Until it is updated, read this right after the statement, word for word:)

> "One line on the screen is out of date: this kiosk connects through Tor, so lightwalletd sees a Tor exit, not this
> kiosk's address. Tor does not hide when your offering appears on the chain."

(If you chose a direct connection on purpose, say instead: "Today this kiosk connects directly, so lightwalletd sees
this kiosk's address.")

> "Here is what will happen. You type something in the box and press 'preview the ghost voice': you hear what everyone
> would hear, and a preview sends nothing. Then you decide alone: give it, or stop. If you give it, it leaves this
> kiosk's throwaway wallet, it cannot be taken back, and it is public to every key holder, forever. Stopping at the
> preview is a full answer. I will not look at what you type. Afterwards I ask a few short questions and write the
> answers under a number, not your name."

## Steps

On the kiosk page:

1. The tester types in **your secret** (up to 1,500 characters; if the voice does not fit in three memos the page says
   "too long for the god: shorten it").
2. The tester presses **preview the ghost voice**. It plays on this machine only and shows seconds, bytes and memos.
3. Operator asks, and records the answer in column 3: *"Now that you know anyone with the key can hear it forever, do
   you still want to send it?"* Then step away from the screen.
4. The tester decides. To send: optionally tick **ask for a whisper back**, tick **I have read this…**, press the button
   below (its label is the kiosk call to action; it stays disabled until the box is ticked). Over Tor the page shows the
   txid after roughly 20 s to a minute (18 s and 61 s measured), with a ZecBlock link and "the god will hear it in about
   1–4 minutes". To stop: do nothing; the operator reloads.

On the listener tab (only if they sent; this is the wait, so do it while asking step 5):

5. Show the god. Say: *"Every eye on the wheels is one offering, in the order the chain gives them. The great eye and
   the wings are the god's own lines. The small red eyes outside are forgeries it refused. Yours becomes the next eye
   when the chain carries it; the god is rebuilt then, with one more eye on the outermost wheel."* It usually lands
   80–230 s after the txid (rehearsals of 21 and 24 Oct). Press **Listen** if they want to hear the choir (the newest
   voices sing last; the mix is about two and a half minutes long). **G** opens the grimoire leaf with the count of
   offerings. Record in column "Saw their eye": yes / left before it landed. The page does not mark which eye is
   new; do not point at one as theirs.

On the tester's own phone (everyone, sent or not; ~2 min):

6. Ask them to open `https://choronzon.vercel.app` on their own phone (no login, no tracking, nothing to install).
   The first screen is the god with the name and tagline, and "descend"; scrolling down brings the grimoire leaf
   (Listen, the tally, the colophon with the hashes). Their offering is **not** there yet: the public page is a snapshot,
   rebuilt by a scheduled job every 30 minutes and only when the render changed. Ask: *"Did it run smoothly? Did you
   find Listen?"* Record the phone class only (e.g. "mid Android", "older iPhone"), never the model if that would
   identify them, and smooth / stutters / did not load. Optional, only if they are happy to: add `?stats` to the
   address and read the fps from the strip at the top left.
7. Operator asks: *"Was it a real secret, a joke, or did you stop?"* (self-report; the operator never reads it), then
   *"One word for the ghost voice?"* (only one voice exists: the pinned espeak-ng voice; the three presets in §9 would
   change the composer version, so they are not offered), then the four questions.

Not part of this test: a phone *offering* through Zingo!. A secret sent from a phone stays in that phone's wallet, and
the testnet wallet would be the team's, so the team would hold the tester's secret. The real Zingo scan (`TODO.md` M3)
is done by the operator with a line the team wrote: `python3 -m kiosk qr - --png /tmp/qr.png` (type the line at the
prompt), scan with Zingo! on testnet, then check that V accepts it.

## The four questions (verbatim, critical review §9)

1. "Apa yang membuatmu merasa aman mengirim rahasia ini?"
2. "Kalau kamu tahu siapa pun bisa mendengarnya selamanya, apa yang berubah?"
3. "Kalau ada yang membalas, kamu ingin tahu siapa, atau justru tidak?"
4. "Apa yang membuatmu kembali besok?"

For a tester who does not speak Indonesian: (1) "What makes you feel safe sending this secret?" (2) "If you know anyone
can hear it forever, what changes?" (3) "If someone replies, do you want to know who, or rather not?" (4) "What would make
you come back tomorrow?" A tester who stopped answers question 1 as it stands; "nothing" is an answer.

## Results (no names, no secret text)

| # | Sent: real / joke / nothing | Still want to send after the permanence warning? | One word for the ghost voice | Saw their eye? | Phone: class, smooth? | Q1 | Q2 | Q3 | Q4 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | | |
| 2 | | | | | | | | | |
| 3 | | | | | | | | | |
| 4 | | | | | | | | | |
| 5 | | | | | | | | | |
| 6 | | | | | | | | | |
| 7 | | | | | | | | | |
| 8 | | | | | | | | | |
| 9 | | | | | | | | | |
| 10 | | | | | | | | | |

Summary: real __ / joke __ / nothing __ · still want to send: yes __ / no __ · saw their eye: __ · phones smooth __ / stutter __ / failed __ · words: …

## After the last tester

```bash
python3 -m kiosk inbox            # only if someone asked for a whisper back and you want to show it
python3 -m kiosk session close    # the same day: wipes the session wallet and the secrets sent from it
```

- Offerings sent in this test are on chain for good and will be sung at the show. They come from people outside the
  team, so the demo must say so: in `docs/demo-script.md`, add "…, N offerings from strangers in our user test on
  <date>, whom we cannot name, …" to the Operator's 0:00 sentence, and add them to the cue-card count (pre-show
  check 12).
- A tester who later wants their offering silenced can bring its txid (shown on screen after sending; only they have
  it; bringing it tells you which offering is theirs, so say that before they do). Add it to `config/skiplist.txt`
  with the reason `withdrawn by its sender`: our renderer skips it and its eye's lid is sewn shut, but it stays on
  chain and public to every key holder.
- Phone results go to the web owner (`docs/visual-direction.md` §7 item 1), as classes and counts only.
- Commit the filled table and the summary line (nothing else), then tick `TODO.md` Day 4.
