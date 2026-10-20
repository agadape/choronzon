#!/usr/bin/env bash
# One-shot environment setup for Ghost Choir (Linux / WSL / macOS with Homebrew).
# Builds the NU7-patched zcash-devtool into bin/devtool-aegis. Idempotent. ~10–15 min on first run.
set -euo pipefail
cd "$(dirname "$0")/.."
echo "== 1/5 system deps =="
if command -v apt-get >/dev/null; then
  sudo apt-get update -q && sudo apt-get install -y -q build-essential pkg-config libssl-dev protobuf-compiler git curl unzip codec2 espeak-ng sox libsox-fmt-all python3 python3-pip
elif command -v brew >/dev/null; then
  brew install codec2 espeak-ng sox protobuf python3 node
fi
echo "== 2/5 rust + node =="
command -v cargo >/dev/null || { curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y; source "$HOME/.cargo/env"; }
command -v node >/dev/null || { echo "install Node 22 (nvm) then re-run"; exit 1; }
npm install --silent
pip install --break-system-packages -q "qrcode[pil]" 2>/dev/null || pip3 install -q "qrcode[pil]"
echo "== 3/5 zcash-devtool @5a26ee8 + NU7 patch =="
if [ ! -x bin/devtool-aegis ]; then
  mkdir -p vendor bin
  [ -d vendor/devtool-aegis ] || git clone -q https://github.com/zcash/zcash-devtool vendor/devtool-aegis
  (cd vendor/devtool-aegis && git checkout -q 5a26ee8 && git apply --check ../../scripts/patches/zcash-devtool-nu7.patch 2>/dev/null && git apply ../../scripts/patches/zcash-devtool-nu7.patch || echo "(patch already applied)")
  (cd vendor/devtool-aegis && cargo build --release)
  cp vendor/devtool-aegis/target/release/zcash-devtool bin/devtool-aegis
fi
echo "== 4/5 wallets =="
if [ ! -d wallets/test/B ]; then
  echo "!! wallets/ missing. Unzip zecathon-wallets-TESTNET.zip into this directory (gives A, B=choir, V=view-only, L)."
  echo "   Or create fresh ones: ./spikes/s3_wallets.sh init  (then fund A at https://faucet.testnet.valargroup.dev with its utest1… address)"
fi
echo "== 5/5 smoke =="
./scripts/smoke.sh || true
echo "setup done. Tool: bin/devtool-aegis   Choir wallet: wallets/test/B   Public reader: wallets/test/V"
