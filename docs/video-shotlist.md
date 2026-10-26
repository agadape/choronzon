# Video shot list: under 3 minutes, one person, screen + phone (26 Oct 2026)

The submission video opens with the hook (a secret becoming part of the god), then says plainly what is private and
what is not, then proves it. The god's name lives in `config/brand.json`; this list says "the god". The stage run with
two laptops and a judge is `docs/demo-script.md`; this is the recorded version for a solo developer.

**Rules for the edit:** never fake timing. Every cut that skips waiting time carries an on-screen label with the real
gap ("+34 min: the public snapshot re-rendered", "+90 s"). Events are never reordered. A clip recorded on another day
says its date on screen. Show no `.age` file, seed, wallet DB, `state.json` or reply address; the full viewing key is
public (README since 24 Oct, `key.txt` on the site) and may be shown. Keep a clock in the terminal prompt.

## Before recording

- Kiosk session open and ready: **8 notes**, checked 26 Oct (`python3 -m kiosk session status` → `ready: true`,
  `notes_left: 8`). One live offering per note.
- Spendable notes on B (god line), A (forgery), L (whisper): `python3 -m kiosk pool wallets/test/<W> --notes 3`
  at least an hour before (a self-split needs 10 confirmations). Tor warm on V, B, A, L (one `sync` each).
- Phone: Zingo! on testnet with a little TAZ (the give panel's "No testnet wallet yet?" points to
  `faucet.testnet.valargroup.dev`, which wants the `utest1…` form) and a fresh shielded-only `zutest1…` receiving
  address for the reply (the page accepts only shielded-only addresses: a reply address is public to every key holder).
- Public page state: `https://choronzon.vercel.app/static.json` says the height and render hash of the snapshot
  (26 Oct 08:17 UTC: 4,543,330, `d216440b…`; the local render of V at 4,543,330 printed the same `d216440b…`).
  The snapshot re-renders every 30 minutes and redeploys only when the render changed.

## The shots

| # | Time | On screen | Exact command / URL | Say (short) | Proof that it works |
|---|---|---|---|---|---|
| 1a | 0:00–0:10 | **Phone**, close-up: the give panel. A secret is typed, *I have read this* ticked, *make the payment request*: the QR. Zingo! scans it and sends. Label: "a new offering, sent now · Zcash testnet". | `https://choronzon.vercel.app/#give` | (no voice, or one line) "A secret, typed. No name." | first offering from this panel by a real phone wallet: `efc5ef44…` at 4,543,330, accepted by the public-key wallet V (`docs/evidence-index.md`, "The public give path closed by a real phone wallet") |
| 1b | 0:10–0:20 | Label: "+N min: the public snapshot re-rendered" (the real gap). **Screen**: the god seen from below; the offering's eye burns, the other eyes turn to it, and its ghost voice plays from the mix. | `https://choronzon.vercel.app/#tx=<txid from Zingo>` (or `#offering=<number the panel showed>`), then **hear it** (a link opened cold cannot start audio by itself) | "The ghost voice reads it. Now it is part of the god." | find-my-offering (`bbc8d8b`); the same works today for `#tx=efc5ef447b0b72a885bb3060e1c6d7bc21b6a73526d4490dd17f38df7d0b645a`. If no new offering is sent, use that one and label it "sent 26 Oct" |
| 2 | 0:20–0:32 | The god, Listen playing. Text on screen = the sentence. | — | "Everyone who holds this key hears every secret, forever. We, the operator, cannot learn who gave one. And a stranger can answer you wallet to wallet, never through us." | `CLAUDE.md` §6 MAY-say wording (see note 1 below) |
| 3 | 0:32–0:47 | **The honesty card** (static, readable for 10 s): secrets are public to every key holder, forever; the key cannot be revoked · your own wallet stores what you sent, and a phone wallet's server sees your IP when it broadcasts and, the key being public, can read that offering · timing can link you; Tor does not hide timing · the ghost voice hides your voice, not your writing style · Zcash testnet. | — | "What it does not hide, in plain words." | README "Privacy", `CLAUDE.md` §6 MUST-say list |
| 4 | 0:47–1:17 | **Terminal**: the god's own line from its own wallet, then the same kind of line from another wallet. Renderer log: one `offering tx=…` (accepted), one `skip tx=… reason=forged-conductor`. Then **screen**: the wings / great eye while the god's line sounds; *find* with the forgery's txid: "On chain at height …, but not voiced: it claims the god's own voice without being the god." | `printf 'we are many.' \| python3 -m kiosk speak - --from wallets/test/B` · `printf 'i am the god.' \| python3 -m kiosk speak - --from wallets/test/A --forge` · `python3 -m renderer daemon --wallet wallets/test/V` (log) · `https://choronzon.vercel.app/#tx=<forgery txid>` | "The god speaks only from its own wallet. Anyone holding the key can check that. The same words from anyone else are refused: not the god." | 25 Oct rehearsal PASS (`logs/demo_20261025T100439Z.log`): god `c24752f1…` accepted at 4,539,885, heard 88 s after sending; forgery `be4a48ee…` refused (`forged-conductor`) at 4,539,886, 28 s later. Use those (label "25 Oct") or send fresh ones and cut the wait with a label |
| 5 | 1:17–1:57 | **Screen**: `key.txt` on the site, then the grimoire leaf (**G**, **F**): render hash and the line "Verified in this browser: SHA-256(score hash ‖ the audio you hear ‖ choir/2) = …". **Second machine** (a clean clone with `scripts/setup.sh`, no wallet): the key from the site into a file, summon at the page's height; it prints the same `render_hash` as the page. Split screen for the last 5 s. Label the wait. | `https://choronzon.vercel.app/key.txt` · second machine: `curl -fsS https://choronzon.vercel.app/key.txt > /tmp/eye.key && python3 -m renderer summon --key-file /tmp/eye.key --birthday 4502962 --wallet wallets/watcher --as-of <as_of_height from static.json>` (add `--tor-cache-from <a warm wallet dir>` if that machine has one) | "The key is public. A machine that has never held a wallet summons the god from the key alone, and gets the same hash as the page. The blockchain is the score." | 25 Oct: fresh Watcher = this laptop = `78d33def…` at 4,539,886, summon step 173 s over Tor with a warm cache (same log); cold over Tor 633 s and 905 s, `--connection direct` 79 s, same hash (`docs/network-fallback.md`); GitHub runner from the key alone `6ae73985…` at 4,527,794 (run 39727405735); page = V = `d216440b…` at 4,543,330 (26 Oct) |
| 6 | 1:57–2:37 | **Terminal** at the installation: a whisper to the phone's offering, which carries the phone's own `zutest1…` address. Then the **phone**: Zingo! shows the incoming memo `GC1R:<number>:you are not alone.` Then V's `list-tx`: the whisper is not there. Label the wait. | `printf 'you are not alone.' \| python3 -m renderer whisper <phone txid> --wallet wallets/test/V --phone --send-from wallets/test/L` · `bin/devtool-aegis wallet -w wallets/test/V list-tx` (after `sync`) | "A stranger answers. The reply goes straight to that phone's wallet, never through us. The public key sees none of it." | Whisper Back to a kiosk offering, 25 Oct: `a523f45c…` received after 90 s (same log); first live loop `8d02a6b0…` → `143f91ee…`, V sees 0. **A whisper to a phone's own address is not recorded yet**: if it does not arrive, show the kiosk version instead (shot 6b) and say so |
| 6b | (fallback) | Terminal: a kiosk offering with a reply, the whisper, `kiosk inbox <contrib_id>`. | `python3 -m kiosk offer --reply` (typed at the prompt) · the whisper command above with that txid, without `--phone` · `python3 -m kiosk inbox <contrib_id>` | "At the kiosk the reply lands in the kiosk's wallet, which we hold: for a reply only you can read, give your own wallet's address." | `logs/demo_20261025T100439Z.log` (offering `9722cf47…` heard after 60 s, whisper received after 90 s) |
| 7 | 2:37–2:52 | The god, Listen; the URL large; "give it a secret"; "Zcash testnet". | `https://choronzon.vercel.app/#give` | "Give it a secret. It forgets nothing. It asks no names." (tagline from `brand.json`) | — |

About 2:52 in total; trim shot 5 first if it runs long.

## Notes

1. The sentence in shot 2 is not the audit's proposed wording ("no one, including us, can learn from the transaction
   who gave one"). That version says more than we can show: when someone gives from their own phone, the phone
   wallet's server sees the IP at broadcast and, the key being public, can read that offering (`CLAUDE.md` §6). The
   sentence used here keeps to the MAY-say claims: "we, the operator, cannot learn who contributed" and "replies travel
   directly between two wallets, never through us". The latter holds only when the offering carries the sender's own
   address, which is why shot 6 answers the phone's offering.
2. Shot 1 is two clips because the public page is a snapshot: the send (phone) and the find (after the next render)
   happen tens of minutes apart, and the label says how many. For a faster find, the installation's local page
   (`python3 -m web --port 8765`, fed by `renderer daemon`) shows a new offering 60–230 s after its txid (25 Oct: 60 s;
   24 Oct: 80 s; 21 Oct: 100 s and 226 s); label it as the local page if you use it.
3. The kiosk session's 8 notes are for live kiosk offerings (shot 6b, or a kiosk version of shot 1); shot 4 sends
   from B and A, shot 6 from L. One note per send. Over Tor a send takes
   about 20 s to a minute (`docs/network-fallback.md`).
