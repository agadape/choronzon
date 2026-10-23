#!/usr/bin/env bash
# CI helper (publish-web.yml, anchor-upgrade.yml): install the OpenTimestamps client into its own venv.
#
#   scripts/ci_anchor.sh --venv DIR
#
# Wheels only, every hash pinned (anchor/requirements.txt): pip installs exactly those bytes and runs no package code
# at install time; nothing lands in the system site-packages or on PATH. Appends ots=DIR/bin/ots and
# python=DIR/bin/python to $GITHUB_OUTPUT (stdout outside CI). Callers treat a failure as a warning: a missing client
# means "no proof this time", never a failed deploy (docs/anchoring.md). Never `set -x` in these jobs.
set -euo pipefail
cd "$(dirname "$0")/.."
VENV=""
while [ $# -gt 0 ]; do
  case "$1" in
    --venv) VENV=$2; shift 2;;
    *) echo "usage: $0 --venv DIR" >&2; exit 2;;
  esac
done
[ -n "$VENV" ] || { echo "usage: $0 --venv DIR" >&2; exit 2; }
if ! { python3 -m venv "$VENV" \
       && "$VENV/bin/pip" install --quiet --disable-pip-version-check --no-cache-dir \
            --require-hashes --only-binary :all: -r anchor/requirements.txt; }; then
  echo "::warning::could not install the OpenTimestamps client; this deploy ships anchor.json without a proof"
  exit 1
fi
echo "OpenTimestamps client: $("$VENV/bin/ots" --version 2>&1)"
result=$(printf 'ots=%s\npython=%s\n' "$VENV/bin/ots" "$VENV/bin/python")
if [ -n "${GITHUB_OUTPUT:-}" ]; then echo "$result" >>"$GITHUB_OUTPUT"; else echo "$result"; fi
