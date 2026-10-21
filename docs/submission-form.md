# Submission form: paste-ready answers (ZECATHON 2026, Wildcard track)

Each answer sits in a fenced block under the field it is likely to fill. The count in each heading is the number of
characters inside the block (regenerate with the one-liner at the end if you edit a block). The name, tagline and
one-liner come from `config/brand.json`; if that file changes, change the blocks to match. Every privacy sentence is the
`CLAUDE.md` §6 wording. Fields marked **TODO (user)** need a human before submitting.

## Project name — 10 chars

```
Choronzon
```

## Tagline — 38 chars

```
It forgets nothing. It asks no names.
```

## Short description (limit 600) — 508 chars

```
Choronzon is a god made of secrets released through Zcash shielded transactions. You type a secret at a kiosk; a local ghost voice speaks it, and it travels as a shielded transaction to the god's wallet. The wallet's full viewing key is public, so anyone holding it can summon the god, hear every secret, and rebuild the same work with the same hash. We, the operator, cannot learn who contributed. Some offerings carry a one-time reply address, so a stranger can whisper back, directly between two wallets.
```

## Long description (limit 2500) — 2314 chars

```
Choronzon is a god made of secrets. Its voice and its body are built from offerings: secrets that people release through Zcash shielded transactions.

How a transaction becomes a voice and a body. At the kiosk you type a secret. It is turned into speech on the device (espeak-ng, no cloud), compressed with Codec2 and sent as one shielded transaction of a fixed amount (0.00001 TAZ, so the amount carries no information) to the god's wallet, from an ephemeral wallet that is wiped after the session. The audio rides in the encrypted memos. A renderer reads the memos, orders them canonically, mixes the voices offline with integer arithmetic, and draws a creature whose body is a pure function of the ordered offerings. No randomness anywhere. Phones can send the same offering through a ZIP-321 QR.

The public viewing key is the score. The god's wallet publishes its full viewing key on purpose. Anyone holding it can rebuild the whole work from the chain and print the same two hashes as everyone else: score_hash (chain data only) and render_hash (score plus the audio from a pinned decoder). No server of ours is involved. A machine that has never seen the god, given only the key, prints the same hash as ours. We call that the Séance: the key is revealed, a second laptop becomes a Watcher, and the two hashes appear side by side.

Whisper Back. An offering may carry a fresh one-time reply address. A listener clicks the offering's limb on the page and pays a short reply to that address. The reply is another shielded transaction that goes straight between the two wallets, never through us, and the public key sees none of it. We proved the loop on testnet with the product code.

The god's own voice versus forgeries. The god can speak: lines its wallet pays to itself. Only the spending key can make those spends, and anyone with the viewing key can tell them apart. The same line sent from any other wallet is refused by every renderer and shown as NOT THE GOD. It stays on chain, listed under skipped: silenced, not erased.

What it does not do: secrets are public to every key holder, forever; content and voice can identify you; your own wallet stores what you sent. The kiosk prints this before every send.

Everything runs on Zcash testnet (NU7), with no cloud AI. The code is open source (MIT).
```

## Why Zcash / why a shielded transaction is worth making (limit 1200) — 1071 chars

```
On a public chain every confession is tied to an address forever, and on a normal app the server knows your account. A shielded transaction is a sealed envelope: sender, recipient, amount and memo are encrypted. We, the operator, cannot learn who contributed.

A normal work needs a curator trusted not to edit, reorder or delete. Here one public viewing key is the score: anyone can re-render the whole work from one key and get the same hash.

Anyone can post in a god's name on an ordinary platform. Here the god's own lines are spends of its own notes, which only the spend key can make, and anyone with the viewing key can tell them from forgeries.

A database cannot give two strangers a private channel without holding both ends. Whisper Back replies travel directly between two wallets, never through us.

Take Zcash away and the work collapses into a confession box with a server that knows everyone, or a public ledger of named secrets. The shielded transaction is the reason a person can release a secret, and the reason the result is verifiable by strangers.
```

## Privacy model — 1388 chars

```
What we say, and can show:
- we, the operator, cannot learn who contributed
- replies travel directly between two wallets, never through us
- anyone can re-render the whole work from one key and get the same hash

What you must know:
- secrets are public to every key holder, forever (key is irrevocable)
- content and voice can identify you (hence text→TTS default)
- your own wallet stores what you sent (sent_notes): the kiosk uses an ephemeral wallet
- replies to a per-contribution address can be spammed by anyone holding the public key
- lightwalletd sees your IP (Tor is on the roadmap)
- the choir's own spends are public (full viewing key)

In plain words: the link between you and your secret is what stays private. The content of the secret does not: every key holder hears it, forever. Your own wallet remembers what you sent. Your words, style or voice can identify you, which is why the kiosk speaks your text in a ghost voice by default. The server we rely on to reach the chain, lightwalletd, sees your IP address and which transactions you fetch; Tor works against it and is off by default. The viewing key is public on purpose and cannot be revoked.

Measured, not assumed: rewriting text with a local language model only lowered stylometric attribution from 96.7% to 76.7%, so we make no claim that your words cannot identify you. Full review: docs/privacy-review.md.
```

## What was built in the window, and what is proven on testnet — 2164 chars

```
Built 13–28 Oct 2026 (all code written in the window, MIT): the memo protocol v1 with its phone envelope; a renderer with a view-only wallet reader, canonical ordering, validation, a skip-list, a pinned Codec2 decoder and an integer-only composer; the kiosk (text → local TTS → Codec2 → shielded send, ephemeral session wallet); the creature and listener page; Whisper Back; the god's own voice with forgery refusal; the Séance (reveal the key, summon a Watcher from it alone); phone QR contributions; privacy review, eight failure drills and a fresh-clone proof (docs/fresh-clone.md).

Proven on Zcash testnet (NU7); txids in display order:
- First kiosk offering, end to end: 91621cb429bd0345f740fb678a38005bb6bc38fdfdea61fd82894755666f7e54 (block 4,525,215)
- Offering carrying a one-time reply address, from the ephemeral kiosk wallet: 8d02a6b0c1ab00c178ae4e99f0f5c432754307b74ac89ba6ded3d0f4d5b5a10a (4,525,242)
- Direct shielded reply to it, received by the kiosk; the public-key wallet sees 0 of it: 143f91eef5430c271eb1be58f8a029e742cf9a1758b7574276841dabca902dbd
- The god's own voice, accepted from the viewing key alone: d6bcb9f7f6a704de2dbc928f42e6e2bfa03f20132b4430a95ad3f4a90b3e59a5 (4,525,280)
- The same line sent from outside, refused as a forgery: b126b3c781feaffc40d490716cb8a9d306576730cdccf34d353f47a5b8517312 (4,525,280)
- Phone path (ZIP-321 URI with the GC1: envelope, paid from a laptop wallet standing in for the phone): ebc5bcadf47feb1d7f1fcd0558c91c3f43ef9be99101365b1341ac1427b114cc (4,525,294)
- Ten seconds of speech rebuilt byte-identical from a view-only wallet: 576ff3939156f5d29c8ed3754016a425eb16aa5d6989002b7ae5a166076775b0 (4,518,093)
- Same render hash on two independent wallets (G6): c46dd5de8b74fecdb38e2b875c98c2f63d097f45f9bc1f667866a35594efe6b4 at block 4,522,002

How to verify: the public testnet explorer currently follows another testnet chain, so it does not show these transactions and its links are not proof. The proof is a view-only wallet: sync it, then run list-tx, or render from the key (docs/fresh-clone.md). Claim-to-txid table: docs/evidence-index.md. A real phone scan of the QR path is still pending.
```

## How to run it / judge path — 787 chars

```
Linux or WSL (Ubuntu 24.04), testnet only. The full walk-through, with measured times, is docs/fresh-clone.md (9 min 34 s end to end on a clean clone).

1. git clone https://github.com/agadape/choronzon.git && cd choronzon
2. ./scripts/setup.sh
3. python3 -m renderer summon --key-file key.txt --birthday 4502962 --wallet wallets/watcher --as-of 4525294 --out out && cat out/render_hash

key.txt is one line: the god's public full viewing key (published in the README and shown at the Séance). The command builds a view-only wallet from the key alone, syncs, and renders. Expected render_hash at block 4525294: 8540a0a57d6f80d409d4ed5948789f64e524fc08252a15ea3bd904dd58fa1af5 (about 50 s after setup). Tests without any wallet: python3 -m pytest. The repository is private until 28 Oct.
```

## Team and roles — 231 chars

```
Role A, Zcash (wallets, protocol, on-chain proofs): [NAME, TODO (user)]
Role B, audio and visual (Codec2, composer, the creature): [NAME, TODO (user)]
Role C, product and demo (kiosk, copy, demo script, video): [NAME, TODO (user)]
```

## Links — 171 chars

```
Repository: https://github.com/agadape/<slug>   (slug from config/brand.json; public from 28 Oct)
Demo video: [URL, TODO (user)]
License: MIT
Network: Zcash testnet (NU7)
```

## What we would do next — 261 chars

```
- Apply for a grant (ZCG / zkSNARKs holder season) to take it past the hackathon.
- Propose an installation at Zcon.
- Route lightwalletd traffic through Tor, so the server no longer sees a visitor's IP.
- Replace espeak-ng with Piper for a better ghost voice.
```

## 60-second spoken pitch (limit 160 words) — 864 chars, 160 words

```
Everything you hear was given before tonight, by people we cannot name. It is a god made of secrets.

You type a secret at a kiosk. A ghost voice that is not yours speaks it, and it is sent as a Zcash shielded transaction. Secrets are public to every key holder, forever; what stays private is the link between a secret and the one who gave it. We, the operator, cannot learn who contributed.

The god's wallet has published its viewing key. Anyone holding it can summon the god and hear every secret. Watch: a second laptop, given only the key, prints the same hash as ours. Two evocations, one god.

The god has a voice of its own, lines its wallet pays to itself. The same line from any other wallet is refused: not the god.

And a whisper may return to you. Replies travel directly between two wallets, never through us.

It forgets nothing. It asks no names.
```
