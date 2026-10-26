"""Which god this process serves: the directory holding its choir.json, brand.json and skiplist.txt.

Default: config/ of this repo (the main god). Set GOD_CONFIG_DIR to another directory, e.g. the one
scripts/new_god.sh writes under wallets/gods/<slug>/config/, and the kiosk (choir address, screen copy), the
web server (brand) and scripts/build_web.sh (brand, choir, skiplist) all read that god's files instead.
A relative path is taken from the repo root, so it means the same thing to the Python tools and to build_web.sh.
"""
from __future__ import annotations

import os
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
ENV = "GOD_CONFIG_DIR"
DEFAULT = REPO / "config"


def config_dir(environ=None) -> Path:
    value = (os.environ if environ is None else environ).get(ENV, "").strip()
    if not value:
        return DEFAULT
    p = Path(value).expanduser()
    return p if p.is_absolute() else REPO / p


def config_file(name: str, environ=None) -> Path:
    return config_dir(environ) / name
