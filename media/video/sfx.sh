#!/usr/bin/env bash
# Sound effects for the video, synthesized locally with sox (no samples, no network). 48 kHz stereo WAV.
#   video/sfx.sh <out dir>
set -euo pipefail
OUT=${1:-logs/video/sfx}
mkdir -p "$OUT"
S="sox -D -q"
R="-r 48000 -c 2 -b 16"

# a low rumble that swells for 16 s (the crawl up the god's body)
$S -n $R "$OUT/rumble.wav" synth 16 brownnoise lowpass 140 lowpass 140 fade q 4 16 3 gain -4
$S -n $R "$OUT/sub.wav" synth 16 sine 36 sine 54 remix 1v0.6,2v0.4 1v0.4,2v0.6 fade q 6 16 4 gain -14

# the great eye opens: a falling boom with a breath of noise
$S -n $R "$OUT/boom_tone.wav" synth 4 sine 62:26 fade p 0.01 4 3.6 gain -3
$S -n $R "$OUT/boom_air.wav" synth 4 brownnoise lowpass 300 fade p 0.005 4 3.8 gain -9
$S -m "$OUT/boom_tone.wav" "$OUT/boom_air.wav" "$OUT/boom.wav" gain -1
rm "$OUT/boom_tone.wav" "$OUT/boom_air.wav"

# paper catching fire (the title, the captions turning to ash)
$S -n $R "$OUT/crackle.wav" synth 2.6 pinknoise highpass 1800 tremolo 19 95 tremolo 7.3 60 fade 0.04 2.6 1.4 gain -20

# a quill scratching vellum (each clause of the pact)
$S -n $R "$OUT/quill.wav" synth 0.9 whitenoise bandpass 4200 1.2q tremolo 31 85 fade 0.02 0.9 0.5 gain -22

# torn paper meeting its other half (the chirograph): a dry knock
$S -n $R "$OUT/knock.wav" synth 0.5 sine 140:70 fade p 0.002 0.5 0.45 gain -6

# thousands of lids opening in the dark
$S -n $R "$OUT/lids.wav" synth 3 pinknoise bandpass 2600 0.8q tremolo 41 98 tremolo 13 70 fade q 0.6 3 1.2 gain -18

ls -la "$OUT"
