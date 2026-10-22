#!/usr/bin/env bash
# Publish a static snapshot of the listener page to Vercel (production), from WSL through the Windows Vercel CLI.
#
#   scripts/publish_web.sh            render from the public-key wallet -> build dist/ -> deploy --prod
#   scripts/publish_web.sh --no-render  skip the render (use the existing out/)
#
# The Vercel CLI is installed and logged in on Windows; it is run through interop (cmd.exe) with the snapshot
# copied to %LOCALAPPDATA%\<slug>-web, whose .vercel/ keeps the project link between runs. The project is named
# after `slug` in config/brand.json. Nothing but dist/ (allow-list, see build_web.sh) ever leaves this machine.
set -euo pipefail
cd "$(dirname "$0")/.."
RENDER=1
[ "${1:-}" = "--no-render" ] && RENDER=0
SLUG=$(python3 -c "import json; print(json.load(open('config/brand.json'))['slug'])")

if [ "$RENDER" = 1 ]; then
  echo "== render from the public-key wallet =="
  python3 -m renderer once --wallet wallets/test/V --sync --out out >/dev/null
fi
echo "== build the static snapshot =="
scripts/build_web.sh --out out --dist dist

echo "== copy dist/ to Windows =="
WIN_LOCAL=$(cd /mnt/c && cmd.exe /c 'echo %LOCALAPPDATA%' | tr -d '\r')
WIN_DIR="$WIN_LOCAL\\$SLUG-web"
WSL_DIR=$(wslpath -u "$WIN_DIR")
mkdir -p "$WSL_DIR"
rsync -r --delete --exclude .vercel dist/ "$WSL_DIR/"

echo "== deploy to Vercel (production) =="
if [ ! -d "$WSL_DIR/.vercel" ]; then
  (cd /mnt/c && cmd.exe /c "vercel link --yes --project $SLUG --cwd \"$WIN_DIR\"")
fi
(cd /mnt/c && cmd.exe /c "vercel deploy --prod --yes --cwd \"$WIN_DIR\"")
echo "published snapshot at height $(python3 -c "import json; print(json.load(open('dist/static.json'))['as_of_height'])")"
