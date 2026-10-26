"""Local text-to-speech for text offerings: espeak-ng -> sox (no dither) -> Codec2 700C -> pinned decoder.

Text offerings go through the same Codec2 path as audio offerings, so every voice in the mix is the same ghost.
No cloud, no network. The result feeds render_hash, so the voice is pinned like the decoder:
  * espeak-ng output is deterministic for a given version + voice + speed + pitch (checked 21 Oct, 1.51);
  * sox resampling is deterministic ONLY with dither off (-D): default dither is random noise.
A fingerprint (decoded PCM of a fixed sentence) is reported next to the decoder fingerprint. It is always computed
fresh, never from the cache. The cache (renderer only; the kiosk has none) is keyed on the sha256 of the espeak-ng,
sox and c2enc binaries in use, the voice params and the fresh fingerprint (which also covers their shared
libraries), so a changed tool can never be served from an old cache entry.
"""
from __future__ import annotations

import hashlib
import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

import protocol

from .decoder import _ENV, DecodeError, Decoder

ESPEAK_VERSION = "1.51"          # Ubuntu 24.04 package 1.51+dfsg-12build1 (reported in score.json only)
SOX_VERSION = "14.4.2"
VOICE, SPEED, PITCH = "en", 130, 30
MAX_TEXT_BYTES = 1500            # three full memos; anything longer is cut, never silently voiced in full
_FINGERPRINT_SENTENCE = "it forgets nothing. it asks no names."
# decoded PCM of the fingerprint sentence with espeak-ng 1.51, sox 14.4.2 -D, codec2 1.2.0 (21 Oct)
EXPECTED_FINGERPRINT = "1928881a27e5d956f6c75510c4fb2c1ea4670389b101212b41dc1d8c844d0cea"


class TTSError(RuntimeError):
    pass


_DIGESTS: dict[tuple, str] = {}
_TOOLCHAIN_IDS: dict[tuple, str] = {}


def _file_sig(tool: str | Path) -> tuple:
    """(real path, size, mtime, inode) of a tool on PATH or by path; ('missing', name) when it is not there."""
    found = shutil.which(str(tool))
    if not found:
        return ("missing", str(tool))
    real = os.path.realpath(found)
    st = os.stat(real)
    return (real, st.st_size, st.st_mtime_ns, st.st_ino)


def _digest(sig: tuple) -> str:
    """sha256 of one binary, memoized by its stat signature (a replaced file gets a new signature)."""
    if sig[0] == "missing":
        return "missing"
    if sig not in _DIGESTS:
        h = hashlib.sha256()
        with open(sig[0], "rb") as f:
            for block in iter(lambda: f.read(1 << 20), b""):
                h.update(block)
        _DIGESTS[sig] = h.hexdigest()
    return _DIGESTS[sig]


@dataclass(frozen=True)
class Voice:
    decoder: Decoder
    espeak: str = "espeak-ng"
    sox: str = "sox"
    cache_dir: Path | None = None

    def available(self) -> bool:
        return shutil.which(self.espeak) is not None and shutil.which(self.sox) is not None

    def _c2enc(self) -> Path:
        return self.decoder.path.with_name("c2enc")

    def toolchain_id(self) -> str:
        """What the cache is keyed on: the binaries in use (sha256), the voice params and a fresh fingerprint.

        Memoized per process by the binaries' stat signatures, so a replaced espeak-ng/sox/c2enc/c2dec gets a new
        id (and a cache miss) without rehashing every binary for every offering.
        """
        sigs = tuple(_file_sig(t) for t in (self.espeak, self.sox, self._c2enc(), self.decoder.path))
        if sigs not in _TOOLCHAIN_IDS:
            parts = [f"espeak-ng={_digest(sigs[0])}", f"sox={_digest(sigs[1])}", f"c2enc={_digest(sigs[2])}",
                     f"c2dec={_digest(sigs[3])}", f"voice={VOICE},{SPEED},{PITCH}", f"fingerprint={self.fingerprint()}"]
            _TOOLCHAIN_IDS[sigs] = hashlib.sha256("|".join(parts).encode()).hexdigest()
        return _TOOLCHAIN_IDS[sigs]

    def frames(self, text: str, use_cache: bool = True) -> bytes:
        """Codec2 700C frames for `text` (what a kiosk would have sent)."""
        raw = text.encode("utf-8")[:MAX_TEXT_BYTES].decode("utf-8", "ignore")
        # one line: control characters become spaces (espeak reads newlines differently on stdin vs argv)
        raw = "".join(" " if ch < " " or ch == "\x7f" else ch for ch in raw)
        cached = None
        if self.cache_dir and use_cache:
            key = hashlib.sha256(f"{self.toolchain_id()}|".encode() + raw.encode()).hexdigest()
            cached = self.cache_dir / f"{key}.c2"
            if cached.exists():
                return cached.read_bytes()
        with tempfile.TemporaryDirectory() as tmp:
            wav, pcm, c2 = Path(tmp, "v.wav"), Path(tmp, "v.raw"), Path(tmp, "v.c2")
            # text goes in on stdin, never on the command line (argv is visible to every process on the machine).
            # The trailing newline matters: without it espeak-ng renders the last clause differently from argv
            # input (checked 21 Oct, 1.51); with it, stdin and argv give byte-identical audio.
            self._run([self.espeak, "-v", VOICE, "-s", str(SPEED), "-p", str(PITCH), "-w", str(wav), "--stdin"],
                      stdin=raw + "\n")
            self._run([self.sox, "-D", str(wav), "-r", str(Decoder.sample_rate), "-c", "1", "-b", "16", "-e", "signed",
                       str(pcm)])
            self._run([str(self.decoder.path.with_name("c2enc")), "700C", str(pcm), str(c2)])
            frames = c2.read_bytes()
        if cached:
            cached.parent.mkdir(parents=True, exist_ok=True)
            fd, tmp = tempfile.mkstemp(dir=cached.parent, prefix=".c2.", suffix=".tmp")
            with os.fdopen(fd, "wb") as f:
                f.write(frames)
            os.replace(tmp, cached)        # atomic: a reader never sees a half-written cache entry
        return frames

    def speak(self, text: str, use_cache: bool = True) -> bytes:
        """8 kHz int16 mono PCM, decoded by the pinned decoder."""
        return self.decoder.decode(protocol.CODEC_C2_700C, self.frames(text, use_cache))

    def fingerprint(self) -> str:
        """sha256 of the fixed sentence through the tools as they are now: never read from the cache.

        A broken tool gives a non-matching value ('unavailable: …'), so the render reports voice_matches_pin false
        (each text offering then renders as silence, as before) instead of crashing.
        """
        try:
            return hashlib.sha256(self.speak(_FINGERPRINT_SENTENCE, use_cache=False)).hexdigest()
        except (TTSError, DecodeError) as e:
            return f"unavailable: {e}"

    @staticmethod
    def _run(cmd: list[str], stdin: str | None = None) -> None:
        try:
            done = subprocess.run(cmd, input=stdin.encode("utf-8") if stdin is not None else None,
                                  capture_output=True, timeout=120, env=_ENV)
        except (subprocess.TimeoutExpired, OSError) as e:    # hung or missing tool: silence for this offering
            raise TTSError(f"{Path(cmd[0]).name} failed: {type(e).__name__}") from e
        if done.returncode != 0:
            raise TTSError(f"{Path(cmd[0]).name} failed with exit code {done.returncode}")
