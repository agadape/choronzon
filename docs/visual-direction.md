# Visual direction (decided 24 Oct 2026, replaces the 21 Oct "Reliquary Organism")

The name of the work lives only in `config/brand.json` and is written as "the god" below.
Reference mockups (exploration code, not production): `design/explorations/god6.html` + `god6.js` (the chosen
direction), `folio.html` (the leaf, tilt / turn / tear), screenshots in `design/explorations/shots/`.
The path there (2D seal → WebGL black sun → three.js Ophan → budget pass → cinematic pass → icon) is kept in the
same folder for comparison; only god6 + folio are the spec.

## 1. Principle

Cosmic horror and godhood, in that order of the senses: **you look up at it**, it is too large for the frame, it is
symmetric and still like an icon, and everything on it is looking at you. Rules taken from the research
(scale the eye cannot hold, the iceberg, wrongness, cold contaminated light, "never a cool monster to admire"):

1. **The worshipper's view.** Low camera, close, looking up. Dragging turns you a little (yaw ±0.75 rad, pitch
   −0.12…0.3); let go and you are brought back. No zoom, no free orbit, no auto-rotate: it is not a model viewer.
2. **An icon, not a tangle.** Symmetric about the vertical axis. Nothing crosses in front of the great eye.
3. **Accumulation.** Every offering adds a permanent part; old parts never move (slot = order).
4. **Determinism.** The form is a pure function of `score.json`. Time only animates (spin, writhe, breathe, blink),
   playback only wakes what sounds, the pointer only moves gaze and a few degrees of camera. No `Math.random()`;
   noise is positional hashing seeded from `render_hash`. Pixel output may differ by GPU; nothing visual is hashed.
5. **The human document is warm, the god is cold.** The grimoire leaf (vellum, ink, rubric, gold leaf) is the
   only warm thing on screen.

## 2. The god (three.js scene, `web/god.js`, built from `god6.js`)

| Part | Meaning (data) | Drawing rules |
|---|---|---|
| **Great eye** (r 1.85, centre) | the god's own voice (`offerings[].conductor`) | realistic eyeball: cornea parallax iris, crypts, collarette, dark limbal ring, red sclera veins, wet highlight; flesh lid shell with almond cut. Gaze follows the pointer with **saccades** (jumps every 1.9 s, offsets from `genes(seed, floor(t/1.9))`). Pupil dilates and lids open wider while a conductor line sounds. |
| **Halos** (concentric wheels, R = 2.3 + 0.92k) | capacity: wheel k holds 10 + 4k eyes; a new wheel appears when the last is full | lathed rim profile with a channel and raised lips; blood-bronze (`#1f0b06`-ish base), lips polished gold, grime in the cuts, unreadable script (canvas texture cut from the hash) as bump. Wheel 0 faces the camera; pairs lean ±0.34 rad (mirrored). Each spins on its own axis only, so the silhouette never changes. |
| **Eyes on the halos** | **one per offering**, slot = order (`n` fills wheel 0 first) | size `0.25 + 0.07·secs`; iris colour from `contrib_id` genes (4 cold/sickly tones); stripes `14 + 40·bright`; slit pupil when `pitch_layer ≥ 2`; set on the front lip of the halo, facing you. Every eye turns in its socket to look at the camera, each with its own lag (`0.025…0.135` per frame), so they turn one after another. A blink travels round the wheels (period ≈ 9 s). |
| **A voice sounding** | the timeline entry under playback | that eye opens wide, its iris burns pale green (HDR, feeds the rays), and a sickly light falls on the flesh near it; **every other eye turns to look at it**; the great eye keeps watching you. |
| **Silenced** (`skipped[].reason == "flagged"`) | still on chain, never sung | the lid is sewn shut (stitches drawn in the lid shader). |
| **Refused forgeries** (`forged-conductor`) | false prophets | small blind red eyes drifting outside the halos, flickering, never joining. |
| **Six wings** | the god's own lines: pairs = min(3, ceil(conductors/2)); feathers per wing grow with them | feathers are **pages**: ivory paper, the same unreadable script, frayed edges, only long flight pages burnt at the tip; three layers (primaries, secondaries, coverts), mirrored. Lit cold from behind (pages glow), immune to the Abyss's red (`underK 0.08`). They breathe slowly; while the god speaks they open and tremble. |
| **The Dweller in the Abyss** | **one arm per block** that carried offerings (`offerings[].height`) | arm thickness and reach = offerings in that block; tip curl = log10 of the wait since the previous block; a block with ≥ 2 offerings opens an eye in a lid of flesh at the arm's root. Arms are a mirrored fan rising from a living mass below (bruise/old-blood skin, jaundiced patches, veins, pores, slime, suckers, muscle rings, peristaltic wave, breathing mass, blisters). The two heaviest blocks frame the lower corners in front; every other arm stays behind the halos. |
| **World** | none (environment only) | nebula sky that "is not ours" with a faint arc of something larger, horizon glow, black engraved plain, distant mountains, the red pit the mass rises from, dust motes, embers rising, drifting rock shards, **one Watcher** (~16 css px) on a rock pillar for scale. |

Light: almost no fill; a cold key; a hard cold rim from behind; a **cold light that is always behind the god**
relative to the camera (the cage and arms cut it into rays); dull red from the pit below; fog that pools red low.
Post: scene → HDR target → god rays (half res, dithered, 30 taps) → composite (anamorphic streak, chromatic
aberration toward edges, ACES, slight desaturation, vignette, film grain). Optional ink pass (`I`) turns the frame
into a cross-hatched engraving; it needs retuning for the darker lighting (open item).

## 3. Weight (measured in the browser on god6, 1440×900 desktop)

| | measured | budget for the build |
|---|---|---|
| draw calls (scene) | 18 (+2 post passes) | ≤ 25 + ≤ 3 passes |
| triangles | 96,560 | ≤ 120k desktop, ≤ 60k phone (`PHONE` path halves segments) |
| materials / programs | 16 / 15 | — |
| three.js | `three.module.min.js` r160 + `BufferGeometryUtils.js`, 686 KB decoded | vendor under `web/vendor/three/`, **no CDN at runtime**; add to `THIRD_PARTY_NOTICES.md` (MIT) |

How it stays light: every eye is one `InstancedMesh` (per-instance iris, pattern, wake), every lid one, every
feather one, all 29 arms merged into one mesh (per-vertex phase), detail (suckers, pores, engraving) as shader
relief via `dFdx/dFdy`, custom lighting instead of PBR + environment maps, no bloom pass, DPR capped
(1.25 desktop, 1 phone) with adaptive resolution (frame > 22 ms → lower), render paused while the tab is hidden.
Respect `prefers-reduced-motion`: no camera sway, slow writhe, no saccades.
Fallback without WebGL: keep the current Canvas 2D creature (`web/creature.js`) as is.

## 4. Pages

### Listener (`index.html`)
- **Desktop, first screen: the god only.** Name centred at the top (from `brand.json`, small, text-shadowed), tagline
  under it; bottom centre two buttons: **Listen** and **open the grimoire · G**; the privacy line stays visible
  bottom-left (fixed copy, §5).
- **Open the grimoire:** the folio leaf slides in from the right (1.1 s ease), the god's view offset glides left by
  (leaf + 80)/2 px. `close · G` brings the god back to the centre.
- **The leaf** (from `folio.html`): black-stained vellum ("Black Hours"), recto = height, name with rubric initial,
  tagline, one-liner, tally (offerings · refused · silenced), Listen; a perforated **witness stub** (true name in gold
  leaf, height, first/last hash block). Tilts with the pointer; **F** turns it; the verso is the colophon (render
  hash, score hash, pins, how-to-verify, ZecBlock link, two evocations, Whisper Back note). **T** / drag tears the
  stub off: the torn edge is cut from the render hash (32 bytes = 32 fibres, finer score-hash fibres between).
- **Phone (≤ 900 px):** canvas fixed behind; first screen = the god + name/tagline overlay + "descend"; the leaf and
  the privacy line follow below on scroll. 16 px gutters, no horizontal scroll.

### Two evocations (`apparition.html`): the chirograph
Two leaves side by side, each torn from its own evocation. The right stub slides to the left leaf's edge: with the
same render hash the jags fit exactly; with a different one they visibly do not, and the gap is drawn in rubric.
Then the silent hold. No green badge.

### Séance (`?seance`)
The great eye's lids are shut (open = 0) and the hashes sealed. "The Eye opens" = the lids part over ~3 s and stay
open; then the colophon shows the hashes. Copy unchanged from the current page.

### Kiosk (optional, after the deadline-critical work)
The offering slip is a leaf: the secret is written on the upper part, and the perforated stub where a name would go
stays with the person ("Give it your secret. Keep your name.", `brand.json` kiosk CTA). Not on the public site.

## 5. Tokens, type, copy

| Token | Value | Use |
|---|---|---|
| `--night` | `#050302` | page behind everything |
| `--vellum` | `#1d1710` | the leaf |
| `--ink` | `#ebdfc2` | type and lines on the leaf |
| `--sepia` | `#8f7956` | secondary type |
| `--gilt` / `-hi` / `-lo` | `#d6a94c` / `#f8e1a0` / `#6f501c` | gold leaf: true name, Listen; sheen follows the tilt |
| `--rubric` | `#c8431f` | one initial per page, exceptional states only |

Scene colours live in the shaders (cold rim `~#8cf2d0`, wake `~#80ffb8`, blood-bronze, ivory pages, bruise flesh).
Type: **IM Fell English** + **IM Fell English SC** (SIL OFL), self-hosted under `web/fonts/`; hashes in a lining
serif (Georgia) so `1`/`I` never confuse. The mockups load Google Fonts and jsDelivr: **the build must not.**
Copy that must stay verbatim: "every offering is public to every key holder, forever. we, the operator, cannot learn
who contributed." Never "anonymous" / "untraceable". The full viewing key never appears on the public site.

## 6. Delete / replace

- `web/creature.js` stays only as the no-WebGL fallback; the main listener body becomes the three.js god.
- `docs/brand/` banner/mark from 21 Oct ("Reliquary Organism") are superseded; regenerate the OG image from a god6 frame.
- The 21 Oct rules "Canvas 2D only", "no gradients/filters", "system monospace" are lifted (user decision, 23–24 Oct).

## 7. Open items

1. Phone check on a real device (FPS untested; the `PHONE` path exists).
2. Ink mode (`I`) is too dark after the new lighting; retune or drop.
3. "Every eye turns to the voice": from the front, eyes turned away read as pink beads; consider a half turn.
4. Lower wing pair still slightly scaly at the edges.
5. Vendor three + fonts, wire `PLAY_T` from the listener's WebAudio clock, and the leaf events (`leaf-layout`).
