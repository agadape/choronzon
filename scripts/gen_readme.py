#!/usr/bin/env python3
"""Render README.md from docs/README.template.md and config/brand.json.

The human-facing name, tagline, one-liner and kiosk line live only in config/brand.json.
The template refers to them as {{name}}, {{tagline}}, {{one_liner}}, {{kiosk_cta}}, {{slug}}.
Renaming the project = edit config/brand.json, then run this script.

  python3 scripts/gen_readme.py          # write README.md
  python3 scripts/gen_readme.py --check  # exit 1 if README.md is stale or the template hardcodes the name
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BRAND = ROOT / "config" / "brand.json"
TEMPLATE = ROOT / "docs" / "README.template.md"
OUT = ROOT / "README.md"
PLACEHOLDER = re.compile(r"\{\{(\w+)\}\}")


def render(brand: dict, template: str) -> str:
    def sub(m):
        key = m.group(1)
        if key not in brand:
            raise KeyError(f"unknown placeholder {{{{{key}}}}} in {TEMPLATE.name}")
        return brand[key]
    return PLACEHOLDER.sub(sub, template)


def main() -> None:
    brand = json.loads(BRAND.read_text(encoding="utf-8"))
    template = TEMPLATE.read_text(encoding="utf-8")
    if brand["name"].lower() in template.lower():
        sys.exit(f"{TEMPLATE.relative_to(ROOT)} hardcodes the name; use {{{{name}}}} instead")
    readme = render(brand, template)
    if "--check" in sys.argv[1:]:
        current = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
        if current != readme:
            sys.exit("README.md is stale: run python3 scripts/gen_readme.py")
        print("README.md is up to date")
        return
    OUT.write_text(readme, encoding="utf-8", newline="\n")
    print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
