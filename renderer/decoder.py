"""Pinned Codec2 decoder: bin/c2dec, built from codec2 tag 1.2.0 by scripts/setup.sh. Never a system copy.

The decoder's output feeds render_hash, so the renderer also reports a fingerprint (the decoded PCM of three
fixed test vectors). Two laptops with different fingerprints will print different render_hash values while
their score_hash still matches, and the fingerprint says why.
"""
from __future__ import annotations

import hashlib
import os
import subprocess
import tempfile
from pathlib import Path

import protocol

REPO = Path(__file__).resolve().parents[1]
DEFAULT_C2DEC = REPO / "bin" / "c2dec"
CODEC2_TAG = "1.2.0"
_VECTORS = REPO / "renderer" / "testdata"
# sha256 over decoded PCM of vector_700C.c2 || vector_1200.c2 || vector_1300.c2 with the pinned build
# (same value from Ubuntu 24.04's codec2 1.2.0-2build1 package, checked 20 Oct)
EXPECTED_FINGERPRINT = "1e18d05b100938cacb64a3316a358c208c1b08110d6e8c2deb2306cd6b333979"
# a fixed environment for every subprocess: locale or PATH surprises must not change the audio
_ENV = {"PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"), "LC_ALL": "C.UTF-8", "LANG": "C.UTF-8"}


class DecodeError(RuntimeError):
    pass


class Decoder:
    sample_rate = 8000  # c2dec writes signed 16-bit little-endian mono PCM

    def __init__(self, path: str | Path = DEFAULT_C2DEC):
        self.path = Path(path)
        if not self.path.is_file():
            raise FileNotFoundError(f"{self.path} missing: run scripts/setup.sh (builds the pinned codec2)")

    def decode(self, codec: int, frames: bytes) -> bytes:
        mode = protocol.AUDIO_CODECS.get(codec)
        if mode is None:
            raise DecodeError(f"codec {codec} is not audio")
        with tempfile.TemporaryDirectory() as tmp:
            src, dst = Path(tmp, "in.c2"), Path(tmp, "out.raw")
            src.write_bytes(frames)
            try:
                done = subprocess.run([str(self.path), mode, str(src), str(dst)], capture_output=True, timeout=60,
                                      env=_ENV)
            except (subprocess.TimeoutExpired, OSError) as e:    # hung or missing decoder: silence, not a crash
                raise DecodeError(f"c2dec {mode} failed: {type(e).__name__}") from e
            if done.returncode != 0 or not dst.exists():
                raise DecodeError(f"c2dec {mode} failed with exit code {done.returncode}")
            return dst.read_bytes()

    def fingerprint(self) -> str:
        if not hasattr(self, "_fingerprint"):
            h = hashlib.sha256()
            for codec, mode in sorted(protocol.AUDIO_CODECS.items()):
                h.update(self.decode(codec, (_VECTORS / f"vector_{mode}.c2").read_bytes()))
            self._fingerprint = h.hexdigest()
        return self._fingerprint
