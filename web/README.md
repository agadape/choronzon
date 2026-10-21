# web/

Listener page: a Canvas 2D creature grown from `out/score.json` plus WebAudio **playback** of `out/mix.wav`
(nothing is mixed in the browser; browser mixing is not bit-exact). Copy comes from `config/brand.json`.

```bash
python3 -m renderer daemon --wallet wallets/test/V   # keeps out/ fresh
python3 -m web --port 8765                            # http://localhost:8765/ (stdlib static server, no deps)
```

- `creature.js`: `G_n = F(G_{n-1}, A_n, I_n)`. One limb per offering in score order; `A_n` = the integer features
  from the composer (`energy` → width, `samples` → length, `zero_crossings` → hue and whether it grows an eye),
  `I_n` = `contrib_id` → angle, curl and which earlier limb it attaches to (an integer hash, no `Math.random()`).
  The same `score.json` draws the same body on every machine.
- While the mix plays, the limb whose voice is sounding (from `start`/`samples` in the timeline) brightens and pulses.
- The page shows `render_hash` and `score_hash` so two laptops can be compared on screen, and whether the decoder and
  voice match the pinned builds. It polls `out/score.json` every 5 s and regrows when the hash changes.
- The server exposes only `web/`, `config/brand.json` and the `out/` directory; paths outside are refused.
