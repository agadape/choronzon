#!/usr/bin/env bash
# S2 — Build zcash-devtool twice: plain (Ironwood/NU6.3 = what MAINNET runs now)
# and with the unstable NU7 cfg (what TESTNET runs since block 4,465,026).
# Hypothesis to test: plain build can no longer send on testnet after NU7;
# the nu7-cfg build can. Aegis Gate needed a librustzcash pin + patch for this.
# Output: bin/devtool-main  bin/devtool-nu7   (log to logs/s2_build.log)
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p bin logs vendor
exec > >(tee logs/s2_build.log) 2>&1

[ -d vendor/zcash-devtool ] || git clone https://github.com/zcash/zcash-devtool.git vendor/zcash-devtool
cd vendor/zcash-devtool
git fetch -q && git checkout -q main && git pull -q
echo "devtool commit: $(git log -1 --format='%h %cd')"
rustc --version; cargo --version

echo "== build A: plain (mainnet / Ironwood) =="
time cargo build --release && cp target/release/zcash-devtool ../../bin/devtool-main && echo "BUILD_A_OK"

echo "== build B: RUSTFLAGS cfg zcash_unstable=nu7 (testnet post-NU7) =="
time RUSTFLAGS='--cfg zcash_unstable="nu7"' CARGO_TARGET_DIR=target-nu7 cargo build --release \
  && cp target-nu7/release/zcash-devtool ../../bin/devtool-nu7 && echo "BUILD_B_OK" \
  || echo "BUILD_B_FAILED -> log the first error; fallback = Aegis Gate patch (patches/zcash-devtool-nu7.patch, librustzcash 9c5705f)"
