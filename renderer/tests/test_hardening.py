"""Code-review hardening (21 Oct): output writes, subprocess failures as silence, fixed environment."""
import os
from pathlib import Path

import pytest

from renderer.decoder import DecodeError, Decoder
from renderer.render import _atomic_write
from renderer.tts import TTSError, Voice


def test_atomic_write_leaves_no_temp_files(tmp_path):
    target = tmp_path / "score.json"
    _atomic_write(target, b"one")
    _atomic_write(target, b"two")
    assert target.read_bytes() == b"two"
    assert os.listdir(tmp_path) == ["score.json"]


def test_decoder_that_cannot_run_is_a_decode_error(tmp_path):
    fake = tmp_path / "c2dec"
    fake.write_bytes(b"not a program")          # present (the constructor checks that) but not executable
    fake.chmod(0o600)
    with pytest.raises(DecodeError):
        Decoder(fake).decode(1, b"\x00" * 8)


def test_missing_tts_tool_is_a_tts_error(tmp_path):
    v = Voice(Decoder(), espeak=str(tmp_path / "no-such-espeak"))
    with pytest.raises(TTSError):
        v.frames("hello")
