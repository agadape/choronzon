#!/usr/bin/env bash
# Quick health check of the environment and of the proven pipeline. Safe: read-only on chain.
set -uo pipefail
cd "$(dirname "$0")/.."
ok(){ echo "  ✅ $*"; }; bad(){ echo "  ❌ $*"; }
echo "[protocol unit tests]"; python3 spikes/wb_protocol.py >/dev/null && ok "wb_protocol self-tests" || bad "wb_protocol self-tests"
echo "[codec2 / tts]"; command -v c2enc >/dev/null && command -v c2dec >/dev/null && ok "codec2" || bad "codec2 (apt install codec2)"; command -v espeak-ng >/dev/null && ok "espeak-ng" || bad "espeak-ng"
echo "[devtool]"; [ -x bin/devtool-aegis ] && ok "bin/devtool-aegis present" || { bad "bin/devtool-aegis missing (run scripts/setup.sh)"; exit 1; }
echo "[lightwalletd testnet]"; timeout 60 node spikes/s1_lightd.mjs test 2>/dev/null | grep -q '"chainName": "test"' && ok "testnet.zec.rocks reachable" || bad "lightwalletd unreachable"
if [ -d wallets/test/V ]; then
  echo "[public-key reader sync + deterministic render]"
  bin/devtool-aegis wallet -w wallets/test/V sync -s zecrocks >/dev/null 2>&1 && bin/devtool-aegis wallet -w wallets/test/V enhance -s zecrocks >/dev/null 2>&1 && ok "V synced" || bad "V sync failed"
  H=$(bin/devtool-aegis wallet -w wallets/test/V balance 2>&1 | grep -oE "Height: [0-9]+" | grep -oE "[0-9]+")
  python3 spikes/g6_render.py wallets/test/V "$H" | grep -E "accepted|render_hash" | sed 's/^/  /'
  echo "  (expected at height 4522002: 7 accepted, hash c46dd5de8b74fecdb38e2b875c98c2f63d097f45f9bc1f667866a35594efe6b4)"
else
  echo "[wallets] not present — skipping chain render"
fi
