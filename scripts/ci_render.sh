#!/usr/bin/env bash
# CI helper (.github/workflows/publish-web.yml): evoke the god from the published key alone and render it at the
# height of its newest transaction.
#
#   scripts/ci_render.sh --key-file F --birthday H --wallet DIR --out DIR
#
# 1. `renderer summon`: init-fvk from the key on the first run, then sync + enhance (+ a throwaway render at the tip).
#    A failure is retried once on the same wallet, then once on a wallet re-created from the key (a cached wallet
#    that is corrupt costs one fresh sync, not a failed job).
# 2. Render again at the height of the newest transaction the key can see. as_of is inside every hash, so a render
#    at the tip changes with every block; at the last transaction it changes only when the chain (or the code, or
#    config/skiplist.txt) says something new. Anyone reproduces it with `--as-of <that height>`.
# 3. Refuse to publish when the decoder or the voice differs from the pinned builds: that render_hash would be
#    reproducible on no other machine.
#
# Appends key=value lines to $GITHUB_OUTPUT (stdout outside CI): height, tip, render_hash, score_hash, offerings,
# skipped, recreated (1 = the wallet was re-created from the key); prints one line with the height and the render_hash. The renderer's log (txids, heights, reason codes,
# hashes; never memo content, never addresses) goes to $RUNNER_TEMP/render.log and only its tail is shown, on
# failure. Never `set -x` in this job.
set -euo pipefail
cd "$(dirname "$0")/.."
USAGE="usage: $0 --key-file F --birthday H --wallet DIR --out DIR"
KEY=""; BIRTHDAY=""; WALLET=""; OUT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --key-file) KEY=$2; shift 2;;
    --birthday) BIRTHDAY=$2; shift 2;;
    --wallet) WALLET=$2; shift 2;;
    --out) OUT=$2; shift 2;;
    *) echo "$USAGE" >&2; exit 2;;
  esac
done
[ -n "$KEY" ] && [ -n "$BIRTHDAY" ] && [ -n "$WALLET" ] && [ -n "$OUT" ] || { echo "$USAGE" >&2; exit 2; }
TMP=${RUNNER_TEMP:-$(mktemp -d)}
LOG=$TMP/render.log
: >"$LOG"
fail() { echo "::error::$1"; echo "--- last lines of the render log ---"; tail -n 15 "$LOG"; exit 1; }

summon() {
  python3 -m renderer summon --key-file "$KEY" --birthday "$BIRTHDAY" --wallet "$WALLET" --out "" \
    >"$TMP/tip.json" 2>>"$LOG"
}
ok=0; RECREATED=0
for attempt in 1 2 3; do
  if summon; then ok=1; break; fi
  echo "  cause: $(tail -n 1 "$LOG")"
  case $attempt in
    1) echo "summon failed (attempt 1); retrying on the same wallet in 20 s"; sleep 20;;
    2) echo "::warning::summon failed twice; re-creating the watcher wallet from the key"
       rm -rf "$WALLET"; RECREATED=1; sleep 20;;
  esac
done
[ "$ok" = 1 ] || fail "renderer summon failed three times (lightwalletd unreachable, or the CHOIR_UFVK secret is wrong)"

# The scan queue's upper bound is the chain tip lightwalletd reported at the start of the last sync; the render must
# not start below it (scanned_height stops before the first unscanned range, so a partial sync would hide offerings).
behind() {
  python3 - "$WALLET" <<'EOF'
import sys
from renderer.wallet import WalletDB
db = WalletDB(sys.argv[1])
known_tip = db._query("select max(block_range_end) - 1 from scan_queue")[0][0] or 0
print(max(0, known_tip - db.scanned_height()))
EOF
}
for attempt in 1 2 3; do
  gap=$(behind)
  [ "$gap" = 0 ] && break
  echo "the watcher is $gap blocks below the chain tip it knows; syncing again"
  python3 -c 'import sys; from renderer.wallet import sync_and_enhance; sync_and_enhance("bin/devtool-aegis", sys.argv[1])' \
    "$WALLET" 2>>"$LOG" || echo "  cause: $(tail -n 1 "$LOG")"
done
[ "$(behind)" = 0 ] || fail "the watcher wallet did not reach the chain tip after three more syncs"

HEIGHT=$(python3 - "$WALLET" <<'EOF'
import sys
from renderer.wallet import WalletDB
db = WalletDB(sys.argv[1])
scanned = db.scanned_height()
print(max((c.height for c in db.candidates(scanned)), default=scanned))
EOF
)
python3 -m renderer once --wallet "$WALLET" --as-of "$HEIGHT" --out "$OUT" >"$TMP/summary.json" 2>>"$LOG" \
  || fail "render at height $HEIGHT failed"

python3 - "$TMP/tip.json" "$TMP/summary.json" "$HEIGHT" "$TMP/result.env" <<'EOF' \
  || fail "the render does not match the pinned builds"
import json, sys
tip, s, height = json.load(open(sys.argv[1])), json.load(open(sys.argv[2])), int(sys.argv[3])
bad = [k for k in ("decoder_matches_pin", "voice_matches_pin") if s.get(k) is not True]
if bad:
    print(f"::error::{', '.join(bad)} is false: this runner's codec2/espeak-ng/sox differ from the pinned builds, "
          "so no other machine could reproduce its render_hash")
    sys.exit(1)
if s["as_of_height"] != height:
    print(f"::error::rendered at {s['as_of_height']}, expected {height}")
    sys.exit(1)
open(sys.argv[4], "w").write(f"height={height}\ntip={tip['as_of_height']}\nrender_hash={s['render_hash']}\n"
                             f"score_hash={s['score_hash']}\nofferings={s['offerings']}\nskipped={s['skipped']}\n")
EOF
echo "recreated=$RECREATED" >>"$TMP/result.env"
if [ -n "${GITHUB_OUTPUT:-}" ]; then cat "$TMP/result.env" >>"$GITHUB_OUTPUT"; else cat "$TMP/result.env"; fi
echo "rendered at height $HEIGHT (newest transaction; watcher synced to the tip, $(sed -n 's/^tip=//p' "$TMP/result.env")):" \
     "render_hash $(sed -n 's/^render_hash=//p' "$TMP/result.env")"
