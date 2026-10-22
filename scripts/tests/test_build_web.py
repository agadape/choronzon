"""build_web.sh copies only its allow-list into dist/ and refuses anything else (nothing private can be deployed)."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "build_web.sh"
ALLOWED = {"index.html", "apparition.html", "static.json", "vercel.json", "config/brand.json", "out/score.json",
           "out/mix.wav", "out/render_hash", "app.js", "apparition.js", "creature.js", "name.js", "style.css",
           "logo.svg", "og.png"}


def run(*args, check=True):
    return subprocess.run(["bash", str(SCRIPT), *args], cwd=ROOT, capture_output=True, text=True, check=check)


@pytest.fixture
def out(tmp_path):
    o = tmp_path / "out"
    o.mkdir()
    (o / "score.json").write_text(json.dumps({"score": {"as_of_height": 4522002, "offerings": [], "skipped": []},
                                              "render": {"timeline": []}, "render_hash": "a" * 64,
                                              "score_hash": "b" * 64}))
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
            "out/mix.wav", "app.js", "creature.js", "name.js", "style.css", "logo.svg"} <= files
    assert "kiosk.js" not in files and "out/cache/secretvoice.c2" not in files
    static = json.loads((dist / "static.json").read_text())
    assert static["static"] is True and static["as_of_height"] == 4522002 and static["render_hash"] == "a" * 64
    vercel = json.loads((dist / "vercel.json").read_text())
    assert vercel["cleanUrls"] is True
    assert any(h["source"] == "/out/(.*)" for h in vercel["headers"])


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


def test_dist_and_vercel_are_ignored():
    ignore = (ROOT / ".gitignore").read_text().splitlines()
    assert "dist/" in ignore and ".vercel/" in ignore
