#!/usr/bin/env bash
# CI helper (.github/workflows/publish-web.yml): build bin/c2enc, bin/c2dec and bin/devtool-aegis exactly as
# scripts/setup.sh steps 3 and 4 do (same pins, same flags, same NU7 patch), without setup.sh's apt, npm, wallet
# and smoke steps (smoke needs wallets/, which CI never has).
#
#   scripts/ci_build_tools.sh          build whatever is missing in bin/
#   scripts/ci_build_tools.sh --key    print key=… (bin/ cache) and devtool=… (wallet cache prefix) for $GITHUB_OUTPUT
#
# The pins are read from scripts/setup.sh, so the two can never drift; a pin that cannot be found stops the build.
set -euo pipefail
cd "$(dirname "$0")/.."

eval "$(grep -E '^CODEC2_(TAG|COMMIT)=[0-9A-Za-z.]+$' scripts/setup.sh)"
DEVTOOL_COMMIT=$(sed -n 's/.*git checkout -q \([0-9a-f]\{7,40\}\).*/\1/p' scripts/setup.sh | head -1)
PATCH=scripts/patches/zcash-devtool-nu7.patch
[ -n "${CODEC2_TAG:-}" ] && [ -n "${CODEC2_COMMIT:-}" ] && [ -n "$DEVTOOL_COMMIT" ] && [ -f "$PATCH" ] \
  || { echo "!! cannot read the codec2 / devtool pins from scripts/setup.sh" >&2; exit 1; }

if [ "${1:-}" = "--key" ]; then
  # shellcheck disable=SC1091
  os=$(. /etc/os-release && echo "$ID-$VERSION_ID")-$(uname -m)
  patch_sha=$(sha256sum "$PATCH" | cut -c1-16)
  echo "key=bin-$os-devtool-$DEVTOOL_COMMIT-nu7-$patch_sha-codec2-${CODEC2_COMMIT:0:12}"
  echo "devtool=$DEVTOOL_COMMIT-nu7-$patch_sha"
  exit 0
fi

mkdir -p vendor bin
echo "== codec2 @$CODEC2_TAG ($CODEC2_COMMIT), static, -ffp-contract=off =="
if [ ! -x bin/c2dec ] || [ ! -x bin/c2enc ]; then
  [ -d vendor/codec2 ] || git -c advice.detachedHead=false clone -q --depth 1 --branch "$CODEC2_TAG" https://github.com/drowe67/codec2 vendor/codec2
  [ "$(git -C vendor/codec2 rev-parse HEAD)" = "$CODEC2_COMMIT" ] || { echo "!! vendor/codec2 is not at $CODEC2_COMMIT" >&2; exit 1; }
  cmake -S vendor/codec2 -B vendor/codec2/build -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF \
        -DUNITTEST=OFF -DCMAKE_C_FLAGS="-ffp-contract=off" >/dev/null
  cmake --build vendor/codec2/build --target c2enc c2dec -j"$(getconf _NPROCESSORS_ONLN)" >/dev/null
  cp vendor/codec2/build/src/c2enc vendor/codec2/build/src/c2dec bin/
else
  echo "(cached)"
fi
echo "== zcash-devtool @$DEVTOOL_COMMIT + NU7 patch =="
if [ ! -x bin/devtool-aegis ]; then
  [ -d vendor/devtool-aegis ] || git clone -q https://github.com/zcash/zcash-devtool vendor/devtool-aegis
  (cd vendor/devtool-aegis && git checkout -q "$DEVTOOL_COMMIT" && \
    if git apply --reverse --check "../../$PATCH" 2>/dev/null; then echo "(patch already applied)"; \
    else git apply "../../$PATCH" || { echo "!! the NU7 patch did not apply: a stock devtool cannot broadcast on NU7 testnet" >&2; exit 1; }; fi)
  (cd vendor/devtool-aegis && cargo build --release)
  cp vendor/devtool-aegis/target/release/zcash-devtool bin/devtool-aegis
else
  echo "(cached)"
fi
ls -l bin/
