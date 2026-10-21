"""Regression against the real testnet corpus. Skipped on a fresh clone (needs wallets/ and the pinned bin/c2dec).

Asserts only counts, reason codes and hashes; never prints memo content or addresses.
"""
import collections

import pytest

import protocol
from renderer import render as rnd
from renderer import tts
from renderer.decoder import DEFAULT_C2DEC, EXPECTED_FINGERPRINT, REPO, Decoder
from renderer.tts import Voice
from renderer.wallet import WalletDB

V, B = REPO / "wallets" / "test" / "V", REPO / "wallets" / "test" / "B"
G6_HEIGHT = 4522002
G6_HASH = "c46dd5de8b74fecdb38e2b875c98c2f63d097f45f9bc1f667866a35594efe6b4"
# score/1 at G6_HEIGHT, first computed 20 Oct; V and B agreed byte-for-byte
SCORE_HASH = "415307933f03fd760f07ae628f0e887bd077e52e07aa6747949d5975ad6ff88a"
# render/1 with composer choir/1 (pinned codec2 1.2.0 + espeak-ng 1.51 voice), 21 Oct; mix.wav identical from V and B
RENDER_HASH = "4b72400946b68f2e7547d4422408a7a2a552196de99f93073b860825972dc136"

needs_decoder = pytest.mark.skipif(not DEFAULT_C2DEC.exists(), reason="bin/c2dec missing (scripts/setup.sh)")
needs_wallets = pytest.mark.skipif(not (V / "data.sqlite").exists() or not (B / "data.sqlite").exists(),
                                   reason="wallets/ not extracted")


@needs_decoder
def test_decoder_fingerprint_matches_the_pin():
    assert Decoder().fingerprint() == EXPECTED_FINGERPRINT


@needs_decoder
def test_voice_fingerprint_matches_the_pin():
    voice = Voice(Decoder())
    if not voice.available():
        pytest.skip("espeak-ng/sox missing")
    assert voice.fingerprint() == tts.EXPECTED_FINGERPRINT


@needs_decoder
def test_audio_round_trip_through_memos_gives_identical_pcm():
    frames = (REPO / "renderer" / "testdata" / "vector_700C.c2").read_bytes()
    _, memos = protocol.encode_contribution(frames, protocol.CODEC_C2_700C)
    back = protocol.decode_contribution([m.rstrip(b"\0") for m in reversed(memos)])
    decoder = Decoder()
    assert decoder.decode(back.codec, back.data) == decoder.decode(protocol.CODEC_C2_700C, frames)


@needs_decoder
@needs_wallets
def test_g6_corpus_from_the_public_key():
    db = WalletDB(V)
    assert not db.has_spend_key()
    decoder = Decoder()
    result = rnd.render(db, G6_HEIGHT, decoder, voice=Voice(decoder))
    assert result.g6_hash == G6_HASH
    assert (len(result.score.offerings), len(result.score.skipped)) == (7, 4)
    assert collections.Counter(s.reason for s in result.score.skipped) == {"not-protocol": 3, "choir-own-spend": 1}
    assert (result.score_hash, result.render_hash) == (SCORE_HASH, RENDER_HASH)


@needs_decoder
@needs_wallets
def test_view_only_and_choir_wallets_render_identically():
    decoder, voice = Decoder(), Voice(Decoder())
    v, b = rnd.render(WalletDB(V), G6_HEIGHT, decoder, voice=voice), rnd.render(WalletDB(B), G6_HEIGHT, decoder, voice=voice)
    assert v.to_json() == b.to_json() and v.mix.wav() == b.mix.wav()
