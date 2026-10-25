"""What the page loads besides our own code is vendored (web/vendor, web/fonts), licensed, and pinned by sha256 in
THIRD_PARTY_NOTICES.md; no page, stylesheet or script fetches anything from another origin at runtime."""
import hashlib
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "web"
NOTICES = (ROOT / "THIRD_PARTY_NOTICES.md").read_text(encoding="utf-8")
VENDORED = ["vendor/three/three.module.min.js", "vendor/three/BufferGeometryUtils.js", "vendor/qrcode/qrcode.js",
            "fonts/IMFellEnglish-Regular.ttf", "fonts/IMFellEnglish-Italic.ttf", "fonts/IMFellEnglishSC-Regular.ttf"]
EXTERNAL = re.compile(r"""<(script|link)[^>]*(src|href)=["']https?://|@import[^;]*https?://|url\(["']?https?://"""
                      r"""|from ["']https?://|import\(["']https?://""")


def sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def test_every_vendored_file_is_pinned_in_the_notices():
    for rel in VENDORED:
        p = WEB / rel
        assert p.is_file(), rel
        assert sha256(p) in NOTICES, f"{rel}: sha256 {sha256(p)} not recorded in THIRD_PARTY_NOTICES.md"


def test_licences_travel_with_the_files():
    assert "MIT" in (WEB / "vendor/three/LICENSE").read_text(encoding="utf-8")
    assert "SIL Open Font License" in (WEB / "fonts/OFL.txt").read_text(encoding="utf-8")
    assert "three.js" in NOTICES and "0.160.0" in NOTICES and "IM Fell English" in NOTICES


def test_three_is_the_pinned_release():
    head = (WEB / "vendor/three/three.module.min.js").read_text(encoding="utf-8")[:4000]
    assert 'const t="160"' in head and "SPDX-License-Identifier: MIT" in head   # REVISION = "160": r160


def test_no_runtime_request_leaves_the_origin():
    for p in list(WEB.glob("*.html")) + list(WEB.glob("*.css")) + list(WEB.glob("*.js")):
        for n, line in enumerate(p.read_text(encoding="utf-8").splitlines(), 1):
            assert not EXTERNAL.search(line), f"{p.name}:{n}: {line.strip()}"
