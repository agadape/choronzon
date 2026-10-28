"""Local server for rendering the video's shots: python3 video/serve.py --snap <dir> --frames <dir>

Serves only what video/cine.html and overlay.html need (video/, three.js, web/dpr.js, the fonts, config/brand.json
and the JSON files of one snapshot directory as /snap/<name>.json) on 127.0.0.1, and accepts the rendered frames:
POST /frame/<take>/<n> (JPEG or PNG body) and POST /done/<take>.
Nothing else in the repository (wallets, out/, logs) is reachable through it.
"""
import argparse
import base64
import http.server
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ALLOW = ("video/", "web/vendor/three/", "web/fonts/", "web/dpr.js", "config/brand.json")


def make_handler(score: Path, frames: Path, key_file: str | None = None):
    class H(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **k):
            super().__init__(*a, directory=str(ROOT), **k)

        def log_message(self, fmt, *args):
            pass

        def do_GET(self):
            path = self.path.split("?", 1)[0].lstrip("/")
            snap = re.fullmatch(r"snap/([a-z0-9_]{1,40}\.json)", path)
            if path == "snap/key.txt" and key_file:                # the published viewing key (from the public site)
                body = Path(key_file).read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "text/plain")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            if snap and (score / snap.group(1)).is_file():
                body = (score / snap.group(1)).read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            if ".." in path or not any(path == a or (a.endswith("/") and path.startswith(a)) for a in ALLOW):
                self.send_error(404)
                return
            super().do_GET()

        def do_POST(self):
            n = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(n)
            m = re.fullmatch(r"/frame/([a-z0-9_-]{1,40})/(\d{1,6})", self.path)
            d = re.fullmatch(r"/done/([a-z0-9_-]{1,40})", self.path)
            if m and body.startswith(b"data:image/"):            # a canvas data URL
                body = base64.b64decode(body.split(b",", 1)[1])
            if m:
                out = frames / m.group(1)
                out.mkdir(parents=True, exist_ok=True)
                ext = "png" if body[:4] == b"\x89PNG" else "jpg"
                (out / f"f{int(m.group(2)):05d}.{ext}").write_bytes(body)
            elif d or self.path == "/log":
                print(f"{self.path[1:]}: {body.decode('utf-8', 'replace')}", flush=True)
                if d:
                    (frames / d.group(1)).mkdir(parents=True, exist_ok=True)
                    (frames / d.group(1) / "DONE").write_text(body.decode("utf-8", "replace"))
            else:
                self.send_error(404)
                return
            self.send_response(204)
            self.end_headers()

        def end_headers(self):
            self.send_header("Cache-Control", "no-store")
            super().end_headers()

    return H


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8770)
    ap.add_argument("--snap", required=True, help="directory with the score.json snapshot to render (and facts.json)")
    ap.add_argument("--frames", default=str(ROOT / "logs" / "video" / "frames"), help="frames land in <dir>/<take>/")
    ap.add_argument("--key-file", help="the published viewing key (fetched from the public site), served as /snap/key.txt")
    a = ap.parse_args()
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", a.port), make_handler(Path(a.snap), Path(a.frames), a.key_file))
    print(f"serving on http://127.0.0.1:{a.port}/video/cine.html", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
