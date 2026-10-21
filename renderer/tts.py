"""Local text-to-speech for text offerings: espeak-ng -> sox (no dither) -> Codec2 700C -> pinned decoder.

Text offerings go through the same Codec2 path as audio offerings, so every voice in the mix is the same ghost.
No cloud, no network. The result feeds render_hash, so the voice is pinned like the decoder:
  * espeak-ng output is deterministic for a given version + voice + speed + pitch (checked 21 Oct, 1.51);
  * sox resampling is deterministic ONLY with dither off (-D): default dither is random noise.
A fingerprint (decoded PCM of a fixed sentence) is reported next to the decoder fingerprint.
"""
from __future__ import annotations

import hashlib
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

import protocol

from .decoder import Decoder

ESPEAK_VERSION = "1.51"          # Ubuntu 24.04 package 1.51+dfsg-12build1
SOX_VERSION = "14.4.2"
VOICE, SPEED, PITCH = "en", 130, 30
MAX_TEXT_BYTES = 1500            # three full memos; anything longer is cut, never silently voiced in full
_FINGERPRINT_SENTENCE = "it forgets nothing. it asks no names."
# decoded PCM of the fingerprint sentence with espeak-ng 1.51, sox 14.4.2 -D, codec2 1.2.0 (21 Oct)
EXPECTED_FINGERPRINT = "1928881a27e5d956f6c75510c4fb2c1ea4670389b101212b41dc1d8c844d0cea"


class TTSError(RuntimeError):
    pass


@dataclass(frozen=True)
class Voice:
    decoder: Decoder
    espeak: str = "espeak-ng"
    sox: str = "sox"
    cache_dir: Path | None = None

    def available(self) -> bool:
        return shutil.which(self.espeak) is not None and shutil.which(self.sox) is not None

    def frames(self, text: str) -> bytes:
        """Codec2 700C frames for `text` (what a kiosk would have sent)."""
        raw = text.encode("utf-8")[:MAX_TEXT_BYTES].decode("utf-8", "ignore")
        key = hashlib.sha256(f"{ESPEAK_VERSION}|{VOICE}|{SPEED}|{PITCH}|".encode() + raw.encode()).hexdigest()
        cached = self.cache_dir / f"{key}.c2" if self.cache_dir else None
        if cached and cached.exists():
            return cached.read_bytes()
        with tempfile.TemporaryDirectory() as tmp:
            wav, pcm, c2 = Path(tmp, "v.wav"), Path(tmp, "v.raw"), Path(tmp, "v.c2")
            self._run([self.espeak, "-v", VOICE, "-s", str(SPEED), "-p", str(PITCH), "-w", str(wav), "--", raw])
            self._run([self.sox, "-D", str(wav), "-r", str(Decoder.sample_rate), "-c", "1", "-b", "16", "-e", "signed",
                       str(pcm)])
            self._run([str(self.decoder.path.with_name("c2enc")), "700C", str(pcm), str(c2)])
            frames = c2.read_bytes()
        if cached:
            cached.parent.mkdir(parents=True, exist_ok=True)
            cached.write_bytes(frames)
        return frames

    def speak(self, text: str) -> bytes:
        """8 kHz int16 mono PCM, decoded by the pinned decoder."""
        return self.decoder.decode(protocol.CODEC_C2_700C, self.frames(text))

    def fingerprint(self) -> str:
        return hashlib.sha256(self.speak(_FINGERPRINT_SENTENCE)).hexdigest()

    @staticmethod
    def _run(cmd: list[str]) -> None:
        done = subprocess.run(cmd, capture_output=True, timeout=120)
        if done.returncode != 0:
            raise TTSError(f"{Path(cmd[0]).name} failed with exit code {done.returncode}")
