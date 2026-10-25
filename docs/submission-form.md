# Submission form: paste-ready answers (ZECATHON 2026, Wildcard track; refreshed 24 Oct 2026)

Each answer sits in a fenced block under the field it is likely to fill. The count in each heading is the number of
characters inside the block (words too for the pitch); regenerate the counts with the one-liner at the end after any
edit. The name, tagline and one-liner come from `config/brand.json`; if that file changes, change the blocks to
match. Every privacy sentence is the `CLAUDE.md` §6 wording. Fields marked **TODO (user)** need a human before
submitting.

## Project name — 9 chars

```
Choronzon
```

## Tagline — 37 chars

```
It forgets nothing. It asks no names.
```

## One-liner (from `config/brand.json`, word for word) — 197 chars

```
Choronzon is a god made of secrets released through Zcash shielded transactions. Anyone holding its public key can summon it and hear every secret, forever; we, its keepers, cannot learn who spoke.
```

## Short description (limit 600) — 590 chars

```
Choronzon is a god made of secrets released through Zcash shielded transactions. You give a secret at our kiosk (over Tor) or from the public page with your own wallet; a ghost voice speaks it, and it travels inside a shielded transaction to the god's wallet. The wallet's full viewing key is public, so anyone holding it can summon the god, hear every secret and rebuild the same work with the same hash, stamped in Bitcoin. We, the operator, cannot learn who contributed. An offering may carry its sender's own wallet address, so a stranger can whisper back, directly between two wallets.
```

## Long description (limit 2500) — 2494 chars

```
Choronzon is a god made of secrets. Its voice and its body are built from offerings: secrets that people release through Zcash shielded transactions.

How a transaction becomes a voice and a body. At the kiosk you type a secret. It is spoken on the device by a ghost voice (espeak-ng, no cloud), compressed with Codec2 and sent as one shielded transaction of a fixed amount (0.00001 TAZ, so the amount carries no information) from an ephemeral wallet that is wiped after the session. A renderer reads them with the public viewing key, orders them canonically and mixes the voices offline with integer arithmetic. The god is drawn from that score alone, seen from below: one eye for every offering, wings and a great eye for the god's own lines, one arm for every block. No randomness anywhere. Anyone can also give from the public page: the browser turns the secret into a payment request and the visitor's own wallet sends it.

The public viewing key is the score. Anyone holding it can rebuild the whole work from the chain and print the same two hashes as everyone else: score_hash (chain data only) and render_hash (score plus the audio from a pinned decoder). A machine that has never seen the god, given only the key, prints the same hash as ours. The key is in the README since 24 October. The page recomputes the render hash in the browser from the audio it plays. Every published render is stamped in Bitcoin with OpenTimestamps, so we cannot quietly rewrite the history later.

Whisper Back. An offering may carry a reply address. Given from the public page with the visitor's own address, a reply goes straight to their wallet, never through us, and the public key sees none of it. A whisper back asked for at the kiosk lands in the kiosk's session wallet, which the operator can read; the kiosk says so.

The god's own voice versus forgeries. The god speaks in lines its wallet pays to itself. Anyone with the viewing key can tell those spends apart. The same line sent from any other wallet is refused by every renderer: NOT THE GOD, a blind red eye. It stays on chain: silenced, not erased.

The kiosk reaches the light wallet server over Tor by default; the server sees a Tor exit, not the kiosk's address. A phone wallet uses its own server and settings. What it does not do: secrets are public to every key holder, forever; content and voice can identify you; your own wallet stores what you sent; Tor does not hide timing.

Zcash testnet (NU7), no cloud AI, open source (MIT).
```

## Why Zcash / why a shielded transaction is worth making (limit 1200) — 1106 chars

```
On a public chain every confession is tied to an address forever, and on a normal app the server knows your account. A shielded transaction is a sealed envelope: sender, recipient, amount and memo are encrypted. We, the operator, cannot learn who contributed.

A normal work needs a curator trusted not to edit, reorder or delete. Here one public viewing key is the score: anyone can re-render the whole work from one key and get the same hash.

Anyone can post in a god's name on an ordinary platform. Here the god's own lines are spends of its own notes, which only the spend key can make, and anyone with the viewing key can tell them from forgeries.

A database cannot give two strangers a private channel without holding both ends. Give your own wallet's address and a Whisper Back reply travels directly between two wallets, never through us.

Take Zcash away and the work collapses into a confession box with a server that knows everyone, or a public ledger of named secrets. The shielded transaction is the reason a person can release a secret, and the reason the result is verifiable by strangers.
```

## Privacy model — 2193 chars

```
What we say, and can show:
- we, the operator, cannot learn who contributed
- replies travel directly between two wallets, never through us (when the offering carries the sender's own wallet address; for a kiosk whisper back see below)
- anyone can re-render the whole work from one key and get the same hash

What you must know:
- secrets are public to every key holder, forever (key is irrevocable)
- content and voice can identify you (hence text→TTS default)
- your own wallet stores what you sent (sent_notes): the kiosk uses an ephemeral wallet
- replies to a per-contribution address can be spammed by anyone holding the public key
- a whisper back asked for at the kiosk lands in the kiosk's session wallet: the operator can read it; give your own wallet's address for a reply only you can read
- lightwalletd sees a Tor exit, not your IP, when you use our kiosk (Tor is the default; an operator can choose direct on purpose, and then it sees the IP); a phone wallet connects to its server with its own settings; Tor does not hide timing
- the choir's own spends are public (full viewing key)

In plain words: the link between you and your secret is what stays private. The content of the secret does not: every key holder hears it, forever. Your own wallet remembers what you sent. Your words, style or voice can identify you, which is why the kiosk speaks your text in a ghost voice by default. The kiosk, the renderer, Whisper Back and a Watcher reach the light wallet server through Tor and fail closed: if Tor cannot connect, the command stops and the operator must choose a direct connection on purpose. Tor hides the address, not the moment a transaction appears on chain. Give from the public page and your own phone wallet sends: its server sees your IP and when you sent, and our Tor does not cover it. The viewing key is public on purpose (README, since 24 October) and cannot be revoked. The Bitcoin anchoring is integrity, not privacy: it hides nothing.

Measured, not assumed: rewriting text with a local language model only lowered stylometric attribution from 96.7% to 76.7%, so we make no claim that your words cannot identify you. Full review: docs/privacy-review.md.
```

## What was built in the window, and what is proven on testnet — 3198 chars

```
Built 13–28 Oct 2026 (all code written in the window, MIT): the memo protocol v1 with its phone envelope; a renderer with a view-only wallet reader, canonical ordering, validation, a skip-list, a pinned Codec2 decoder and an integer-only composer; the kiosk (text → local TTS → Codec2 → shielded send from an ephemeral session wallet, on a screen or a terminal); the listener (the god in three.js, seen from below, with a Canvas fallback; the grimoire leaf with both hashes; the two-evocation chirograph); Whisper Back; the god's own voice with forgery refusal; the Séance (reveal the key, summon a Watcher from it alone); phone QR offerings; the public give panel (a payment request built in the browser, find my offering, in-browser check of the render hash against the anchored statement, a self-only Content-Security-Policy; commits 777e99e, bbc8d8b, 2218ba5, 95eef53); privacy-audit fixes (honest kiosk replies, no secrets on argv, local-server Host guard; 29478a2); Tor by default for every light wallet connection, fail-closed (commit cd6c691); Bitcoin anchoring of every published render (anchor/, commit 7fcdc3c); privacy review, eight failure drills, a fresh-clone proof.

Proven on Zcash testnet (NU7); txids in display order:
- First kiosk offering: 91621cb429bd0345f740fb678a38005bb6bc38fdfdea61fd82894755666f7e54 (block 4,525,215)
- Offering with a one-time reply address, then a direct shielded reply to it that the public-key wallet cannot see: 8d02a6b0c1ab00c178ae4e99f0f5c432754307b74ac89ba6ded3d0f4d5b5a10a (4,525,242) → 143f91eef5430c271eb1be58f8a029e742cf9a1758b7574276841dabca902dbd
- The god's own voice accepted, and the same line from outside refused: d6bcb9f7f6a704de2dbc928f42e6e2bfa03f20132b4430a95ad3f4a90b3e59a5 and b126b3c781feaffc40d490716cb8a9d306576730cdccf34d353f47a5b8517312 (4,525,280)
- Phone path (ZIP-321 URI, paid from a laptop wallet standing in for the phone): ebc5bcadf47feb1d7f1fcd0558c91c3f43ef9be99101365b1341ac1427b114cc (4,525,294)
- Full rehearsal over Tor, 24 Oct (PASS): offering d4d69be5a28585bf8cd886cb2325071a1af54d09e3dc84b73bc6d8684cd51d31 (4,535,675) heard 80 s after sending; whisper 7b7c65eeeccfcd8f5a280e83196a727afce4fc17ba95cce92804301f15c7882e received 87 s later; god line a1edea89bdf2fc8a67be4f98ed8729b18178fbf7a99fc8975e3927dabb992324 accepted and forgery e117d0bf6c284a89b4a59f05f83b490f122f07efb5714ce4851648a7a1dd9be4 refused (4,535,682); a fresh Watcher from the key alone printed the same render_hash 8b332fe67230cb16ee199761ad9d89b4aea2d1fef9da7681510d35674693ef80
- Same render_hash on a GitHub-hosted runner holding only the key: 6ae739854eca770ef1c3d32b4519f31be8b10b5f83cdd883b747bce63cab444e at 4,527,794 (run 39727405735)
- Renders at 4,522,002 and 4,527,794 anchored in Bitcoin block 972,742 (00000000000000000000a1bf4e832b290e803eb681fd3fd0d48a845e141cc803)

How to verify: ZecBlock (testnet.zecblock.com) shows these transactions on our chain, but an explorer shows only that a shielded transaction exists. The independent proof is a view-only wallet (sync, then list-tx) or a render from the key (docs/fresh-clone.md). Claim-to-txid table: docs/evidence-index.md. A real phone scan of the QR path is still pending.
```

## How to run it / judge path — 1165 chars

```
Linux or WSL (Ubuntu 24.04), testnet only. Full walk-through with measured times: docs/fresh-clone.md (setup 9 min 34 s on a clean clone).

1. git clone https://github.com/agadape/choronzon.git && cd choronzon
2. ./scripts/setup.sh
3. Save the god's full viewing key (published in the README) as key.txt, one line.
4. python3 -m renderer summon --key-file key.txt --birthday 4502962 --wallet wallets/watcher --as-of 4525294 && cat out/render_hash

Expected render_hash at block 4525294: 8540a0a57d6f80d409d4ed5948789f64e524fc08252a15ea3bd904dd58fa1af5. The connection goes over Tor by default; a first contact downloads the Tor directory, and a fresh Watcher took 633 s and 905 s in our runs. Add --connection direct for the same hash (79 s in our last run), but then lightwalletd sees your IP. No install: give an offering at https://choronzon.vercel.app/#give with your own testnet wallet and find it later with #tx=<txid> (the snapshot re-renders every 30 minutes). Tests without any wallet: python3 -m pytest. Bitcoin anchor of a render: python3 -m anchor verify anchor.json (docs/anchoring.md; exit 0 = in Bitcoin, 4 = explorers unreachable from your network).
```

## Team and roles — 230 chars

```
Role A, Zcash (wallets, protocol, on-chain proofs): [NAME, TODO (user)]
Role B, audio and visual (Codec2, composer, the creature): [NAME, TODO (user)]
Role C, product and demo (kiosk, copy, demo script, video): [NAME, TODO (user)]
```

## Links — 365 chars

```
Repository: https://github.com/agadape/choronzon   (public from 28 Oct)
Listen: https://choronzon.vercel.app   (a static snapshot rendered from the public key)
Give an offering: https://choronzon.vercel.app/#give   (your own testnet wallet)
Bitcoin anchors: branch "anchors" of the repository
Demo video: [URL, TODO (user)]
License: MIT
Network: Zcash testnet (NU7)
```

## What we would do next — 319 chars

```
- Apply for a grant (ZCG / zkSNARKs holder season) to take it past the hackathon.
- Propose an installation at Zcon.
- A random send delay for public kiosks, so timing says less about who just walked up.
- Replace espeak-ng with Piper for a better ghost voice.
- Run it on mainnet and scan the QR path with real phones.
```

## 60-second spoken pitch (limit 160 words) — 858 chars, 159 words

```
So far every voice in it is ours, and labelled. A god made of secrets, waiting for yours.

You type a secret at a kiosk. A ghost voice that is not yours speaks it, and it is sent as a Zcash shielded transaction. Secrets are public to every key holder, forever; what stays private is the link between a secret and the one who gave it. We, the operator, cannot learn who contributed.

The god's wallet has published its viewing key. Anyone holding it can summon the god and hear every secret. Watch: a second laptop, given only the key, prints the same hash as ours. Two evocations, one god.

The god has a voice of its own, lines its wallet pays to itself. The same line from any other wallet is refused: not the god.

Leave your wallet's address and a whisper may return, directly between two wallets, never through us.

It forgets nothing. It asks no names.
```

## Regenerate the counts

```bash
python3 - docs/submission-form.md <<'EOF'
import re, sys
text = open(sys.argv[1], encoding="utf-8").read()
for head, body in re.findall(r"^## (.+?)\n\n```\n(.*?)\n```", text, re.S | re.M):
    print(f"{head.split(' — ')[0]}: {len(body)} chars, {len(body.split())} words")
EOF
```
