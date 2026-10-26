"""Whisper Back: reply address read on demand from the wallet DB, reply request as ZIP-321, nothing persisted."""
import base64

import pytest

import protocol
from protocol import address
from renderer import whisper
from renderer.wallet import WalletDB

from .test_renderer import make_wallet, offering, txid

REPLY = address.bech32m_encode("zutest", [i % 32 for i in range(170)])


def test_find_target_reads_the_address_from_the_db(tmp_path):
    w = make_wallet(tmp_path, [(txid(1), 10, 1, 0, offering(b"with reply", cid=77, reply=REPLY), 0),
                               (txid(2), 10, 2, 0, offering(b"without"), 0),
                               (txid(3), 10, 3, 0, offering(b"own", reply=REPLY), 1)])
    db = WalletDB(w)
    t = whisper.find_target(db, txid(1).upper())
    assert t == whisper.ReplyTarget(txid(1), 77, REPLY)
    assert whisper.find_target(db, txid(2)) is None       # no reply address
    assert whisper.find_target(db, txid(3)) is None       # choir's own spend
    assert whisper.find_target(db, txid(9)) is None       # unknown


MAINNET_REPLY = address.bech32m_encode("u", [i % 32 for i in range(170)])


def test_a_reply_address_of_another_network_is_no_target(tmp_path):
    """Audit 26 Oct: a mainnet u1… inside a testnet offering decodes (score_hash unchanged) but must never become a
    Whisper Back QR: a listener's mainnet wallet would pay real ZEC."""
    w = make_wallet(tmp_path, [(txid(1), 10, 1, 0, offering(b"mainnet reply", cid=5, reply=MAINNET_REPLY), 0),
                               (txid(2), 10, 2, 0, offering(b"testnet reply", cid=6, reply=REPLY), 0)])
    db = WalletDB(w)
    assert protocol.decode_contribution([offering(b"mainnet reply", cid=5, reply=MAINNET_REPLY)]).reply_addr         == MAINNET_REPLY                                    # the decoder (score_hash) is untouched
    assert whisper.configured_network() == "test"
    assert whisper.find_target(db, txid(1)) is None
    assert whisper.find_target(db, txid(2)).address == REPLY
    assert whisper.find_target(db, txid(1), network="main").address == MAINNET_REPLY
    assert whisper.find_target(db, txid(2), network="main") is None
    with pytest.raises(ValueError):
        whisper.reply_uri(whisper.ReplyTarget(txid(1), 5, MAINNET_REPLY), "x")


def test_reply_uri_binary_and_phone():
    t = whisper.ReplyTarget(txid(1), 77, REPLY)
    uri = whisper.reply_uri(t, "you are not alone.")
    assert uri.startswith(f"zcash:{REPLY}?amount=0.00001&memo=")
    memo = base64.urlsafe_b64decode(uri.split("memo=")[1] + "==")
    assert protocol.decode_reply(memo) == protocol.Reply(77, protocol.CODEC_TEXT, b"you are not alone.")
    phone = base64.urlsafe_b64decode(whisper.reply_uri(t, "hi", phone=True).split("memo=")[1] + "==")
    assert phone == b"GC1R:77:hi"


def test_qr_round_trip_text():
    uri = whisper.reply_uri(whisper.ReplyTarget(txid(1), 1, REPLY), "x")
    svg = whisper.qr_svg(uri)
    assert svg.lstrip().startswith("<?xml") or svg.lstrip().startswith("<svg")
    assert "<path" in svg
    assert "█" in whisper.qr_ascii(uri) or "▀" in whisper.qr_ascii(uri)
