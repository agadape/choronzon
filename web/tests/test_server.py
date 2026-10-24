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
        kw.setdefault("wallet_dir", None)
        srv = make_server("127.0.0.1", 0, out_dir=out, **kw)
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
        req.port = servers[srv]
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
    assert req("GET", "/logo.svg")[0] == 200 and req("GET", "/style.css")[0] == 200
    for served_file in ("/god.js", "/vendor/three/three.module.min.js", "/vendor/three/BufferGeometryUtils.js",
                        "/fonts/IMFellEnglish-Regular.ttf", "/fonts/OFL.txt"):
        status, headers, _ = req("GET", served_file)
        assert status == 200, served_file
        if served_file.endswith(".js"):
            ctype = {k.lower(): v for k, v in headers.items()}.get("content-type", "")
            assert "javascript" in ctype, served_file   # module scripts need a JS type
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


GUARDED = [("GET", "/eye", None), ("POST", "/eye/open", {}), ("GET", "/whisper/" + "0" * 64, None),
           ("POST", "/whisper/" + "0" * 64, {"text": "x"}), ("GET", "/kiosk.html", None), ("GET", "/kiosk.js", None),
           ("GET", "/kiosk/copy", None), ("POST", "/kiosk/preview", {"text": "x"}),
           ("POST", "/kiosk/offer", {"text": "x"}), ("POST", "/anything", {})]


@pytest.mark.parametrize("method,path,body", GUARDED)
def test_dns_rebinding_host_is_refused_on_every_guarded_endpoint(served, method, path, body):
    """A page on evil.example whose DNS now points at 127.0.0.1: same-origin to itself, but the Host is not ours."""
    start, d = served
    req = start(kiosk=True, key_file=str(d["key"]))
    assert req("POST", "/eye/open", {})[0] == 200            # even an opened Eye is not served to a rebound name
    p = req.port
    for host in ("evil.example", f"evil.example:{p}", f"127.0.0.1.evil.example:{p}", f"127.0.0.1:{p + 1}", ""):
        status, _, payload = req(method, path, body, {"Host": host, "Origin": f"http://{host}"})
        assert status == 403, (method, path, host, status)
        assert b"uvftest1example" not in payload


def test_loopback_names_are_allowed(served):
    start, d = served
    req = start(kiosk=True, key_file=str(d["key"]))
    for host in (f"127.0.0.1:{req.port}", f"localhost:{req.port}", f"LOCALHOST:{req.port}", f"[::1]:{req.port}"):
        assert req("GET", "/kiosk/copy", headers={"Host": host})[0] == 200, host
        assert req("POST", "/eye/open", {}, {"Host": host, "Origin": f"http://{host}"})[0] == 200, host
        assert req("GET", "/eye", headers={"Host": host})[0] == 200, host
    from web.__main__ import allowed_hosts
    assert allowed_hosts("127.0.0.1", 8765) == {"127.0.0.1:8765", "localhost:8765", "[::1]:8765"}


def test_allowed_hosts_for_an_explicit_bind_and_allow_host():
    from web.__main__ import allowed_hosts
    assert "192.168.1.5:8765" in allowed_hosts("192.168.1.5", 8765)
    wild = allowed_hosts("0.0.0.0", 8765)
    assert "0.0.0.0:8765" not in wild and "192.168.1.5:8765" not in wild
    extra = allowed_hosts("0.0.0.0", 8765, ("192.168.1.5", "Laptop.local:9000"))
    assert {"192.168.1.5:8765", "laptop.local:9000"} <= extra
    assert {"localhost", "127.0.0.1"} <= allowed_hosts("127.0.0.1", 80)     # port 80: browsers omit it


def test_public_pages_do_not_need_a_known_host(served):
    """Static, public content is the same for everyone; only keys, wallets and sends are guarded."""
    start, _ = served
    req = start()
    for path in ("/", "/out/score.json", "/config/brand.json"):
        assert req("GET", path, headers={"Host": "evil.example"})[0] == 200, path


@pytest.fixture
def whisper_target(monkeypatch):
    """A fake offering with a reply address, so /whisper/<txid> can be exercised without a wallet."""
    from protocol import address
    from renderer import wallet, whisper
    ua = address.bech32m_encode("utest", [i % 32 for i in range(170)])
    target = whisper.ReplyTarget("ab" * 32, 4242, ua)
    monkeypatch.setattr(wallet, "WalletDB", lambda path: object())
    monkeypatch.setattr(whisper, "find_target", lambda db, txid: target if txid == target.txid else None)
    return target


def _memo_of(uri):
    import base64
    memo = uri.split("memo=", 1)[1]
    return base64.urlsafe_b64decode(memo + "=" * (-len(memo) % 4))


def test_whisper_post_body_and_loopback_only(served, whisper_target, tmp_path, monkeypatch):
    import web.__main__ as srvmod
    start, _ = served
    req = start(wallet_dir=tmp_path)
    path = f"/whisper/{whisper_target.txid}"
    status, _, body = req("POST", path, {"text": "the text goes in the body"})
    assert status == 200
    doc = json.loads(body)
    assert doc["contrib_id"] == 4242 and b"the text goes in the body" in _memo_of(doc["uri"])
    status, _, body = req("POST", path, {"text": "phone form", "phone": True})
    assert status == 200 and _memo_of(json.loads(body)["uri"]).startswith(b"GC1R:4242:phone form")
    assert req("POST", path, {"text": "x"}, {"Origin": "http://evil.example"})[0] == 403
    assert req("POST", path, raw_body=b"text=x", headers={"Content-Type": "text/plain"})[0] == 400
    # GET with ?text= keeps working until the page switches to POST
    status, _, body = req("GET", path + "?text=still%20works")
    assert status == 200 and b"still works" in _memo_of(json.loads(body)["uri"])
    assert req("GET", "/whisper/" + "cd" * 32)[0] == 404                  # no reply address
    # a client that is not this machine never gets a reply address, by GET or POST
    monkeypatch.setattr(srvmod, "LOOPBACK", ())
    for method, b in (("GET", None), ("POST", {"text": "x"})):
        status, _, payload = req(method, path, b)
        assert status == 404 and whisper_target.address.encode() not in payload, method


def test_kiosk_copy_states_the_route_in_use(served, monkeypatch):
    start, _ = served
    req = start(kiosk=True)
    monkeypatch.setenv("LWD_CONNECTION", "tor")
    assert "Tor exit" in json.loads(req("GET", "/kiosk/copy")[2])["privacy"]
    monkeypatch.setenv("LWD_CONNECTION", "direct")
    assert "CONNECTED DIRECTLY" in json.loads(req("GET", "/kiosk/copy")[2])["privacy"]


def test_kiosk_offer_reply_to_is_checked_before_anything_is_sent(served):
    start, _ = served
    req = start(kiosk=True)
    status, _, body = req("POST", "/kiosk/offer", {"text": "x", "reply": True, "reply_to": "utest1abc"})
    assert status == 400 and b"not both" in body
    status, _, body = req("POST", "/kiosk/offer", {"text": "x", "reply_to": 5})
    assert status == 400


def test_default_bind_is_loopback():
    src = (REPO / "web" / "__main__.py").read_text(encoding="utf-8")
    assert 'add_argument("--bind", default="127.0.0.1"' in src
