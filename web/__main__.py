"""Serve the listener page: python3 -m web [--port 8080] [--out out]

A plain static server (stdlib only) exposing web/, config/brand.json and the renderer's out/ directory.
No analytics, no external requests; the page is just HTML + Canvas + WebAudio playback of out/mix.wav.
"""
from __future__ import annotations

import argparse
import functools
import http.server
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]


class Handler(http.server.SimpleHTTPRequestHandler):
    routes = {"config/brand.json": REPO / "config" / "brand.json"}

    def __init__(self, *a, out_dir: Path, **k):
        self.out_dir = out_dir
        super().__init__(*a, directory=str(REPO / "web"), **k)

    def translate_path(self, path):
        rel = path.split("?", 1)[0].lstrip("/")
        if rel in self.routes:
            return str(self.routes[rel])
        if rel.startswith("out/"):
            return str(self.out_dir / rel[4:])
        return super().translate_path(path)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):  # quiet: paths only, never query strings
        pass


def main(argv=None):
    p = argparse.ArgumentParser(prog="python3 -m web", description=__doc__)
    p.add_argument("--port", type=int, default=8080)
    p.add_argument("--bind", default="0.0.0.0")
    p.add_argument("--out", default=str(REPO / "out"))
    a = p.parse_args(argv)
    handler = functools.partial(Handler, out_dir=Path(a.out))
    with http.server.ThreadingHTTPServer((a.bind, a.port), handler) as srv:
        print(f"listener page on http://{a.bind}:{a.port}/  (out dir: {a.out})")
        srv.serve_forever()


if __name__ == "__main__":
    main()
