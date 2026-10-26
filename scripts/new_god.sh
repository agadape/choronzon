#!/usr/bin/env bash
# Stand up a new god for your own community (testnet):
#
#   scripts/new_god.sh --slug retro-demo --name "The Retro God" [--tagline "..."] [--repo-url https://…]
#                      [--connection tor|direct]
#
# Creates wallets/gods/<slug>/ (git-ignored): the god's wallet + age identity, its full viewing key in key.txt
# (mode 600, never printed), a view-only watcher made from that key, and config/ (choir.json, brand.json,
# skiplist.txt) for GOD_CONFIG_DIR. Idempotent; refuses to overwrite. Does not touch config/ (the main god).
# Logic and the full description: scripts/new_god.py. Walkthrough: docs/your-own-god.md.
set -euo pipefail
cd "$(dirname "$0")/.."
exec python3 scripts/new_god.py "$@"
