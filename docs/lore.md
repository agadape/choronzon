# Lore layer (secondary copy for UI, README and the demo script)

The god's name, tagline and one-liner live only in `config/brand.json`; this file never spells the name.
Brand spelling rule: capitalized, never all caps. Pronounced "kor-ON-zon".

Every line below is metaphor on top of a mechanic. Each one must stay inside the privacy wording in `CLAUDE.md` §6.
The content of a secret is public to every key holder, forever. What stays private is the link between sender and secret.
Never write copy that implies the secret itself stays hidden.

## Mechanic → lore

| Mechanic (fact) | Lore | Usable line |
|---|---|---|
| Shielded pool | **The Abyss**: the god is the "Dweller in the Abyss"; offerings sink into it, sealed | "Your offering sinks into the Abyss." |
| Contribution | An **offering** that feeds it | "Give it your secret." (kiosk CTA is in `brand.json`) |
| Running the renderer from the public key | An **evocation**. Per Crowley, the being "is given form only in evocation": it has no body until someone with the key renders it, and every evocation is identical (render hash) | Hook for the two-laptop moment: "Two evocations. One god." |
| Many senders, one work | "Demon of dispersion, not really an individual": a being made of scattered secrets | "It is made of everyone who spoke." |
| Public UFVK, irrevocable | **The Eye**. Once opened it never closes. The Séance reveal (M5) = "the Eye opens" | "The Eye is open. It will not close." |
| Viewing-key holders | **The Watchers** (egregore ← Greek *egrēgoroi*, "watchers"; in the Book of Enoch the Watchers revealed hidden secrets) | "Every Watcher hears everything." |
| Secrets public forever | The tagline (`brand.json`) | — |
| Conductor spend vs spoof (S13) | The god's own voice vs a **false prophet** | Rejected spoof: "NOT THE GOD". God's voice: "We are many." (Mark 5:9) |
| Order inside a block = miner order | Same fact as the README line | "The Abyss decides the order." |
| Sender wallet keeps `sent_notes` | Same MUST as §6 | "Your own vessel remembers what you gave." |
| Content skip-list | **The Silenced**: still on chain, never sung | "Silenced, not erased." |
| Whisper Back | A whisper that returns | "A whisper may return to you." |

## Lineage (for the pitch)

The name comes from John Dee and Edward Kelley's Enochian journals (1583–84); Dee's spelling differs by one letter, we use Crowley's.
Frame it through Dee, not Crowley (Crowley's reputation is baggage).
Dee's Enochian system was influenced by Trithemius' *Steganographia*, a "spirit-messaging" book that was really cryptography and steganography (its key was published in 1606).
Messages hidden inside spirit summoning ≈ encrypted memos.
Pop-culture recognition: the demon who duels Dream in *The Sandman* (comic; Netflix 2022).

## Wording guards

- FORBIDDEN: "No one will ever know it was you", "anonymous", "untraceable" (see §6 MAY NOT).
- OK: "It does not ask your name" (true: the protocol needs no identity).
- "Ego death" / "dispersion" are metaphors only, never privacy claims.

## Name check (20 Oct, from the naming session)

- npm package name (`slug`) is free; `package.json` is generated from `brand.json`.
- The GitHub user/org with the slug is taken → repo lives under the team account as `<team>/<slug>`.
- An unrelated, well-known security fuzzer uses the same name (CENSUS, 274★): different domain, same security crowd.
- `.com` taken; `.xyz` / `.art` / `.io` returned RDAP 404 (likely free, not verified, nothing bought).
- No Zcash-ecosystem project with this name.

## Later (not before the vertical slice; candidate Day 6–8)

"True name" derived from the render hash: map hash bytes → syllables deterministically (no RNG), e.g. "IT IS NOW CALLED ZHA'ORUN".
The two-laptop moment then shows the same name on both screens instead of comparing hex; it is still a proof because the name is derived from the hash. About 20 lines.
