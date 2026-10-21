"""The web server's safety properties: paths confined, CORS only where needed, kiosk and Eye gated, no crashes."""
import http.client
import json
import threading
from pathlib import Path

import pytest

from web.__main__ import REPO, make_server

SCORE = {"format": "score/1", "as_of_height": 1, "offerings": [], "skipped": []}


@pytest.fixture
def served(tmp_path):
    """A server on an ephemeral loopback port; yields a request helper plus the dirs it serves."""
    out = tmp_path / "out"
    out.mkdir()
    (out / "score.json").write_text(json.dumps({"score": SCORE, "render": {"timeline": []}, "render_hash": "0" * 64,
                                                "score_hash": "1" * 64}))
    (out / "mix.wav").write_bytes(b"RIFF")
    secret = tmp_path / "secret.txt"
    secret.write_text("not for the web\n")
    key = tmp_path / "key.txt"
    key.write_text("uvftest1example\n")
    servers = {}

    def start(**kw):
        srv = make_server("127.0.0.1", 0, out_dir=out, wallet_dir=None, **kw)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        servers[srv] = srv.server_address[1]

        def req(method, path, body=None, headers=None, raw_body=None):
            c = http.client.HTTPConnection("127.0.0.1", servers[srv], timeout=5)
            h = {"Host": f"127.0.0.1:{servers[srv]}", **(headers or {})}
            data = raw_body if raw_body is not None else (json.dumps(body).encode() if body is not None else None)
            if body is not None and "Content-Type" not in h:
                h["Content-Type"] = "application/json"
            c.putrequest(method, path, skip_host=True)
            for k, v in h.items():
                c.putheader(k, v)
            if data is not None:
                c.putheader("Content-Length", str(len(data)))
            c.endheaders(data)
            r = c.getresponse()
            payload = r.read()
            c.close()
            return r.status, dict(r.getheaders()), payload
        return req

    yield start, {"out": out, "secret": secret, "key": key}
    for srv in servers:
        srv.shutdown()


def test_served_files_and_confinement(served):
    start, d = served
    req = start()
    assert req("GET", "/")[0] == 200
    assert req("GET", "/out/score.json")[0] == 200
    assert req("GET", "/config/brand.json")[0] == 200
    for bad in ("/out/../secret.txt", "/out/%2e%2e/secret.txt", "/out//etc/hostname", "/out/..%2fsecret.txt",
                "/../pyproject.toml", "/%2e%2e/pyproject.toml", "/out/../../etc/passwd", "/tests/", "/out/"):
        status, _, body = req("GET", bad)
        assert status == 404, bad
        assert b"not for the web" not in body and b"root:" not in body


def test_cors_only_on_the_two_shared_files(served):
    start, _ = served
    req = start()
    for path, expected in (("/out/score.json", True), ("/out/mix.wav", True), ("/", False),
                           ("/config/brand.json", False), ("/creature.js", False)):
        _, headers, _ = req("GET", path)
        assert ("Access-Control-Allow-Origin" in headers) is expected, path


def test_kiosk_is_off_by_default_and_gated(served):
    start, _ = served
    req = start()
    assert req("GET", "/kiosk.html")[0] == 404
    assert req("GET", "/kiosk/copy")[0] == 404
    assert req("POST", "/kiosk/offer", {"text": "x"})[0] == 404
    req = start(kiosk=True)
    assert req("GET", "/kiosk.html")[0] == 200
    assert req("GET", "/kiosk/copy")[0] == 200
    # cross-site POST from another page open in the browser is refused; same-origin is not
    assert req("POST", "/kiosk/offer", {"text": "x"}, {"Origin": "http://evil.example"})[0] == 403
    assert req("POST", "/kiosk/offer", {"text": "x"}, {"Origin": "http://localhost:1"})[0] == 403
    # malformed bodies are answered, never crash the handler
    assert req("POST", "/kiosk/offer", raw_body=b"[1,2]", headers={"Content-Type": "application/json"})[0] == 400
    assert req("POST", "/kiosk/offer", raw_body=b"text=x", headers={"Content-Type": "text/plain"})[0] == 400
    assert req("POST", "/kiosk/offer", {"text": "   "})[0] == 400
    assert req("POST", "/kiosk/offer", {"text": 5})[0] == 400


def test_eye_needs_key_file_and_an_explicit_open(served):
    start, d = served
    req = start()
    assert req("GET", "/eye")[0] == 404
    assert req("POST", "/eye/open", {})[0] == 200           # loopback operator
    assert req("GET", "/eye")[0] == 404                      # still no key file on this server
    req = start(key_file=str(d["key"]), birthday=42)
    assert req("GET", "/eye")[0] == 404                      # key file present but the eye is closed
    assert req("POST", "/eye/open", {}, {"Origin": "http://evil.example"})[0] == 403
    assert req("POST", "/eye/open", {})[0] == 200
    status, _, body = req("GET", "/eye")
    assert status == 200
    doc = json.loads(body)
    assert doc["key"] == "uvftest1example" and doc["birthday"] == 42 and "<svg" in doc["qr_svg"].lower()


def test_whisper_rejects_bad_txids(served):
    start, _ = served
    req = start()
    assert req("GET", "/whisper/not-a-txid")[0] == 404
    assert req("GET", "/whisper/" + "g" * 64)[0] == 404
    assert req("POST", "/whisper/" + "0" * 64)[0] == 404


def test_default_bind_is_loopback():
    src = (REPO / "web" / "__main__.py").read_text(encoding="utf-8")
    assert 'add_argument("--bind", default="127.0.0.1"' in src
