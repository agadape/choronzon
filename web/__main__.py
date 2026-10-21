"""Serve the listener page: python3 -m web [--port 8080] [--out out]

A plain static server (stdlib only) exposing web/, config/brand.json and the renderer's out/ directory, plus
GET /whisper/<txid>[?text=...&phone] which builds a Whisper Back payment request from the view-only wallet, and
GET /eye which serves the published full viewing key when the server was started with --key-file.
Pages: / (listener), /?seance (hashes and key sealed until the Eye opens), /apparition.html (two evocations),
/kiosk.html (type a secret on a screen; only with --kiosk and only from the kiosk machine itself: POST
/kiosk/preview returns the ghost voice as WAV, POST /kiosk/offer sends from the open ephemeral session wallet).
No analytics, no external requests; the page is just HTML + Canvas + WebAudio playback of out/mix.wav.
"""
from __future__ import annotations

import argparse
import functools
import http.server
import json
import urllib.parse
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]


class Handler(http.server.SimpleHTTPRequestHandler):
    routes = {"config/brand.json": REPO / "config" / "brand.json"}

    def __init__(self, *a, out_dir: Path, wallet_dir: Path | None, key_file: str | None = None,
                 birthday: int | None = None, kiosk: bool = False, **k):
        self.out_dir = out_dir
        self.wallet_dir = wallet_dir
        self.key_file = key_file
        self.birthday = birthday
        self.kiosk = kiosk
        super().__init__(*a, directory=str(REPO / "web"), **k)

    def do_GET(self):
        rel = self.path.split("?", 1)[0].lstrip("/")
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

    # --- kiosk: a judge types the secret on a screen; same code path as `python3 -m kiosk offer` -----------------

    def kiosk_allowed(self) -> bool:
        """The send endpoints exist only with --kiosk AND for the kiosk machine itself (loopback), never over a LAN."""
        return self.kiosk and self.client_address[0] in ("127.0.0.1", "::1", "::ffff:127.0.0.1")

    def read_json(self, limit: int = 8192) -> dict | None:
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0 or n > limit:
            return None
        try:
            return json.loads(self.rfile.read(n).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return None

    def do_POST(self):
        rel = self.path.split("?", 1)[0].lstrip("/")
        if rel not in ("kiosk/preview", "kiosk/offer"):
            return self.send_error(404)
        if not self.kiosk_allowed():
            return self.send_error(404, "kiosk not enabled on this server")
        body = self.read_json()
        text = (body or {}).get("text", "")
        if not isinstance(text, str) or not text.strip():
            return self.send_json({"error": "nothing to send"}, 400)
        text = text.strip()
        from kiosk.devtool import DevtoolError
        from kiosk.offering import Choir, make_offering
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
            o, txid = s.offer(text, voice, Choir.load(), bool((body or {}).get("reply")))
            return self.send_json({"txid": txid, "contrib_id": o.contrib_id, "memos": len(o.memos),
                                   "seconds": round(o.seconds, 1), "bytes": len(o.frames), "reply": o.has_reply})
        except (DevtoolError, TTSError) as e:   # DevtoolError messages are already stripped of addresses
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

    def eye(self) -> None:
        """The Eye opens: the published full viewing key, served only when the operator started the server with
        --key-file (a file written by `kiosk reveal --to`). Without it: 404, and the page reveals the hashes only."""
        if not self.key_file or not Path(self.key_file).is_file():
            return self.send_error(404, "no key published on this server")
        from renderer import whisper
        key = Path(self.key_file).read_text(encoding="utf-8").strip()
        self.send_json({"key": key, "birthday": self.birthday, "qr_svg": whisper.qr_svg(key)})

    def send_json(self, doc: dict, status: int = 200) -> None:
        body = json.dumps(doc).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def whisper(self, txid: str) -> None:
        """Whisper Back: re-read the reply address of one offering from the wallet DB (never from score.json)."""
        from renderer import whisper
        from renderer.wallet import WalletDB
        txid = txid.lower()
        if self.wallet_dir is None or len(txid) != 64 or any(c not in "0123456789abcdef" for c in txid):
            return self.send_error(404)
        target = whisper.find_target(WalletDB(self.wallet_dir), txid)
        if target is None:
            return self.send_error(404, "no reply address")
        query = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
        text = query.get("text", ["you are not alone."])[0][:400]
        uri = whisper.reply_uri(target, text, phone="phone" in query)
        body = json.dumps({"txid": txid, "contrib_id": target.contrib_id, "uri": uri,
                           "qr_svg": whisper.qr_svg(uri)}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def translate_path(self, path):
        rel = path.split("?", 1)[0].lstrip("/")
        if rel in self.routes:
            return str(self.routes[rel])
        if rel.startswith("out/"):
            return str(self.out_dir / rel[4:])
        return super().translate_path(path)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        # the double apparition fetches the OTHER laptop's out/score.json + mix.wav from this origin
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def log_message(self, fmt, *args):  # quiet: paths only, never query strings
        pass


def main(argv=None):
    p = argparse.ArgumentParser(prog="python3 -m web", description=__doc__)
    p.add_argument("--port", type=int, default=8080)
    p.add_argument("--bind", default="0.0.0.0")
    p.add_argument("--out", default=str(REPO / "out"))
    p.add_argument("--wallet", default=str(REPO / "wallets" / "test" / "V"),
                   help="view-only wallet used to look up reply addresses for Whisper Back ('' disables it)")
    p.add_argument("--key-file", help="published full viewing key (from `kiosk reveal --to`) for the séance page")
    p.add_argument("--birthday", type=int, help="birth height to show next to the key")
    p.add_argument("--kiosk", action="store_true",
                   help="enable /kiosk.html and the send endpoints, for loopback clients only (default off)")
    a = p.parse_args(argv)
    handler = functools.partial(Handler, out_dir=Path(a.out), wallet_dir=Path(a.wallet) if a.wallet else None,
                                key_file=a.key_file, birthday=a.birthday, kiosk=a.kiosk)
    with http.server.ThreadingHTTPServer((a.bind, a.port), handler) as srv:
        print(f"listener page on http://{a.bind}:{a.port}/  (out dir: {a.out})")
        srv.serve_forever()


if __name__ == "__main__":
    main()
