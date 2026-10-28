#!/usr/bin/env bash
# One-shot environment setup for this repo (Linux / WSL / macOS with Homebrew).
# Builds the NU7-patched zcash-devtool into bin/devtool-aegis and a pinned Codec2 into bin/c2{enc,dec}.
# Idempotent. ~10–15 min on first run.
set -euo pipefail
cd "$(dirname "$0")/.."

# Codec2 decoder is part of the render hash, so it is pinned and built from source (never "whatever apt has").
# 1.2.0 = the Ubuntu 24.04 package version the G6 hash was produced with. Static, no -march, no FMA contraction,
# so the same tag gives the same PCM on every x86_64/arm64 machine.
CODEC2_TAG=1.2.0
CODEC2_COMMIT=06d4c11e699b0351765f10398abb4f663a984f36

echo "== 1/6 system deps =="
if command -v apt-get >/dev/null; then
  APT_PKGS="build-essential pkg-config libssl-dev protobuf-compiler git curl unzip cmake codec2 espeak-ng sox libsox-fmt-all python3 python3-pip python3-pytest python3-venv sqlite3 nodejs npm"
  # only escalate when something is actually missing (lets a non-sudo user re-run setup after an admin installed deps)
  MISSING=$(for p in $APT_PKGS; do dpkg-query -W -f='${Status}' "$p" 2>/dev/null | grep -q "install ok installed" || echo "$p"; done | xargs)
  if [ -n "$MISSING" ]; then
    echo "installing: $MISSING"
    sudo apt-get update -q && sudo apt-get install -y -q $MISSING
  else
    echo "all apt packages present"
  fi
elif command -v brew >/dev/null; then
  brew install cmake codec2 espeak-ng sox protobuf python3 node sqlite
fi
echo "== 2/6 rust + node =="
command -v cargo >/dev/null || { curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y; source "$HOME/.cargo/env"; }
command -v node >/dev/null || { echo "install Node 22 (nvm) then re-run"; exit 1; }
npm install --silent
pip install --break-system-packages -q "qrcode[pil]" 2>/dev/null || pip3 install -q "qrcode[pil]"
echo "== 3/6 codec2 @$CODEC2_TAG (pinned, built from source) =="
if [ ! -x bin/c2dec ] || [ ! -x bin/c2enc ]; then
  mkdir -p vendor bin
  [ -d vendor/codec2 ] || git -c advice.detachedHead=false clone -q --depth 1 --branch "$CODEC2_TAG" https://github.com/drowe67/codec2 vendor/codec2
  [ "$(git -C vendor/codec2 rev-parse HEAD)" = "$CODEC2_COMMIT" ] || { echo "!! vendor/codec2 is not at $CODEC2_COMMIT"; exit 1; }
  cmake -S vendor/codec2 -B vendor/codec2/build -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF \
        -DUNITTEST=OFF -DCMAKE_C_FLAGS="-ffp-contract=off" >/dev/null
  cmake --build vendor/codec2/build --target c2enc c2dec -j"$(getconf _NPROCESSORS_ONLN)" >/dev/null
  cp vendor/codec2/build/src/c2enc vendor/codec2/build/src/c2dec bin/
fi
echo "== 4/6 zcash-devtool @5a26ee8 + NU7 patch =="
if [ ! -x bin/devtool-aegis ]; then
  mkdir -p vendor bin
  [ -d vendor/devtool-aegis ] || git clone -q https://github.com/zcash/zcash-devtool vendor/devtool-aegis
  (cd vendor/devtool-aegis && git checkout -q 5a26ee8 && \
    if git apply --reverse --check ../../scripts/patches/zcash-devtool-nu7.patch 2>/dev/null; then echo "(patch already applied)"; \
    else git apply ../../scripts/patches/zcash-devtool-nu7.patch || { echo "!! the NU7 patch did not apply: a stock devtool cannot broadcast on NU7 testnet"; exit 1; }; fi) || exit 1
  (cd vendor/devtool-aegis && cargo build --release)
  cp vendor/devtool-aegis/target/release/zcash-devtool bin/devtool-aegis
fi
echo "== 5/6 wallets =="
if [ ! -d wallets/test/B ]; then
  echo "!! wallets/ missing. Unzip zecathon-wallets-TESTNET.zip into this directory (gives A, B=choir, V=view-only, L)."
  echo "   Or create fresh ones: ./research/spikes/s3_wallets.sh init  (then fund A at https://faucet.testnet.valargroup.dev with its utest1… address)"
fi
echo "== 6/6 smoke =="
./scripts/smoke.sh || true
echo "setup done. Tools: bin/devtool-aegis, bin/c2enc, bin/c2dec   Choir wallet: wallets/test/B   Public reader: wallets/test/V"
