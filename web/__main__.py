"""Serve the listener page: python3 -m web [--port 8080] [--out out]

A plain static server (stdlib only) exposing web/, config/brand.json and the renderer's out/ directory, plus
GET /whisper/<txid>[?text=...&phone] which builds a Whisper Back payment request from the view-only wallet, and
GET /eye which serves the published full viewing key when the server was started with --key-file.
Pages: / (listener), /?seance (hashes and key sealed until the Eye opens), /apparition.html (two evocations).
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
                 birthday: int | None = None, **k):
        self.out_dir = out_dir
        self.wallet_dir = wallet_dir
        self.key_file = key_file
        self.birthday = birthday
        super().__init__(*a, directory=str(REPO / "web"), **k)

    def do_GET(self):
        rel = self.path.split("?", 1)[0].lstrip("/")
        if rel.startswith("whisper/"):
            return self.whisper(rel[8:])
        if rel == "eye":
            return self.eye()
        super().do_GET()

    def eye(self) -> None:
        """The Eye opens: the published full viewing key, served only when the operator started the server with
        --key-file (a file written by `kiosk reveal --to`). Without it: 404, and the page reveals the hashes only."""
        if not self.key_file or not Path(self.key_file).is_file():
            return self.send_error(404, "no key published on this server")
        from renderer import whisper
        key = Path(self.key_file).read_text(encoding="utf-8").strip()
        self.send_json({"key": key, "birthday": self.birthday, "qr_svg": whisper.qr_svg(key)})

    def send_json(self, doc: dict) -> None:
        body = json.dumps(doc).encode()
        self.send_response(200)
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
    a = p.parse_args(argv)
    handler = functools.partial(Handler, out_dir=Path(a.out), wallet_dir=Path(a.wallet) if a.wallet else None,
                                key_file=a.key_file, birthday=a.birthday)
    with http.server.ThreadingHTTPServer((a.bind, a.port), handler) as srv:
        print(f"listener page on http://{a.bind}:{a.port}/  (out dir: {a.out})")
        srv.serve_forever()


if __name__ == "__main__":
    main()
