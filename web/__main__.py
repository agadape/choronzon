"""Serve the listener page: python3 -m web [--port 8080] [--bind 127.0.0.1] [--out out]

A plain static server (stdlib only) exposing web/, config/brand.json and the renderer's out/ directory, plus
GET /whisper/<txid>[?text=...&phone] which builds a Whisper Back payment request from the view-only wallet, and
GET /eye which serves the published full viewing key once the server has --key-file AND the operator opened the
Eye (POST /eye/open from the operator's own machine; the séance page does this when the button is pressed).
Pages: / (listener), /?seance (hashes and key sealed until the Eye opens), /apparition.html (two evocations),
/kiosk.html (type a secret on a screen; only with --kiosk and only from the kiosk machine itself: POST
/kiosk/preview returns the ghost voice as WAV, POST /kiosk/offer sends from the open ephemeral session wallet).

Binds to 127.0.0.1 by default; pass --bind 0.0.0.0 to let a second laptop read out/score.json + out/mix.wav
(the only two files served with a CORS header). Every path is resolved and confined to its directory.
No analytics, no external requests; the page is just HTML + Canvas + WebAudio playback of out/mix.wav.
"""
from __future__ import annotations

import argparse
import functools
import http.server
import json
import re
import urllib.parse
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
WEB_DIR = REPO / "web"
LOOPBACK = ("127.0.0.1", "::1", "::ffff:127.0.0.1")
CORS_FILES = ("out/score.json", "out/mix.wav", "out/render_hash")
_TXID = re.compile(r"^[0-9a-f]{64}$")


def _confined(base: Path, sub: str) -> Path | None:
    """`base / sub` resolved, or None when it escapes `base` (.., absolute, symlink out)."""
    try:
        p = (base / sub).resolve()
        return p if p.is_relative_to(base.resolve()) else None
    except (OSError, ValueError):
        return None


class Handler(http.server.SimpleHTTPRequestHandler):
    routes = {"config/brand.json": REPO / "config" / "brand.json", "logo.svg": REPO / "docs" / "brand" / "logo.svg"}

    def __init__(self, *a, out_dir: Path, wallet_dir: Path | None, key_file: str | None = None,
                 birthday: int | None = None, kiosk: bool = False, **k):
        self.out_dir = Path(out_dir)
        self.wallet_dir = wallet_dir
        self.key_file = key_file
        self.birthday = birthday
        self.kiosk = kiosk
        self._cors = False
        super().__init__(*a, directory=str(WEB_DIR), **k)

    # --- request plumbing ----------------------------------------------------------------------------------------

    def rel_path(self) -> str:
        """Decoded path without query/fragment, no leading slash."""
        return urllib.parse.unquote(self.path.split("?", 1)[0].split("#", 1)[0]).lstrip("/")

    def is_loopback(self) -> bool:
        return self.client_address[0] in LOOPBACK

    def same_origin(self) -> bool:
        """For POSTs: an Origin header, when present, must name this server (no cross-site sends from another tab)."""
        origin = self.headers.get("Origin")
        if not origin:
            return True
        host = urllib.parse.urlsplit(origin).netloc
        return host == self.headers.get("Host")

    def read_json(self, limit: int = 8192) -> dict | None:
        if not (self.headers.get("Content-Type") or "").split(";")[0].strip() == "application/json":
            return None
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return None
        if n <= 0 or n > limit:
            return None
        try:
            doc = json.loads(self.rfile.read(n).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return None
        return doc if isinstance(doc, dict) else None

    def send_json(self, doc: dict, status: int = 200) -> None:
        body = json.dumps(doc).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def translate_path(self, path):
        """Every static path is confined to its directory; anything that escapes maps to a non-existent file."""
        rel = self.rel_path()
        denied = str(WEB_DIR / "__denied__")
        if rel in self.routes:
            return str(self.routes[rel])
        if rel.startswith("out/"):
            p = _confined(self.out_dir, rel[4:])
            return str(p) if p else denied
        p = _confined(WEB_DIR, rel)
        if p and p.is_dir() and rel not in ("", "/"):
            return denied                                   # no directory listings
        return str(p) if p else denied

    def list_directory(self, path):
        if Path(path).resolve() != WEB_DIR.resolve():       # only the root serves index.html; never list anything
            self.send_error(404)
            return None
        return super().list_directory(path)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        if self._cors:  # only out/score.json + out/mix.wav: what the other laptop's apparition page needs
            self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def log_message(self, fmt, *args):  # quiet: no request logging at all (query strings could carry text)
        pass

    # --- routes ------------------------------------------------------------------------------------------------------

    def do_GET(self):
        rel = self.rel_path()
        self._cors = rel in CORS_FILES
        try:
            if rel.startswith("whisper/"):
                return self.whisper(rel[8:])
            if rel == "eye":
                return self.eye()
            if rel in ("kiosk.html", "kiosk.js", "kiosk/copy"):
                if not self.kiosk_allowed():
                    return self.send_error(404, "kiosk not enabled on this server (start it with --kiosk, local only)")
                if rel == "kiosk/copy":
                    from kiosk import copy
                    return self.send_json({"privacy": copy.PRIVACY, "cta": copy.cta(), "brand": copy.brand()})
            super().do_GET()
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_HEAD(self):
        self._cors = self.rel_path() in CORS_FILES
        super().do_HEAD()

    def do_POST(self):
        rel = self.rel_path()
        try:
            if rel == "eye/open":
                return self.eye_open()
            if rel in ("kiosk/preview", "kiosk/offer"):
                return self.kiosk_post(rel)
            self.send_error(404)
        except (BrokenPipeError, ConnectionResetError):
            pass

    # --- whisper back ------------------------------------------------------------------------------------------------

    def whisper(self, txid: str) -> None:
        """Whisper Back: re-read the reply address of one offering from the wallet DB (never from score.json)."""
        from protocol import ProtocolError
        from renderer import whisper
        from renderer.wallet import WalletDB
        txid = txid.lower()
        if self.wallet_dir is None or not _TXID.match(txid):
            return self.send_error(404)
        target = whisper.find_target(WalletDB(self.wallet_dir), txid)
        if target is None:
            return self.send_error(404, "no reply address")
        query = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
        text = query.get("text", ["you are not alone."])[0][:400]
        try:
            uri = whisper.reply_uri(target, text, phone="phone" in query)
        except (ProtocolError, ValueError) as e:
            return self.send_json({"error": f"that whisper cannot be encoded: {e}"}, 400)
        self.send_json({"txid": txid, "contrib_id": target.contrib_id, "uri": uri, "qr_svg": whisper.qr_svg(uri)})

    # --- the Eye ------------------------------------------------------------------------------------------------------

    def eye_open(self) -> None:
        """The operator (loopback only) opens the Eye; before this, GET /eye is 404 even with --key-file."""
        if not self.is_loopback() or not self.same_origin():
            return self.send_error(403)
        self.server.eye_open = True   # shared across handler threads; never closes again while the server runs
        self.send_json({"open": True, "key_published": bool(self.key_file and Path(self.key_file).is_file())})

    def eye(self) -> None:
        """The published full viewing key: only after POST /eye/open and only when --key-file names a file
        written by `kiosk reveal --to`. Without it the page reveals the hashes only."""
        if not getattr(self.server, "eye_open", False):
            return self.send_error(404, "the eye is closed")
        if not self.key_file or not Path(self.key_file).is_file():
            return self.send_error(404, "no key published on this server")
        from renderer import whisper
        key = Path(self.key_file).read_text(encoding="utf-8").strip()
        self.send_json({"key": key, "birthday": self.birthday, "qr_svg": whisper.qr_svg(key)})

    # --- kiosk: a judge types the secret on a screen; same code path as `python3 -m kiosk offer` -----------------

    def kiosk_allowed(self) -> bool:
        """The send endpoints exist only with --kiosk AND for the kiosk machine itself (loopback), never over a LAN."""
        return self.kiosk and self.is_loopback()

    def kiosk_post(self, rel: str) -> None:
        if not self.kiosk_allowed():
            return self.send_error(404, "kiosk not enabled on this server")
        if not self.same_origin():
            return self.send_error(403, "cross-origin send refused")
        body = self.read_json()
        if body is None:
            return self.send_json({"error": "expected a small application/json object"}, 400)
        text = body.get("text", "")
        if not isinstance(text, str) or not text.strip():
            return self.send_json({"error": "nothing to send"}, 400)
        text = text.strip()
        from kiosk.devtool import DevtoolError
        from kiosk.offering import Choir, make_offering
        from protocol import ProtocolError
        from renderer.decoder import Decoder
        from renderer.tts import TTSError, Voice
        voice = Voice(Decoder(), cache_dir=None)      # no cache on the kiosk: nothing of the voice stays on disk
        if not voice.available():
            return self.send_json({"error": "espeak-ng and sox are required on the kiosk machine"}, 500)
        try:
            if rel == "kiosk/preview":
                o = make_offering(text, voice, None)
                return self.send_wav(Decoder().decode(o.codec, o.frames), o)
            from kiosk.session import Session
            s = Session.current()
            if not s or not s.status()["ready"]:
                return self.send_json({"error": "no ready session on this kiosk: python3 -m kiosk session open"}, 409)
            o, txid = s.offer(text, voice, Choir.load(), bool(body.get("reply")))
            return self.send_json({"txid": txid, "contrib_id": o.contrib_id, "memos": len(o.memos),
                                   "seconds": round(o.seconds, 1), "bytes": len(o.frames), "reply": o.has_reply})
        except ProtocolError as e:                 # e.g. too-long: the ghost voice does not fit in three memos
            return self.send_json({"error": f"too long for the god: shorten it ({e.code})"}, 400)
        except (DevtoolError, TTSError) as e:      # DevtoolError messages are already stripped of addresses
            return self.send_json({"error": str(e)}, 502)

    def send_wav(self, pcm: bytes, offering) -> None:
        import io
        import wave
        buf = io.BytesIO()
        with wave.open(buf, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(8000)
            w.writeframes(pcm)
        data = buf.getvalue()
        self.send_response(200)
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("X-Ghost-Seconds", f"{offering.seconds:.1f}")
        self.send_header("X-Ghost-Bytes", str(len(offering.frames)))
        self.send_header("X-Ghost-Memos", str(len(offering.memos)))
        self.end_headers()
        self.wfile.write(data)


def make_server(bind: str, port: int, **handler_kwargs) -> http.server.ThreadingHTTPServer:
    srv = http.server.ThreadingHTTPServer((bind, port), functools.partial(Handler, **handler_kwargs))
    srv.eye_open = False
    return srv


def main(argv=None):
    p = argparse.ArgumentParser(prog="python3 -m web", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--port", type=int, default=8080)
    p.add_argument("--bind", default="127.0.0.1", help="0.0.0.0 to let a second laptop read out/ (default: local only)")
    p.add_argument("--out", default=str(REPO / "out"))
    p.add_argument("--wallet", default=str(REPO / "wallets" / "test" / "V"),
                   help="view-only wallet used to look up reply addresses for Whisper Back ('' disables it)")
    p.add_argument("--key-file", help="published full viewing key (from `kiosk reveal --to`) for the séance page")
    p.add_argument("--birthday", type=int, help="birth height to show next to the key")
    p.add_argument("--kiosk", action="store_true",
                   help="enable /kiosk.html and the send endpoints, for loopback clients only (default off)")
    a = p.parse_args(argv)
    with make_server(a.bind, a.port, out_dir=Path(a.out), wallet_dir=Path(a.wallet) if a.wallet else None,
                     key_file=a.key_file, birthday=a.birthday, kiosk=a.kiosk) as srv:
        print(f"listener page on http://{a.bind}:{a.port}/  (out dir: {a.out})")
        srv.serve_forever()


if __name__ == "__main__":
    main()
