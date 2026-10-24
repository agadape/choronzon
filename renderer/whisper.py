"""Whisper Back: a listener replies to one offering, directly, through their own wallet.

The reply address embedded in an offering is public to every key holder (it is in the memo), but the renderer never
persists it: score.json carries only `has_reply`. When a listener presses "whisper back", the address is read again
from the wallet database for that one txid, turned into a ZIP-321 payment request, and shown (QR / URI) so the
listener's wallet can pay it. The reply goes straight to the wallet that owns the reply address and never passes
through the choir: the contributor's own wallet when they gave its address (`kiosk qr --reply`, `kiosk offer
--reply-to`), or, for a kiosk `--reply` offering, the kiosk's session wallet, which the operator holds (and can
read) until the session closes.
"""
from __future__ import annotations

import base64
import io
from dataclasses import dataclass

import protocol

from .wallet import WalletDB

REPLY_AMOUNT_ZAT = 1000  # same fixed amount as an offering: carries no information


@dataclass(frozen=True)
class ReplyTarget:
    txid: str
    contrib_id: int
    address: str


def find_target(db: WalletDB, txid: str, as_of: int | None = None) -> ReplyTarget | None:
    """Re-read the offering's memos and return its reply address, or None if it has no (valid) one."""
    txid = txid.lower()
    for c in db.candidates(as_of if as_of is not None else 2**31):
        if c.txid != txid:
            continue
        if c.own_spend or any(m is None for m in c.memos):
            return None
        try:
            d = protocol.decode_contribution([protocol.normalize_memo(m) for m in c.memos if m.rstrip(b"\0")
                                              not in (b"", b"\xf6")])
        except protocol.ProtocolError:
            return None
        return ReplyTarget(txid, d.contrib_id, d.reply_addr) if d.reply_addr else None
    return None


def reply_memo(contrib_id: int, text: str, phone: bool) -> bytes:
    """Binary kind=2 reply, or the readable GC1R form for phone wallets that show memos as text."""
    if phone:
        return protocol.encode_reply_text(contrib_id, text)
    return protocol.encode_reply(contrib_id, text.encode("utf-8")).rstrip(b"\0")


def reply_uri(target: ReplyTarget, text: str, phone: bool = False) -> str:
    memo = base64.urlsafe_b64encode(reply_memo(target.contrib_id, text, phone)).rstrip(b"=").decode()
    amount = f"{REPLY_AMOUNT_ZAT / 100_000_000:.8f}".rstrip("0")
    return f"zcash:{target.address}?amount={amount}&memo={memo}"


def qr_ascii(data: str) -> str:
    try:
        import qrcode
    except ImportError:
        return "(install python3-qrcode for a QR code)"
    q = qrcode.QRCode(border=1)
    q.add_data(data)
    buf = io.StringIO()
    q.print_ascii(out=buf, invert=True)
    return buf.getvalue()


def qr_png(data: str, path: str) -> None:
    import qrcode
    qrcode.make(data, border=2).save(path)


def qr_svg(data: str) -> str:
    import qrcode
    from qrcode.image.svg import SvgPathImage
    q = qrcode.QRCode(border=2, image_factory=SvgPathImage)
    q.add_data(data)
    buf = io.BytesIO()
    q.make_image().save(buf)
    return buf.getvalue().decode()
