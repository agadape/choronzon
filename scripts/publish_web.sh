#!/usr/bin/env bash
# Publish a static snapshot of the listener page to Vercel (production), from WSL through the Windows Vercel CLI.
#
#   scripts/publish_web.sh              render from the public-key wallet -> build dist/ -> deploy --prod
#   scripts/publish_web.sh --no-render  skip the render (use the existing out/)
#   scripts/publish_web.sh --dry-run    everything up to the deploy; prints the height and render_hash it would publish
#   scripts/publish_web.sh --force      deploy even if the live snapshot is at a higher height
#   scripts/publish_web.sh --key-file K publish the viewing key as key.txt (K from `kiosk reveal --to K`); without it
#                                       the snapshot carries no key
#
# Same height rule as the GitHub Actions job (docs/auto-publish.md): the render is at the height of the newest
# transaction the wallet can see (`renderer once --as-of last`), not at the chain tip, so its hashes change only when
# something new is mined. A snapshot is never replaced by one at a lower height than the live static.json.
#
# The Vercel CLI is installed and logged in on Windows; it is run through interop (cmd.exe) with the snapshot
# copied to %LOCALAPPDATA%\<slug>-web, whose .vercel/ keeps the project link between runs. The project is named
# after `slug` in config/brand.json. Nothing but dist/ (allow-list, see build_web.sh) ever leaves this machine.
set -euo pipefail
cd "$(dirname "$0")/.."
RENDER=1; DRY=0; FORCE=0; KEY_ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --no-render) RENDER=0; shift;;
    --dry-run) DRY=1; shift;;
    --force) FORCE=1; shift;;
    --key-file) KEY_ARGS=(--key-file "$2" --birthday 4502962); shift 2;;
    *) echo "usage: $0 [--no-render] [--dry-run] [--force] [--key-file FILE]" >&2; exit 2;;
  esac
done
SLUG=$(python3 -c "import json; print(json.load(open('config/brand.json'))['slug'])")

if [ "$RENDER" = 1 ]; then
  echo "== render from the public-key wallet (at the newest transaction) =="
  python3 -m renderer once --wallet wallets/test/V --sync --as-of last --out out >/dev/null
fi
echo "== build the static snapshot =="
scripts/build_web.sh --out out --dist dist --stamp "${KEY_ARGS[@]}"   # --stamp: a failed stamp is only a warning

read -r HEIGHT HASH < <(python3 -c "import json; d=json.load(open('dist/static.json')); print(d['as_of_height'], d['render_hash'])")
LIVE_HEIGHT=$(curl -fsS --retry 2 --max-time 20 "https://$SLUG.vercel.app/static.json?t=$(date +%s)" 2>/dev/null \
              | python3 -c "import json, sys; print(int(json.load(sys.stdin)['as_of_height']))" 2>/dev/null || echo 0)
echo "snapshot: height $HEIGHT, render_hash $HASH (live site: height $LIVE_HEIGHT)"
if [ "$HEIGHT" -lt "$LIVE_HEIGHT" ] && [ "$FORCE" = 0 ]; then
  echo "refusing: the live snapshot is at height $LIVE_HEIGHT, above $HEIGHT (a snapshot is never replaced by a lower one; --force overrides)" >&2
  exit 1
fi
if [ "$DRY" = 1 ]; then
  echo "dry run: would publish height $HEIGHT, render_hash $HASH; stopping before the deploy"
  exit 0
fi

echo "== copy dist/ to Windows =="
WIN_LOCAL=$(cd /mnt/c && cmd.exe /c 'echo %LOCALAPPDATA%' | tr -d '\r')
WIN_DIR="$WIN_LOCAL\\$SLUG-web"
WSL_DIR=$(wslpath -u "$WIN_DIR")
mkdir -p "$WSL_DIR"
rsync -r --delete --exclude .vercel dist/ "$WSL_DIR/"

echo "== deploy to Vercel (production) =="
# cmd.exe started from a /mnt/c path runs in that Windows directory; passing --cwd "<path>" through cmd.exe keeps
# the quotes in the argument and the CLI fails with ENOENT (first publish, 22 Oct)
if [ ! -d "$WSL_DIR/.vercel" ]; then
  (cd "$WSL_DIR" && cmd.exe /c "vercel link --yes --project $SLUG")
fi
(cd "$WSL_DIR" && cmd.exe /c "vercel deploy --prod --yes")
echo "published snapshot at height $HEIGHT, render_hash $HASH"

# keep the statement + proof on the append-only anchors branch, as the CI job does (docs/anchoring.md);
# never fails the publish: the site is already live at this point
if [ -f dist/anchor.json.ots ]; then
  python3 -m anchor persist dist/anchor.json || echo "warning: could not persist the anchor (retry: python3 -m anchor persist dist/anchor.json)" >&2
else
  echo "warning: no anchor.json.ots (stamp failed); this snapshot is not anchored" >&2
fi
