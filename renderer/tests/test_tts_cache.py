"""Audit 26 Oct: the voice-pin check must not read its own cache, and the cache must not outlive a tool change.

Before the fix, a warm cache keyed on a hardcoded "1.51" kept reporting voice_matches_pin true with espeak-ng replaced
by /bin/false. Now fingerprint() always runs the tools, and cache keys carry the sha256 of the binaries in use.
"""
import shutil

import pytest

from renderer import tts
from renderer.decoder import DEFAULT_C2DEC, Decoder
from renderer.tts import Voice


def _script(path, body):
    path.write_text("#!/bin/sh\n" + body + "\n")
    path.chmod(0o755)
    return str(path)


def test_toolchain_id_follows_the_binaries_not_a_version_string(tmp_path):
    """Hermetic: fake tools (they fail, so the fingerprint is 'unavailable'); only their bytes differ."""
    c2dec = tmp_path / "bin" / "c2dec"
    c2dec.parent.mkdir()
    _script(c2dec, "exit 1")
    _script(tmp_path / "bin" / "c2enc", "exit 1")
    dec = Decoder(c2dec)
    a = Voice(dec, espeak=_script(tmp_path / "espeak-a", "exit 1"), sox=_script(tmp_path / "sox", "exit 1"))
    a_again = Voice(dec, espeak=str(tmp_path / "espeak-a"), sox=str(tmp_path / "sox"))
    b = Voice(dec, espeak=_script(tmp_path / "espeak-b", "exit 2"), sox=str(tmp_path / "sox"))
    assert a.toolchain_id() == a_again.toolchain_id()
    assert a.toolchain_id() != b.toolchain_id()
    assert a.fingerprint().startswith("unavailable") and a.fingerprint() != tts.EXPECTED_FINGERPRINT


real_tools = pytest.mark.skipif(not DEFAULT_C2DEC.exists() or not shutil.which("espeak-ng") or not shutil.which("sox"),
                                reason="needs bin/c2dec, espeak-ng and sox")


@real_tools
def test_a_broken_espeak_is_reported_even_with_a_warm_cache(tmp_path):
    cache = tmp_path / "cache"
    good = Voice(Decoder(), cache_dir=cache)
    good.frames("it forgets nothing. it asks no names.")     # warm the cache, fingerprint sentence included
    good.frames("a cached offering")
    assert any(cache.iterdir())
    broken = Voice(Decoder(), espeak="/bin/false", cache_dir=cache)
    assert broken.fingerprint() != tts.EXPECTED_FINGERPRINT              # was True through the cache before the fix
    with pytest.raises(tts.TTSError):
        broken.frames("a cached offering")                              # cache miss: the new tool is really run
    assert good.fingerprint() == tts.EXPECTED_FINGERPRINT


@real_tools
def test_the_cache_still_serves_an_unchanged_toolchain(tmp_path, monkeypatch):
    cache = tmp_path / "cache"
    v = Voice(Decoder(), cache_dir=cache)
    first = v.frames("same words, same voice")
    monkeypatch.setattr(Voice, "_run", staticmethod(lambda *a, **k: pytest.fail("cache miss")))
    assert v.frames("same words, same voice") == first


@real_tools
def test_render_reports_the_broken_voice(tmp_path):
    from renderer import render as rnd
    from renderer.wallet import WalletDB

    from .test_renderer import make_wallet, offering, txid
    w = make_wallet(tmp_path, [(txid(1), 10, 1, 0, offering(b"hello"), 0)])
    cache = tmp_path / "cache"
    Voice(Decoder(), cache_dir=cache).frames("hello")
    r = rnd.render(WalletDB(w), 100, Decoder(), voice=Voice(Decoder(), espeak="/bin/false", cache_dir=cache))
    assert r.summary()["voice_matches_pin"] is False
