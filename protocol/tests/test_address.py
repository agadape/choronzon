"""Bech32m checksum (BIP-350 vectors) and the unified-address sanity check used for embedded reply addresses."""
import pytest

from protocol import address

BIP350_VALID = [  # copied from bip-0350.mediawiki "Test vectors"
    "A1LQFN3A",
    "a1lqfn3a",
    "an83characterlonghumanreadablepartthatcontainsthetheexcludedcharactersbioandnumber11sg7hg6",
    "abcdef1l7aum6echk45nj3s0wdvt2fg8x9yrzpqzd3ryx",
    "11llllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllludsr8",
    "split1checkupstagehandshakeupstreamerranterredcaperredlc445v",
    "?1v759aa",
]
INVALID = [
    "a12uel5l",       # valid Bech32 (BIP-173), not Bech32m
    "A1lqfn3a",       # mixed case
    "qyrz8wqd2c9m",   # no separator
    "1qyrz8wqd2c9m",  # empty HRP
    "y1b0jsk6g",      # 'b' is not in the charset
    "in1muywd",       # checksum too short
    "",
]


@pytest.mark.parametrize("s", BIP350_VALID)
def test_bip350_valid(s):
    assert address.bech32m_decode(s) is not None


@pytest.mark.parametrize("s", INVALID)
def test_invalid(s):
    assert address.bech32m_decode(s) is None


def test_encode_decode_round_trip_without_length_limit():
    data = [i % 32 for i in range(300)]  # ZIP-316 UAs exceed BIP-173's 90 chars
    s = address.bech32m_encode("utest", data)
    assert address.bech32m_decode(s) == ("utest", data)


@pytest.mark.parametrize("hrp,ok", [("u", True), ("zu", True), ("tu", True), ("utest", True), ("zutest", True),
                                    ("tutest", True), ("ztestsapling", False), ("bc", False)])
def test_unified_address_hrps(hrp, ok):
    assert address.is_unified_address(address.bech32m_encode(hrp, [7] * 170)) is ok


def test_single_character_corruption_is_detected():
    s = address.bech32m_encode("zutest", [i % 32 for i in range(170)])
    for pos in range(len("zutest1"), len(s)):
        other = "q" if s[pos] != "q" else "p"
        assert not address.is_unified_address(s[:pos] + other + s[pos + 1:])


def test_none_and_empty_payload():
    assert not address.is_unified_address(None)
    assert not address.is_unified_address(address.bech32m_encode("zutest", []))


def test_address_network_by_hrp():
    from protocol import address_network
    data = [i % 32 for i in range(170)]
    for hrp, net in (("utest", "test"), ("zutest", "test"), ("tutest", "test"), ("u", "main"), ("zu", "main"),
                     ("tu", "main")):
        assert address_network(address.bech32m_encode(hrp, data)) == net, hrp
    assert address_network(address.bech32m_encode("ztestsapling", data)) is None     # not a unified address
    assert address_network("utest1notachecksum") is None and address_network(None) is None
