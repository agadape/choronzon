#!/usr/bin/env bash
# Build a static snapshot of the listener page for a static host (Vercel): dist/ holds ONLY an allow-list.
#
#   scripts/build_web.sh [--out out] [--dist dist] [--stamp]   copy the allow-list, write static.json, vercel.json
#                                                               and anchor.json, verify
#   scripts/build_web.sh --check [--dist dist]                  only verify an existing dist/ against the allow-list
#   ... --key-file FILE [--birthday H]                           also publish the choir's viewing key as key.txt
#
# The key (decided 24 Oct, CLAUDE.md section 6): the publisher passes it from the CHOIR_UFVK secret (CI) or a key
# file (laptop), never from a file in the repo. It lands in key.txt only, with its birthday in static.json; verify()
# fails the build if anything shaped like a full viewing key appears in any other file of dist/.
#
# anchor.json is the canonical statement of this render (python3 -m anchor statement: hashes, versions, counts, one
# height; nothing private). --stamp also stamps it with OpenTimestamps -> anchor.json.ots, pending until Bitcoin
# confirms (docs/anchoring.md). A failed stamp (calendars down, client missing) is a warning, never a failed build.
# The statement's repo commit is $GITHUB_SHA in CI, else `git rev-parse HEAD`.
#
# Rendering is not this script's job (python3 -m renderer once ... --out out first); it refuses to run without
# out/score.json. Anything outside the allow-list in dist/ (a .py, .age, .sqlite, wallets, logs, ...) fails the build.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=out; DIST=dist; CHECK=0; STAMP=0; KEY_FILE=""; BIRTHDAY=4502962
while [ $# -gt 0 ]; do
  case "$1" in
    --out) OUT=$2; shift 2;;
    --dist) DIST=$2; shift 2;;
    --check) CHECK=1; shift;;
    --stamp) STAMP=1; shift;;
    --key-file) KEY_FILE=$2; shift 2;;
    --birthday) BIRTHDAY=$2; shift 2;;
    *) echo "usage: $0 [--out DIR] [--dist DIR] [--stamp] [--key-file FILE [--birthday H]] [--check]" >&2; exit 2;;
  esac
done
# a unified full viewing key: uview… / uvf… human-readable part, then bech32m data (never printed by this script)
UFVK_RE='(uview|uvf)[a-z]*1[02-9ac-hj-np-z]{40,}'

# The allow-list: every file dist/ may contain, as a path relative to dist/.
allowed() {
  printf "%s\n" index.html apparition.html static.json vercel.json config/brand.json out/score.json out/mix.wav out/render_hash logo.svg og.png anchor.json anchor.json.ots key.txt
  for f in web/*.js; do [ "$(basename "$f")" = kiosk.js ] || basename "$f"; done
  for f in web/*.css; do [ -e "$f" ] || continue; basename "$f"; done
  # vendored three.js (MIT) and the self-hosted type (OFL): THIRD_PARTY_NOTICES.md lists every file with its sha256
  for f in web/vendor/three/* web/vendor/qrcode/* web/fonts/*; do [ -e "$f" ] || continue; echo "${f#web/}"; done
  true
}

verify() {
  local bad=0
  while IFS= read -r f; do
    rel=${f#"$DIST"/}
    if ! grep -qx "$rel" <(allowed); then echo "!! not in the allow-list: $rel" >&2; bad=1; fi
    case "$rel" in *.py|*.age|*.sqlite|*.toml|wallets/*|logs/*|*/wallets/*|*/logs/*|.env*|*.pem|*.key|kiosk.js)
      echo "!! forbidden file type in dist: $rel" >&2; bad=1;; esac
  done < <(find "$DIST" -type f | sort)
  for f in index.html apparition.html static.json vercel.json config/brand.json out/score.json out/mix.wav anchor.json; do
    [ -f "$DIST/$f" ] || { echo "!! missing from dist: $f" >&2; bad=1; }
  done
  grep -q "kiosk\.html\|kiosk\.js" "$DIST/index.html" "$DIST/apparition.html" && { echo "!! a page links the kiosk" >&2; bad=1; }
  # zero runtime requests outside the origin: no script, stylesheet, import, font or image from another host
  local q="[\"']"
  for f in "$DIST"/*.html "$DIST"/*.css "$DIST"/*.js; do
    [ -e "$f" ] || continue
    if grep -nE "<(script|link)[^>]*(src|href)=${q}https?://|@import[^;]*https?://|url\(${q}?https?://|from ${q}https?://|import\(${q}https?://" "$f" >&2; then
      echo "!! external runtime request in ${f#"$DIST"/}" >&2; bad=1
    fi
  done
  # the viewing key lives in key.txt and nowhere else (names only are printed, never the key)
  while IFS= read -r f; do
    [ "${f#"$DIST"/}" = key.txt ] && continue
    if grep -qaE "$UFVK_RE" "$f"; then echo "!! a viewing key outside key.txt: ${f#"$DIST"/}" >&2; bad=1; fi
  done < <(find "$DIST" -type f | sort)
  if [ -f "$DIST/key.txt" ]; then
    if [ "$(wc -l <"$DIST/key.txt")" != 1 ] || ! grep -qxE "$UFVK_RE" "$DIST/key.txt"; then
      echo "!! key.txt is not exactly one viewing key on one line" >&2; bad=1
    fi
  fi
  return $bad
}

if [ "$CHECK" = 1 ]; then verify && echo "dist/ verified: allow-list only"; exit $?; fi

[ -f "$OUT/score.json" ] || { echo "!! $OUT/score.json missing: run python3 -m renderer once --wallet wallets/test/V --sync --out $OUT first" >&2; exit 1; }
rm -rf "$DIST"; mkdir -p "$DIST/config" "$DIST/out"
cp web/index.html web/apparition.html "$DIST/"
for f in web/*.js; do [ "$(basename "$f")" = kiosk.js ] || cp "$f" "$DIST/"; done
for f in web/*.css; do [ -e "$f" ] && cp "$f" "$DIST/"; done
cp config/brand.json "$DIST/config/brand.json"
mkdir -p "$DIST/vendor/three" "$DIST/vendor/qrcode" "$DIST/fonts"
cp web/vendor/three/* "$DIST/vendor/three/"                   # three.js r160 (MIT): THIRD_PARTY_NOTICES.md
cp web/vendor/qrcode/* "$DIST/vendor/qrcode/"                 # qrcode-generator 1.4.4 (MIT): THIRD_PARTY_NOTICES.md
cp web/fonts/* "$DIST/fonts/"                                 # IM Fell English (SIL OFL 1.1): web/fonts/OFL.txt
cp docs/brand/logo.svg "$DIST/logo.svg"                       # favicon
[ -f web/og.png ] && cp web/og.png "$DIST/og.png"             # link preview image (rendered from the page, committed)
cp "$OUT/score.json" "$OUT/mix.wav" "$DIST/out/"
[ -f "$OUT/render_hash" ] && cp "$OUT/render_hash" "$DIST/out/"
HAS_KEY=0
if [ -n "$KEY_FILE" ]; then
  [ -f "$KEY_FILE" ] || { echo "!! --key-file: no such file" >&2; exit 1; }
  # one line, one key; checked without ever echoing it
  if ! tr -d '\r' <"$KEY_FILE" | sed '/^[[:space:]]*$/d' | grep -qxE "$UFVK_RE" || [ "$(tr -d '\r' <"$KEY_FILE" | sed '/^[[:space:]]*$/d' | wc -l)" != 1 ]; then
    echo "!! --key-file does not hold exactly one unified full viewing key" >&2; exit 1
  fi
  case "$BIRTHDAY" in ''|*[!0-9]*) echo "!! --birthday must be a block height" >&2; exit 1;; esac
  (umask 022; tr -d '\r' <"$KEY_FILE" | sed '/^[[:space:]]*$/d' >"$DIST/key.txt")
  HAS_KEY=1
fi
python3 - "$OUT/score.json" "$DIST/static.json" "$HAS_KEY" "$BIRTHDAY" <<'EOF'
import json, sys, datetime
score = json.load(open(sys.argv[1]))
choir = json.load(open("config/choir.json"))   # public: where offerings go and how much ("give it a secret")
doc = {"static": True, "as_of_height": score["score"]["as_of_height"], "render_hash": score["render_hash"],
       "score_hash": score["score_hash"],
       "rendered_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
       "choir": {"network": choir["network"], "address": choir["address"], "amount_zat": int(choir["amount_zat"])}}
if sys.argv[3] == "1":   # the key itself is only in key.txt; here just where it is and its birthday
    doc["key"] = {"file": "key.txt", "birthday": int(sys.argv[4])}
json.dump(doc, open(sys.argv[2], "w"), indent=1); open(sys.argv[2], "a").write("\n")
EOF
python3 -m anchor statement --out "$OUT" --commit "${GITHUB_SHA:-}" --to "$DIST/anchor.json"
if [ "$STAMP" = 1 ]; then
  python3 -m anchor stamp "$DIST/anchor.json" --soft >&2   # --soft: a failure prints a warning and exits 0
fi
cat > "$DIST/vercel.json" <<'EOF'
{
  "cleanUrls": true,
  "headers": [
    { "source": "/out/(.*)", "headers": [{ "key": "Cache-Control", "value": "no-store" }] },
    { "source": "/static.json", "headers": [{ "key": "Cache-Control", "value": "no-store" }] },
    { "source": "/key.txt", "headers": [{ "key": "Content-Type", "value": "text/plain; charset=utf-8" }] },
    { "source": "/vendor/(.*)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] },
    { "source": "/fonts/(.*)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] },
    { "source": "/anchor.json", "headers": [{ "key": "Cache-Control", "value": "no-store" }] },
    { "source": "/anchor.json.ots", "headers": [{ "key": "Cache-Control", "value": "no-store" },
                                               { "key": "Content-Type", "value": "application/octet-stream" }] }
  ]
}
EOF
verify
echo "built $DIST/ (snapshot at height $(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['as_of_height'])" "$DIST/static.json")):"
find "$DIST" -type f -printf "  %8s  %P\n" | sort -k2
