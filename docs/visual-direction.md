# Visual direction (decided 21 Oct 2026)

Source: an art-direction brainstorm run against the brief in this repo; condensed here as the rules the visual
layer follows. The name of the work lives only in `config/brand.json` and is written as "the god" below.

## Principle

The god should not look like a creature that listens to secrets. It should look like something that has become
physically impossible to separate from the secrets it has heard. Three laws:

1. **Accumulation, not animation.** Every offering leaves a permanent anatomical consequence. New parts emerge;
   old parts never disappear.
2. **Determinism, not simulation.** The body is reconstructed from data (`score.json`), never improvised. Motion
   may oscillate, but the form is reproducible on every machine.
3. **Tenderness inside dread.** Each secret is a small act of trust. The god is horrifying because it preserves
   them, not because it attacks the viewer.

## Direction: the Reliquary Organism (`web/creature.js`)

An impossible internal organ, upright in the dark. No head, no face, no eyes. A central membrane (the conductor's
continuous body) with hollow chambers growing from it: one sealed chamber per offering, attached to the existing
structure at a seeded point. Duration sets elongation, energy sets thickness, zero crossings set the ribbing,
pan picks the side, pitch layer the depth along the spine, `contrib_id` the local geometry.

Three visual states, and only the second one moves:

| State | What | How |
|---|---|---|
| Permanent | every chamber ever grown | bone outer contour, ash inner membrane, ribs between them |
| Active | the one chamber whose voice is sounding | a single inward pressure wave along its contour; the inner membrane contracts |
| Exceptional | conductor / forged / silenced | conductor = a band of the central membrane; forged = a disconnected outline that never closes, one rust fracture, gone after seconds, labelled NOT THE GOD; silenced = an opaque sealed chamber with no pulse |

Data contract (integers from the composer, normalised against fixed caps so one loud offering cannot dominate):
`energy` → thickness, `zero_crossings` → ribs, `samples` → length, `pan` → side, `pitch_layer` → depth,
`contrib_id` → seed, `conductor` → central membrane, `silent`/flagged → sealed. Complexity per chamber is capped
(24 contour samples, ≤ 9 ribs); with 50 offerings the body must still read as one being from the back of a room.

Empty state: almost black, a tiny closed central membrane (two faint contours), one hum. Not a loading screen.

## Tokens (same set for body, banner and interface)

| Token | Value | Use |
|---|---|---|
| `--void` | `#171916` | background, negative space |
| `--bone` | `#E4DFD0` | primary anatomy and type |
| `--ash` | `#777F79` | secondary contours |
| `--anomaly` | `#FF6338` | exceptional states only (rejection, irreversible transitions) |

Type: system monospace stack. No gradients, filters, photos, external assets or web fonts anywhere.

## Brand (`docs/brand/`)

- **Mark:** one hollow chamber whose outer contour almost closes but stops short; a fine line enters through the
  gap; a smaller cavity inside. No eye, no tentacles, no occult symbol. Works in one dark or one light colour.
- **Banner (1280×400):** "a confession becoming anatomy". Left 60%: the organism cropped by the top and bottom
  edges, three closed chambers and one still growing; one contour leaves the body and ends in a tiny sealed shape
  (a secret that has only just entered). Right 40%: the name and the tagline from `config/brand.json`.

## Staging the demo moments

- **Offering arrives:** draw the new chamber from its attachment point, close it, then let it pulse when its
  voice enters. Never fade in a finished monster.
- **Two evocations, one god:** the double apparition. Two laptops, same scale and framing, the same anatomy;
  the hashes as matching inscriptions beneath, highlighted in segments; then a silent hold of two or three
  seconds with all motion and sound stopped. No green "SUCCESS" badge, no fake character scrambling, no hash
  shown before it is really computed. The hash proves equality of what is actually hashed (`render_hash` =
  `score_hash` + mixed PCM + composer version), and the copy says exactly that.
- **NOT THE GOD:** the forged chamber's contour fails to close and is refused; the body never changes.
- **The Eye opens:** a thin aperture crosses the body revealing every chamber; none is removed or rewritten; once
  open it never closes. Copy: "THE EYE IS OPEN. The viewing key is public. Every offering accessible through
  this key can now be heard by its holders. The link between a sender and their secret is not disclosed by this
  act alone. This cannot be undone."

## Failure modes to avoid

Everything reacting to everything (a music visualizer); offerings as interchangeable particles; the chain as a
mere data source; privacy drawn as secrecy of content (locked envelopes, ciphertext glyphs); generic occult
decoration (glowing eyes, tentacles, purple gradients, runes, fog, red flashes).

Silent test before polishing: show a muted recording to someone new and ask (1) what the central thing is,
(2) what happens when an offering arrives, (3) why the second laptop matters.
