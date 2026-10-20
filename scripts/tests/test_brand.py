"""The human-facing name lives only in config/brand.json; README and the npm package name are generated from it.

Historical evidence (docs/, spikes/, logs/, ai/, radio/, topeng-spike/, SPIKE_LOG.md) keeps the old working title
on purpose; product files must not carry the name or the old title anywhere else.
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BRAND = json.loads((ROOT / "config" / "brand.json").read_text(encoding="utf-8"))
GENERATED = {"config/brand.json", "README.md", "package.json", "package-lock.json"}
HISTORICAL = ("docs/", "spikes/", "logs/", "ai/", "radio/", "topeng-spike/", "SPIKE_LOG.md")
PRODUCT_DOCS = {"docs/README.template.md", "docs/lore.md"}  # inside docs/ but product copy
HANDOFF = {"CLAUDE.md", "TODO.md"}                           # explain the rename, so they cite the old title
# ("a god made of secrets" is part of the approved one-liner, so only the old name itself is banned)
OLD_TITLE = (b"ghost choir", b"ghostchoir", b"ghost_choir", b"ghost-choir")
THIS_FILE = "scripts/tests/test_brand.py"


def repo_files() -> list[str]:
    out = subprocess.run(["git", "ls-files", "--cached", "--others", "--exclude-standard"], cwd=ROOT,
                         capture_output=True, text=True, check=True).stdout
    return [f for f in out.splitlines() if (ROOT / f).is_file()]


def product_files() -> list[str]:
    return [f for f in repo_files() if f in PRODUCT_DOCS or not f.startswith(HISTORICAL)]


def test_generated_files_are_up_to_date():
    done = subprocess.run([sys.executable, "scripts/gen_readme.py", "--check"], cwd=ROOT, capture_output=True,
                          text=True)
    assert done.returncode == 0, done.stderr


def test_name_appears_only_in_brand_json_and_generated_files():
    name = BRAND["name"].lower().encode()
    hits = [f for f in product_files() if f not in GENERATED and name in (ROOT / f).read_bytes().lower()]
    assert hits == []


def test_old_working_title_is_gone_from_product_files():
    hits = [f for f in product_files() if f not in HANDOFF and f != THIS_FILE
            and any(t in (ROOT / f).read_bytes().lower() for t in OLD_TITLE)]
    assert hits == []


def test_package_name_is_the_slug():
    assert json.loads((ROOT / "package.json").read_text())["name"] == BRAND["slug"]
