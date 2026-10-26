"""GOD_CONFIG_DIR: one setting picks which god the kiosk, the web server and build_web.sh serve. Unset, everything
reads config/ exactly as before (the main god)."""
import http.client
import json
import os
import subprocess
import threading
from pathlib import Path

import pytest

from kiosk import config_dir as cd
from kiosk import copy, offering
from protocol import address

ROOT = Path(__file__).resolve().parents[2]
MAIN_BRAND = json.loads((ROOT / "config" / "brand.json").read_text(encoding="utf-8"))
MAIN_CHOIR = json.loads((ROOT / "config" / "choir.json").read_text(encoding="utf-8"))
OTHER_ADDR = address.bech32m_encode("zutest", [(i * 11) % 32 for i in range(170)])


@pytest.fixture
def other(tmp_path):
    d = tmp_path / "gods" / "retro-demo" / "config"
    d.mkdir(parents=True)
    (d / "brand.json").write_text(json.dumps({"name": "The Retro God", "slug": "retro-demo", "tagline": "t & <x>",
                                              "one_liner": "a box", "kiosk_cta": "give",
                                              "site_url": "https://retro.example.org/"}))
    (d / "choir.json").write_text(json.dumps({"network": "test", "address": OTHER_ADDR, "amount_zat": 1000}))
    (d / "skiplist.txt").write_text("# none\n")
    return d


def test_default_is_the_main_config(monkeypatch):
    monkeypatch.delenv(cd.ENV, raising=False)
    assert cd.config_dir() == ROOT / "config"
    assert cd.config_dir({cd.ENV: "  "}) == ROOT / "config"
    assert offering.Choir.load() == offering.Choir.load(ROOT / "config" / "choir.json")
    assert offering.Choir.load().address == MAIN_CHOIR["address"]
    assert copy.brand() == MAIN_BRAND


def test_override_switches_kiosk_choir_and_copy(monkeypatch, other):
    monkeypatch.setenv(cd.ENV, str(other))
    c = offering.Choir.load()
    assert c.address == OTHER_ADDR and c.amount_zat == 1000
    assert copy.brand()["name"] == "The Retro God" and copy.banner().startswith("The Retro God\n")
    assert copy.cta() == "give"


def test_kiosk_names_the_chosen_gods_watcher_as_proof(monkeypatch, other):
    from kiosk.__main__ import sent
    monkeypatch.delenv(cd.ENV, raising=False)
    assert "-w wallets/test/V list-tx" in sent("ab" * 32)
    (other.parent / "watcher").mkdir()
    monkeypatch.setenv(cd.ENV, str(other))
    assert f"-w {other.parent / 'watcher'} list-tx" in sent("ab" * 32)


def _renderer_args(monkeypatch, *argv):
    import renderer.__main__ as rm
    seen = {}
    monkeypatch.setattr(rm, "cmd_once", lambda a: seen.setdefault("args", a))
    rm.main(["once", "--wallet", "w", "--out", "", "--connection", "direct", *argv])
    return seen["args"]


def test_renderer_skiplist_default_follows_the_chosen_god(monkeypatch, other):
    monkeypatch.delenv(cd.ENV, raising=False)
    assert _renderer_args(monkeypatch).skiplist == str(ROOT / "config" / "skiplist.txt")
    monkeypatch.setenv(cd.ENV, str(other))
    assert _renderer_args(monkeypatch).skiplist == str(other / "skiplist.txt")
    assert _renderer_args(monkeypatch, "--skiplist", "x.txt").skiplist == "x.txt"   # an explicit flag still wins


def test_anchor_network_and_skiplist_follow_the_chosen_god(monkeypatch, other, out):
    import hashlib
    import anchor
    monkeypatch.delenv(cd.ENV, raising=False)
    assert anchor.network_name() == "zcash-testnet"
    main_doc = json.loads(anchor.from_out(out, commit="a" * 40))
    assert main_doc["skiplist_sha256"] == hashlib.sha256((ROOT / "config" / "skiplist.txt").read_bytes()).hexdigest()
    (other / "choir.json").write_text(json.dumps({"network": "main", "address": OTHER_ADDR, "amount_zat": 1000}))
    monkeypatch.setenv(cd.ENV, str(other))
    assert anchor.network_name() == "zcash-mainnet"
    doc = json.loads(anchor.from_out(out, commit="a" * 40))
    assert doc["skiplist_sha256"] == hashlib.sha256(b"# none\n").hexdigest() and doc["network"] == "zcash-mainnet"


def test_relative_paths_are_from_the_repo_root():
    assert cd.config_dir({cd.ENV: "wallets/gods/x/config"}) == ROOT / "wallets" / "gods" / "x" / "config"


def _get(srv, path):
    c = http.client.HTTPConnection("127.0.0.1", srv.server_address[1], timeout=5)
    c.request("GET", path, headers={"Host": f"127.0.0.1:{srv.server_address[1]}"})
    r = c.getresponse()
    return r.status, r.read()


def test_web_server_serves_the_chosen_brand(monkeypatch, other, tmp_path):
    from web.__main__ import make_server
    srv = make_server("127.0.0.1", 0, out_dir=tmp_path, wallet_dir=None)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        monkeypatch.delenv(cd.ENV, raising=False)
        assert json.loads(_get(srv, "/config/brand.json")[1]) == MAIN_BRAND
        monkeypatch.setenv(cd.ENV, str(other))
        status, body = _get(srv, "/config/brand.json")
        assert status == 200 and json.loads(body)["name"] == "The Retro God"
    finally:
        srv.shutdown()


def _build(out, dist, env_extra):
    env = {k: v for k, v in os.environ.items() if k != cd.ENV}
    return subprocess.run(["bash", "scripts/build_web.sh", "--out", str(out), "--dist", str(dist)], cwd=ROOT,
                          capture_output=True, text=True, env={**env, **env_extra})


@pytest.fixture
def out(tmp_path):
    o = tmp_path / "out"
    o.mkdir()
    (o / "score.json").write_text(json.dumps({"score": {"as_of_height": 4600200, "offerings": [], "skipped": []},
                                              "render": {"timeline": [], "composer": "choir/2",
                                                         "decoder": {"fingerprint": "c" * 64},
                                                         "voice": {"fingerprint": "d" * 64}},
                                              "regression": {"g6_hash": "e" * 64},
                                              "render_hash": "a" * 64, "render_hash_version": "render/1",
                                              "score_hash": "b" * 64, "score_hash_version": "score/1"}))
    (o / "mix.wav").write_bytes(b"RIFF\0\0\0\0WAVE")
    return o


def test_build_web_builds_the_chosen_god(other, out, tmp_path):
    dist = tmp_path / "dist"
    r = _build(out, dist, {cd.ENV: str(other)})
    assert r.returncode == 0, r.stderr
    assert json.loads((dist / "config" / "brand.json").read_text())["name"] == "The Retro God"
    static = json.loads((dist / "static.json").read_text())
    assert static["choir"] == {"network": "test", "address": OTHER_ADDR, "amount_zat": 1000}
    page = (dist / "index.html").read_text()
    assert "<title>The Retro God</title>" in page and "t &amp; &lt;x&gt;" in page
    assert '<meta property="og:url" content="https://retro.example.org/">' in page
    assert '<meta property="og:image" content="">' in page and not (dist / "og.png").exists()  # not the main god's
    assert MAIN_BRAND["name"] not in "".join(p.read_text(errors="ignore") for p in dist.rglob("*.html"))
    assert MAIN_CHOIR["address"] not in (dist / "static.json").read_text()
    anchor_doc = json.loads((dist / "anchor.json").read_text())
    import hashlib
    assert anchor_doc["skiplist_sha256"] == hashlib.sha256(b"# none\n").hexdigest()


def test_build_web_default_is_unchanged(out, tmp_path):
    dist = tmp_path / "dist"
    r = _build(out, dist, {})
    assert r.returncode == 0, r.stderr
    assert (dist / "config" / "brand.json").read_bytes() == (ROOT / "config" / "brand.json").read_bytes()
    assert json.loads((dist / "static.json").read_text())["choir"]["address"] == MAIN_CHOIR["address"]
    page = (dist / "index.html").read_text()
    assert f'content="https://{MAIN_BRAND["slug"]}.vercel.app/og.png"' in page and (dist / "og.png").exists()
    import hashlib
    assert json.loads((dist / "anchor.json").read_text())["skiplist_sha256"] == \
        hashlib.sha256((ROOT / "config" / "skiplist.txt").read_bytes()).hexdigest()


def test_build_web_an_absolute_path_to_the_main_config_is_the_main_god(out, tmp_path):
    dist = tmp_path / "dist"
    r = _build(out, dist, {cd.ENV: str(ROOT / "config")})
    assert r.returncode == 0, r.stderr
    assert "building the god in" not in r.stderr and (dist / "og.png").exists()
    assert (dist / "config" / "brand.json").read_bytes() == (ROOT / "config" / "brand.json").read_bytes()


def test_build_web_refuses_an_incomplete_config_dir(out, tmp_path):
    d = tmp_path / "half"
    d.mkdir()
    (d / "brand.json").write_text("{}")
    r = _build(out, tmp_path / "dist", {cd.ENV: str(d)})
    assert r.returncode != 0 and "choir.json missing" in r.stderr
