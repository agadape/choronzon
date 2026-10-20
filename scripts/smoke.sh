#!/usr/bin/env bash
# Quick health check of the environment and of the proven pipeline. Safe: read-only on chain.
# Two chain checks with two purposes:
#   regression — spikes/g6_render.py at the fixed G6 height must reproduce the recorded hash
#   health     — render at the current height; V (view-only) and B (spend key) must agree
set -uo pipefail
cd "$(dirname "$0")/.."
export PATH="$PWD/bin:$PATH"   # the pinned codec2 in bin/ wins over any system copy
FAIL=0
ok(){ echo "  ✅ $*"; }; bad(){ echo "  ❌ $*"; FAIL=1; }

G6_HEIGHT=4522002
G6_ACCEPTED=7
G6_HASH=c46dd5de8b74fecdb38e2b875c98c2f63d097f45f9bc1f667866a35594efe6b4

field(){ grep -oE "\"$1\": \"?[0-9a-f]+" | head -1 | grep -oE "[0-9a-f]+$"; }  # one field of g6_render's JSON header
sync(){ bin/devtool-aegis wallet -w "wallets/test/$1" sync -s zecrocks >/dev/null 2>&1 \
     && bin/devtool-aegis wallet -w "wallets/test/$1" enhance -s zecrocks >/dev/null 2>&1; }
height(){ bin/devtool-aegis wallet -w "wallets/test/$1" balance 2>&1 | grep -oE "Height: [0-9]+" | grep -oE "[0-9]+"; }
render(){ python3 spikes/g6_render.py "wallets/test/$1" "$2"; }

echo "[protocol unit tests]"; python3 spikes/wb_protocol.py >/dev/null && ok "wb_protocol self-tests" || bad "wb_protocol self-tests"
echo "[codec2 / tts]"
[ -x bin/c2enc ] && [ -x bin/c2dec ] && ok "codec2 pinned (bin/c2dec)" || bad "pinned codec2 missing (run scripts/setup.sh)"
command -v espeak-ng >/dev/null && ok "espeak-ng" || bad "espeak-ng"
echo "[devtool]"; [ -x bin/devtool-aegis ] && ok "bin/devtool-aegis present" || { bad "bin/devtool-aegis missing (run scripts/setup.sh)"; exit 1; }
echo "[lightwalletd testnet]"; timeout 60 node spikes/s1_lightd.mjs test 2>/dev/null | grep -q '"chainName": "test"' && ok "testnet.zec.rocks reachable" || bad "lightwalletd unreachable"

if [ ! -d wallets/test/V ]; then
  echo "[wallets] not present — skipping chain render"; exit $FAIL
fi

echo "[sync]"
sync V && ok "V (view-only) synced" || bad "V sync failed"
if [ -d wallets/test/B ]; then sync B && ok "B (choir) synced" || bad "B sync failed"; fi

echo "[regression: G6 at height $G6_HEIGHT]"
OUT=$(render V $G6_HEIGHT)
A=$(field accepted <<<"$OUT"); RH=$(field render_hash <<<"$OUT")
echo "  accepted=$A render_hash=$RH"
[ "$A" = "$G6_ACCEPTED" ] && [ "$RH" = "$G6_HASH" ] && ok "G6 reproduced" || bad "G6 mismatch (expected $G6_ACCEPTED accepted, $G6_HASH)"

echo "[health: render at current height]"
H=$(height V)
if [ -d wallets/test/B ]; then HB=$(height B); [ -n "$HB" ] && [ "$HB" -lt "$H" ] && H=$HB; fi
OUT_V=$(render V "$H")
echo "  height=$H accepted=$(field accepted <<<"$OUT_V") skipped=$(field skipped <<<"$OUT_V") render_hash(V)=$(field render_hash <<<"$OUT_V")"
if [ -d wallets/test/B ]; then
  OUT_B=$(render B "$H")
  [ "$(field render_hash <<<"$OUT_B")" = "$(field render_hash <<<"$OUT_V")" ] \
    && ok "V and B agree at height $H" || bad "V and B disagree at height $H (B: $(field render_hash <<<"$OUT_B"))"
fi
exit $FAIL
