"""Verify in the browser (web/verify.js): recomputing render_hash with WebCrypto from out/mix.wav, the score_hash and
the composer version gives the renderer's render_hash (renderer/hashes.py), against the real out/ files when they are
there and against a small synthetic render always. A changed sample or composer version must not match."""
import hashlib
import io
import json
import shutil
import subprocess
import tempfile
import wave
from pathlib import Path

import pytest

from renderer.hashes import render_hash

ROOT = Path(__file__).resolve().parents[2]
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")
JS = Path(tempfile.mkdtemp()) / "verify.cjs"   # package.json says "type": "module": node reads a .cjs copy
shutil.copyfile(ROOT / "web" / "verify.js", JS)

DRIVER = r"""
const V = require(process.argv[1]), fs = require("fs"), { webcrypto } = require("crypto");
const [wavPath, scoreHash, composer] = process.argv.slice(2);
V.renderHash(fs.readFileSync(wavPath), scoreHash, composer, webcrypto.subtle).then((h) => console.log(h), (e) => { console.error(e.message); process.exit(1); });
"""


def js_render_hash(wav_path: Path, score_hash: str, composer: str) -> str:
    out = subprocess.run([NODE, "-e", DRIVER, str(JS), str(wav_path), score_hash, composer], capture_output=True, text=True)
    assert out.returncode == 0, out.stderr
    return out.stdout.strip()


def make_wav(pcm: bytes, extra_chunk: bool = False) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(8000); w.writeframes(pcm)
    data = buf.getvalue()
    if extra_chunk:   # a LIST chunk before "data": the parser must walk chunks, not assume offset 44
        riff, rest = data[:12], data[12:]
        fmt_end = 8 + int.from_bytes(rest[4:8], "little")
        lst = b"LIST" + (5).to_bytes(4, "little") + b"INFO!" + b"\0"
        body = rest[:fmt_end] + lst + rest[fmt_end:]
        data = b"RIFF" + (4 + len(body)).to_bytes(4, "little") + b"WAVE" + body
    return data


@pytest.mark.parametrize("extra_chunk", [False, True])
def test_matches_the_renderer_on_a_synthetic_render(tmp_path, extra_chunk):
    pcm = bytes(range(256)) * 40
    score_hash = hashlib.sha256(b"a score").hexdigest()
    path = tmp_path / "mix.wav"
    path.write_bytes(make_wav(pcm, extra_chunk))
    assert js_render_hash(path, score_hash, "choir/2") == render_hash(score_hash, pcm, "choir/2")
    # one changed sample, or another composer, gives another hash
    path.write_bytes(make_wav(pcm[:-1] + b"\x01", extra_chunk))
    assert js_render_hash(path, score_hash, "choir/2") != render_hash(score_hash, pcm, "choir/2")
    path.write_bytes(make_wav(pcm, extra_chunk))
    assert js_render_hash(path, score_hash, "choir/3") != render_hash(score_hash, pcm, "choir/2")


@pytest.mark.skipif(not (ROOT / "out" / "score.json").exists() or not (ROOT / "out" / "mix.wav").exists(),
                    reason="no render in out/ (python3 -m renderer once ...)")
def test_matches_the_real_render_in_out():
    doc = json.loads((ROOT / "out" / "score.json").read_text())
    assert js_render_hash(ROOT / "out" / "mix.wav", doc["score_hash"], doc["render"]["composer"]) == doc["render_hash"]
