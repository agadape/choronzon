"""Unified Address sanity check: known HRP + Bech32m checksum (BIP-350; ZIP-316 drops Bech32's 90-char limit).

This only proves the string was not corrupted in transit (the v1 CRC does not cover the reply address).
It does not decode receivers (F4Jumble); the sending wallet does that.
"""
from __future__ import annotations

CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
_BECH32M_CONST = 0x2BC830A3
_GEN = (0x3B6A57B2, 0x26508E6D, 0x1EA119FA, 0x3D4233DD, 0x2A1462B3)

# ZIP-316 Revision 0 (u / utest) and Revision 2 (zu = shielded-only, tu = transparent-including), mainnet + testnet.
UA_HRPS = frozenset({"u", "zu", "tu", "utest", "zutest", "tutest"})


def _polymod(values: list[int]) -> int:
    chk = 1
    for v in values:
        top = chk >> 25
        chk = (chk & 0x1FFFFFF) << 5 ^ v
        for i, g in enumerate(_GEN):
            chk ^= g if (top >> i) & 1 else 0
    return chk


def _hrp_expand(hrp: str) -> list[int]:
    return [ord(c) >> 5 for c in hrp] + [0] + [ord(c) & 31 for c in hrp]


def bech32m_decode(s: str) -> tuple[str, list[int]] | None:
    """Return (hrp, 5-bit data without checksum) if `s` is valid Bech32m of any length, else None."""
    if not s or s.lower() != s and s.upper() != s or any(ord(c) < 33 or ord(c) > 126 for c in s):
        return None
    s = s.lower()
    pos = s.rfind("1")
    if pos < 1 or len(s) - pos - 1 < 6:
        return None
    hrp, rest = s[:pos], s[pos + 1:]
    if any(c not in CHARSET for c in rest):
        return None
    data = [CHARSET.index(c) for c in rest]
    if _polymod(_hrp_expand(hrp) + data) != _BECH32M_CONST:
        return None
    return hrp, data[:-6]


def bech32m_encode(hrp: str, data: list[int]) -> str:
    """Encode 5-bit `data` under `hrp` (used by tests and tools; the protocol never builds addresses)."""
    pm = _polymod(_hrp_expand(hrp) + data + [0] * 6) ^ _BECH32M_CONST
    checksum = [(pm >> 5 * (5 - i)) & 31 for i in range(6)]
    return hrp + "1" + "".join(CHARSET[d] for d in data + checksum)


def is_unified_address(s: str | None) -> bool:
    decoded = bech32m_decode(s) if s else None
    return decoded is not None and decoded[0] in UA_HRPS and len(decoded[1]) > 0


def address_network(s: str | None) -> str | None:
    """'test' or 'main' for a valid unified address (by its HRP), None for anything else.

    Not used by the decoder (a mainnet address inside a testnet memo still decodes the same way, score_hash is
    unchanged); the Whisper Back paths use it to refuse a reply address of another network."""
    if not is_unified_address(s):
        return None
    return "test" if bech32m_decode(s)[0].endswith("test") else "main"
