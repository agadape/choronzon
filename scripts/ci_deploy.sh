#!/usr/bin/env bash
# CI helper (.github/workflows/publish-web.yml): deploy dist/ to Vercel production, then wait until the production
# domain serves the new render_hash.
#
#   VERCEL_TOKEN=… VERCEL_ORG_ID=… VERCEL_PROJECT_ID=… scripts/ci_deploy.sh --dist dist --expect <render_hash>
#
# The CLI is pinned (vercel@62.7.0, the version that made the first manual deploy). Its progress output goes to a
# log that is shown only on failure; stdout carries only the deployment URL. Appends url=… to $GITHUB_OUTPUT.
# Never `set -x` in this job: the token is on the CLI's command line.
set -euo pipefail
cd "$(dirname "$0")/.."
VERCEL_CLI=vercel@62.7.0
DIST=dist; EXPECT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dist) DIST=$2; shift 2;;
    --expect) EXPECT=$2; shift 2;;
    *) echo "usage: $0 --dist DIR --expect RENDER_HASH" >&2; exit 2;;
  esac
done
[ -n "$EXPECT" ] || { echo "usage: $0 --dist DIR --expect RENDER_HASH" >&2; exit 2; }
for v in VERCEL_TOKEN VERCEL_ORG_ID VERCEL_PROJECT_ID; do
  [ -n "${!v:-}" ] || { echo "::error::$v is not set (secret VERCEL_TOKEN, variables VERCEL_ORG_ID / VERCEL_PROJECT_ID; see docs/auto-publish.md)"; exit 1; }
done
[ "$(tr -d '[:space:]' <"$DIST/out/render_hash")" = "$EXPECT" ] || { echo "::error::$DIST/out/render_hash is not $EXPECT"; exit 1; }
SLUG=$(python3 -c "import json; print(json.load(open('config/brand.json'))['slug'])")
TMP=${RUNNER_TEMP:-$(mktemp -d)}
export VERCEL_TELEMETRY_DISABLED=1

if ! URL=$(npx --yes "$VERCEL_CLI" deploy "$DIST" --prod --yes --token "$VERCEL_TOKEN" 2>"$TMP/vercel.log"); then
  echo "::error::vercel deploy failed"; tail -n 20 "$TMP/vercel.log"; exit 1
fi
URL=$(printf '%s\n' "$URL" | grep -Eo 'https://[^ ]+' | tail -1)
[ -n "$URL" ] || { echo "::error::vercel deploy printed no URL"; tail -n 20 "$TMP/vercel.log"; exit 1; }
echo "url=$URL" >>"${GITHUB_OUTPUT:-/dev/null}"
echo "deployment: $URL"

# the production alias moves when the deployment is ready; /out/* is served with Cache-Control: no-store
for i in $(seq 1 12); do
  live=$(curl -fsS --max-time 20 "https://$SLUG.vercel.app/out/render_hash?run=${GITHUB_RUN_ID:-local}-$i" 2>/dev/null \
         | tr -d '[:space:]' || true)
  if [ "$live" = "$EXPECT" ]; then echo "live: https://$SLUG.vercel.app serves render_hash $EXPECT"; exit 0; fi
  sleep 10
done
echo "::error::https://$SLUG.vercel.app still serves render_hash '${live:-?}' two minutes after the deploy"
exit 1
