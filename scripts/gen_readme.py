#!/usr/bin/env python3
"""Render README.md from docs/README.template.md and config/brand.json, and set the npm package name from its slug.

The human-facing name, tagline, one-liner and kiosk line live only in config/brand.json.
The template refers to them as {{name}}, {{tagline}}, {{one_liner}}, {{kiosk_cta}}, {{slug}}.
Renaming the project = edit config/brand.json, then run this script.

  python3 scripts/gen_readme.py          # write README.md, package.json, package-lock.json
  python3 scripts/gen_readme.py --check  # exit 1 if any of them is stale or the template hardcodes the name
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BRAND = ROOT / "config" / "brand.json"
TEMPLATE = ROOT / "docs" / "README.template.md"
OUT = ROOT / "README.md"
# other templates rendered the same way: docs/brand/<x>.template.svg -> docs/brand/<x>.svg
BRAND_TEMPLATES = sorted((ROOT / "docs" / "brand").glob("*.template.svg"))
PACKAGE_FILES = (ROOT / "package.json", ROOT / "package-lock.json")
PLACEHOLDER = re.compile(r"\{\{(\w+)\}\}")


def render(brand: dict, template: str) -> str:
    def sub(m):
        key = m.group(1)
        if key not in brand:
            raise KeyError(f"unknown placeholder {{{{{key}}}}} in {TEMPLATE.name}")
        return brand[key]
    return PLACEHOLDER.sub(sub, template)


def package_json(path: Path, slug: str) -> str:
    """Same file with the package name set to the slug (npm's 2-space JSON layout is kept byte-for-byte)."""
    doc = json.loads(path.read_text(encoding="utf-8"))
    doc["name"] = slug
    if "" in doc.get("packages", {}):  # package-lock v3 repeats the root package's name
        doc["packages"][""]["name"] = slug
    return json.dumps(doc, indent=2, ensure_ascii=False) + "\n"


def main() -> None:
    brand = json.loads(BRAND.read_text(encoding="utf-8"))
    outputs = {}
    for tpl, out in [(TEMPLATE, OUT)] + [(t, t.with_name(t.name.replace(".template", ""))) for t in BRAND_TEMPLATES]:
        template = tpl.read_text(encoding="utf-8")
        if brand["name"].lower() in template.lower():
            sys.exit(f"{tpl.relative_to(ROOT)} hardcodes the name; use {{{{name}}}} instead")
        outputs[out] = render(brand, template)
    outputs.update({p: package_json(p, brand["slug"]) for p in PACKAGE_FILES if p.exists()})
    if "--check" in sys.argv[1:]:
        stale = [p.name for p, text in outputs.items() if not p.exists() or p.read_text(encoding="utf-8") != text]
        if stale:
            sys.exit(f"stale: {', '.join(stale)}: run python3 scripts/gen_readme.py")
        print("README.md, brand SVGs and package name are up to date")
        return
    for path, text in outputs.items():
        path.write_text(text, encoding="utf-8", newline="\n")
        print(f"wrote {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
