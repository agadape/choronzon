"""build_web.sh copies only its allow-list into dist/ and refuses anything else (nothing private can be deployed)."""
import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "build_web.sh"
ALLOWED = {"index.html", "apparition.html", "static.json", "vercel.json", "config/brand.json", "out/score.json",
           "out/mix.wav", "out/render_hash", "app.js", "apparition.js", "creature.js", "dpr.js", "god.js", "leaf.js", "name.js", "offering.js", "give.js", "verify.js", "boot.js",
           "vendor/qrcode/qrcode.js", "vendor/qrcode/LICENSE", "key.txt",
           "style.css",
           "logo.svg", "og.png", "anchor.json", "anchor.json.ots",
           "vendor/three/three.module.min.js", "vendor/three/BufferGeometryUtils.js", "vendor/three/LICENSE",
           "fonts/IMFellEnglish-Regular.ttf", "fonts/IMFellEnglish-Italic.ttf", "fonts/IMFellEnglishSC-Regular.ttf",
           "fonts/OFL.txt"}


def run(*args, check=True):
    return subprocess.run(["bash", str(SCRIPT), *args], cwd=ROOT, capture_output=True, text=True, check=check)


@pytest.fixture
def out(tmp_path):
    o = tmp_path / "out"
    o.mkdir()
    (o / "score.json").write_text(json.dumps({"score": {"as_of_height": 4522002, "offerings": [], "skipped": []},
                                              "render": {"timeline": [], "composer": "choir/2",
                                                         "decoder": {"fingerprint": "c" * 64},
                                                         "voice": {"fingerprint": "d" * 64}},
                                              "regression": {"g6_hash": "e" * 64},
                                              "render_hash": "a" * 64, "render_hash_version": "render/1",
                                              "score_hash": "b" * 64, "score_hash_version": "score/1"}))
    (o / "mix.wav").write_bytes(b"RIFF\0\0\0\0WAVE")
    (o / "render_hash").write_text("a" * 64 + "\n")
    (o / "cache").mkdir()
    (o / "cache" / "secretvoice.c2").write_bytes(b"\x01")   # must never be copied
    return o


def test_dist_holds_exactly_the_allow_list(out, tmp_path):
    dist = tmp_path / "dist"
    run("--out", str(out), "--dist", str(dist))
    files = {str(p.relative_to(dist)).replace("\\", "/") for p in dist.rglob("*") if p.is_file()}
    assert files <= ALLOWED | {f for f in files if f.endswith(".css")}
    assert {"index.html", "apparition.html", "static.json", "vercel.json", "config/brand.json", "out/score.json",
            "out/mix.wav", "app.js", "creature.js", "god.js", "name.js", "style.css", "logo.svg", "anchor.json",
            "vendor/three/three.module.min.js", "vendor/three/LICENSE", "fonts/IMFellEnglish-Regular.ttf",
            "fonts/OFL.txt"} <= files
    assert "kiosk.js" not in files and "out/cache/secretvoice.c2" not in files
    static = json.loads((dist / "static.json").read_text())
    assert static["static"] is True and static["as_of_height"] == 4522002 and static["render_hash"] == "a" * 64
    vercel = json.loads((dist / "vercel.json").read_text())
    assert vercel["cleanUrls"] is True
    cache = {r["source"]: h["value"] for r in vercel["headers"] for h in r["headers"] if h["key"] == "Cache-Control"}
    assert cache["/out/score.json"] == "no-store" and cache["/static.json"] == "no-store"
    assert "immutable" in cache["/out/mix.wav"]   # fetched as mix.wav?r=<render hash>, so it may be kept


def test_refuses_without_a_render(tmp_path):
    r = run("--out", str(tmp_path / "nothing"), "--dist", str(tmp_path / "dist"), check=False)
    assert r.returncode == 1 and "score.json missing" in r.stderr


@pytest.mark.parametrize("planted", ["wallets/test/A.age", "kiosk.js", "secret.py", "data.sqlite", "logs/x.txt"])
def test_check_rejects_planted_files(out, tmp_path, planted):
    dist = tmp_path / "dist"
    run("--out", str(out), "--dist", str(dist))
    assert run("--check", "--dist", str(dist)).returncode == 0
    target = dist / planted
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text("planted")
    r = run("--check", "--dist", str(dist), check=False)
    assert r.returncode != 0 and planted.split("/")[-1] in r.stderr


@pytest.mark.parametrize("page, line", [
    ("index.html", '<script src="https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js"></script>'),
    ("index.html", '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IM+Fell+English">'),
    ("style.css", "@font-face { font-family: x; src: url(https://fonts.gstatic.com/x.woff2); }"),
    ("god.js", 'import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js";'),
])
def test_check_rejects_runtime_requests_outside_the_origin(out, tmp_path, page, line):
    dist = tmp_path / "dist"
    run("--out", str(out), "--dist", str(dist))
    assert run("--check", "--dist", str(dist)).returncode == 0
    target = dist / page
    target.write_text(target.read_text() + "\n" + line + "\n")
    r = run("--check", "--dist", str(dist), check=False)
    assert r.returncode != 0 and "external runtime request" in r.stderr


FAKE_KEY = "uvftest1" + ("qpzry9x8gf2tvdw0s3jn54khce6mua7l" * 4)   # shaped like a viewing key; not a real one


def test_key_is_published_only_as_key_txt(out, tmp_path):
    dist, key = tmp_path / "dist", tmp_path / "choir.key"
    key.write_text(FAKE_KEY + "\n")
    run("--out", str(out), "--dist", str(dist), "--key-file", str(key), "--birthday", "4502962")
    assert (dist / "key.txt").read_text() == FAKE_KEY + "\n"
    static = json.loads((dist / "static.json").read_text())
    assert static["key"] == {"file": "key.txt", "birthday": 4502962}
    assert all(FAKE_KEY not in p.read_text(errors="ignore") for p in dist.rglob("*") if p.is_file() and p.name != "key.txt")
    assert run("--check", "--dist", str(dist)).returncode == 0
    # without --key-file there is no key.txt and no key entry
    dist2 = tmp_path / "dist2"
    run("--out", str(out), "--dist", str(dist2))
    assert not (dist2 / "key.txt").exists() and "key" not in json.loads((dist2 / "static.json").read_text())


@pytest.mark.parametrize("planted", ["index.html", "out/score.json", "app.js", "anchor.json"])
def test_check_rejects_a_key_outside_key_txt(out, tmp_path, planted):
    dist, key = tmp_path / "dist", tmp_path / "choir.key"
    key.write_text(FAKE_KEY + "\n")
    run("--out", str(out), "--dist", str(dist), "--key-file", str(key))
    target = dist / planted
    target.write_text(target.read_text() + "\n" + FAKE_KEY + "\n")
    r = run("--check", "--dist", str(dist), check=False)
    assert r.returncode != 0 and "a viewing key outside key.txt" in r.stderr and FAKE_KEY not in r.stderr + r.stdout


@pytest.mark.parametrize("content", ["not a key\n", FAKE_KEY + "\n" + FAKE_KEY + "\n", ""])
def test_refuses_a_key_file_that_is_not_one_key(out, tmp_path, content):
    key = tmp_path / "bad.key"
    key.write_text(content)
    r = run("--out", str(out), "--dist", str(tmp_path / "dist"), "--key-file", str(key), check=False)
    assert r.returncode == 1 and "exactly one unified full viewing key" in r.stderr and FAKE_KEY not in r.stderr


def test_security_headers_are_written(out, tmp_path):
    dist = tmp_path / "dist"
    run("--out", str(out), "--dist", str(dist))
    rules = json.loads((dist / "vercel.json").read_text())["headers"]
    glob = {h["key"]: h["value"] for r in rules if r["source"] == "/(.*)" for h in r["headers"]}
    csp = glob["Content-Security-Policy"]
    assert "default-src 'self'" in csp and "connect-src 'self'" in csp and "frame-ancestors 'none'" in csp
    assert "unsafe-eval" not in csp and "script-src 'self' 'sha256-" in csp
    assert "'unsafe-inline'" not in csp.split("script-src")[1].split(";")[0]
    assert glob["Referrer-Policy"] == "no-referrer"


@pytest.mark.parametrize("planted", ['<script>alert(1)</script>', '<script type="importmap">{"imports": {}}</script>'])
def test_check_rejects_inline_scripts_the_policy_does_not_allow(out, tmp_path, planted):
    dist = tmp_path / "dist"
    run("--out", str(out), "--dist", str(dist))
    page = dist / "apparition.html"
    page.write_text(page.read_text().replace("</body>", planted + "\n</body>"))
    r = run("--check", "--dist", str(dist), check=False)
    assert r.returncode != 0 and ("inline script" in r.stderr or "not allowed by its hash" in r.stderr)


def test_check_rejects_a_weakened_policy(out, tmp_path):
    dist = tmp_path / "dist"
    run("--out", str(out), "--dist", str(dist))
    v = dist / "vercel.json"
    v.write_text(v.read_text().replace("script-src 'self'", "script-src 'self' 'unsafe-eval'"))
    r = run("--check", "--dist", str(dist), check=False)
    assert r.returncode != 0 and "unsafe-eval" in r.stderr


def test_static_title_and_link_preview_come_from_brand_json(out, tmp_path):
    brand = json.loads((ROOT / "config" / "brand.json").read_text())
    dist = tmp_path / "dist"
    run("--out", str(out), "--dist", str(dist))
    page = (dist / "index.html").read_text()
    assert f"<title>{brand['name']}</title>" in page
    assert f'<meta property="og:image" content="https://{brand["slug"]}.vercel.app/og.png">' in page
    assert 'property="og:title" content=""' not in page and 'name="description" content=""' not in page
    assert brand["name"] not in (ROOT / "web" / "index.html").read_text()     # the source keeps placeholders


def test_dist_and_vercel_are_ignored():
    ignore = (ROOT / ".gitignore").read_text().splitlines()
    assert "dist/" in ignore and ".vercel/" in ignore


def test_anchor_statement_ships_and_matches_the_render(out, tmp_path):
    import anchor
    dist = tmp_path / "dist"
    run("--out", str(out), "--dist", str(dist))
    data = (dist / "anchor.json").read_bytes()
    doc = anchor.parse(data)                    # canonical bytes, fixed fields only
    assert doc["render_hash"] == "a" * 64 and doc["score_hash"] == "b" * 64 and doc["as_of_height"] == 4522002
    assert data == anchor.from_out(out, commit=doc["repo_commit"])
    assert not (dist / "anchor.json.ots").exists()      # stamping only with --stamp
    vercel = json.loads((dist / "vercel.json").read_text())
    assert {"/anchor.json", "/anchor.json.ots"} <= {h["source"] for h in vercel["headers"]}


def test_a_failed_stamp_is_a_warning_not_a_failed_build(out, tmp_path):
    dist = tmp_path / "dist"
    env = {**os.environ, "ANCHOR_OTS": "/nonexistent/ots"}
    r = subprocess.run(["bash", str(SCRIPT), "--out", str(out), "--dist", str(dist), "--stamp"], cwd=ROOT,
                       capture_output=True, text=True, env=env)
    assert r.returncode == 0, r.stderr
    assert "::warning::stamp failed" in r.stderr
    assert (dist / "anchor.json").exists() and not (dist / "anchor.json.ots").exists()
    assert run("--check", "--dist", str(dist)).returncode == 0
