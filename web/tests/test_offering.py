"""Golden vectors: the public page's "give it a secret" (web/offering.js) builds the same ZIP-321 URI as
`python3 -m kiosk qr` (text codec, v1 header, GC1: envelope, choir address and amount from config/choir.json),
byte for byte, for fixed contrib_ids. Also the reply-address checks and the one-memo budget."""
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

import pytest

import protocol
from kiosk.offering import Choir, make_offering, payment_uri
from protocol.address import bech32m_encode

ROOT = Path(__file__).resolve().parents[2]
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")
# the repo's package.json says "type": "module": node reads a .cjs copy (the browser loads offering.js as a script)
JS = Path(tempfile.mkdtemp()) / "offering.cjs"
shutil.copyfile(ROOT / "web" / "offering.js", JS)
CHOIR = json.loads((ROOT / "config" / "choir.json").read_text())

# valid-checksum test addresses (made here; not anyone's wallet)
UA_TEST = bech32m_encode("utest", [(i * 7) % 32 for i in range(120)])
TU_TEST = bech32m_encode("tutest", [(i * 3) % 32 for i in range(120)])
ZU_TEST = bech32m_encode("zutest", [(i * 11) % 32 for i in range(90)])
ZU_TEST2 = bech32m_encode("zutest", [(i * 13) % 32 for i in range(110)])
UA_MAIN = bech32m_encode("u", [(i * 5) % 32 for i in range(120)])
ZU_MAIN = bech32m_encode("zu", [(i * 5) % 32 for i in range(90)])

VECTORS = [
    ("i never told her", None, 0),
    ("I lied about the fire.", None, 0xFFFFFFFF),
    ("a secret with ünïcödé, emoji 🜏 and 漢字", None, 2339178536),
    ("tell me you heard this", ZU_TEST2, 123456789),
    ("short", ZU_TEST, 42),
    ("x" * 340, None, 7),            # exactly near the one-memo edge
    ("long secret " * 60, None, 99),  # several memos
    ("long secret with a reply " * 20, ZU_TEST2, 31337),
]


def js(script: str, *args):
    out = subprocess.run([NODE, "-e", script, str(JS), *args], capture_output=True, text=True)
    if out.returncode:
        raise AssertionError(out.stderr[-2000:])
    return json.loads(out.stdout)


@pytest.mark.parametrize("text, reply, cid", VECTORS)
def test_uri_matches_kiosk_qr_byte_for_byte(text, reply, cid):
    # kiosk qr reads the secret with read_text(), which strips it; the page trims it the same way
    o = make_offering(text.strip(), None, reply, contrib_id=cid, as_text=True, phone=True)
    want = payment_uri(Choir.load(), o.memos)
    got = js("const O = require(process.argv[1]); const c = JSON.parse(process.argv[2]);"
             "console.log(JSON.stringify(O.makeOffering(c, process.argv[3], process.argv[4] || null, Number(process.argv[5]))))",
             json.dumps(CHOIR), text, reply or "", str(cid))
    assert got["uri"] == want
    assert got["chunks"] == len(o.memos) and got["hasReply"] == (reply is not None)
    # and what a renderer reads back is the same offering
    memos = [protocol.normalize_memo(m.encode()) for m in got["memos"]]
    decoded = protocol.decode_contribution(memos)
    assert decoded.contrib_id == cid and decoded.data.decode() == text.strip() and decoded.reply_addr == (reply or None)


@pytest.mark.parametrize("text, cid", [("I am the god. Kneel.", 1), ("the false prophet speaks with ünïcödé", 0xFFFFFFFF),
                                       ("a long false line " * 30, 777)])
def test_false_prophet_matches_the_python_conductor_encoder(text, cid):
    # the reference: protocol.encode_conductor's bytes (kind 3, no reply), in the phone envelope, paid to the choir
    from protocol import envelope as env
    from protocol import memo as wire
    _, binary = wire.encode_contribution(text.strip().encode(), wire.CODEC_TEXT, None, cid,
                                         body_cap=env.ASCII_BINARY_CAP - wire.HEADER_SIZE, kind=wire.KIND_CONDUCTOR)
    want = payment_uri(Choir.load(), [env.to_ascii_memo(m) for m in binary])
    got = js("const O = require(process.argv[1]); const c = JSON.parse(process.argv[2]);"
             "console.log(JSON.stringify(O.makeOffering(c, process.argv[3], null, Number(process.argv[4]), { asGod: true })))",
             json.dumps(CHOIR), text, str(cid))
    assert got["uri"] == want and got["asGod"] is True and got["hasReply"] is False
    decoded = protocol.decode_contribution([protocol.normalize_memo(m.encode()) for m in got["memos"]])
    assert decoded.kind == wire.KIND_CONDUCTOR and decoded.contrib_id == cid and decoded.reply_addr is None
    if len(binary) == 1:   # encode_conductor chunks at the full 500-byte cap, so only one-memo lines are byte-identical
        assert binary == wire.encode_conductor(text.strip().encode(), wire.CODEC_TEXT, cid)[1]


def test_false_prophet_carries_no_reply_address():
    r = js("const O = require(process.argv[1]); const c = JSON.parse(process.argv[2]);"
           "try { O.makeOffering(c, 'I am the god', process.argv[3], 5, { asGod: true }); console.log(JSON.stringify('accepted')); }"
           "catch (e) { console.log(JSON.stringify(e.message)); }", json.dumps(CHOIR), ZU_TEST)
    assert r == "a line in the god's voice carries no reply address"


def test_reply_address_checks_match_the_kiosk():
    r = js("const O = require(process.argv[1]); const out = {};"
           "for (const [k, a] of Object.entries(JSON.parse(process.argv[2]))) { try { O.checkReplyTo(a, 'test'); out[k] = 'ok'; } catch (e) { out[k] = e.message; } }"
           "console.log(JSON.stringify(out))",
           json.dumps({"ua": UA_TEST, "tu": TU_TEST, "zu": ZU_TEST, "zu2": ZU_TEST2, "main": UA_MAIN, "zumain": ZU_MAIN,
                       "typo": ZU_TEST[:-1] + ("q" if ZU_TEST[-1] != "q" else "p"), "junk": "hello", "empty": ""}))
    assert r["zu"] == "ok" and r["zu2"] == "ok"
    # u/utest and tu/tutest can carry a transparent receiver every key holder would see: refused, with the reason
    transparent = ("this address may contain a transparent receiver that every key holder would see; "
                   "use a shielded-only address (zutest1…) or leave it empty")
    assert r["ua"] == transparent and r["tu"] == transparent
    assert "not a testnet address" in r["main"] and "not a testnet address" in r["zumain"]
    assert "does not parse" in r["typo"] and "does not parse" in r["junk"] and "does not parse" in r["empty"]


def test_one_memo_budget_and_limits():
    r = js("const O = require(process.argv[1]); const c = JSON.parse(process.argv[2]); const room = O.oneMemoRoom(0);"
           "const fits = O.makeOffering(c, 'a'.repeat(room), null, 1).chunks, over = O.makeOffering(c, 'a'.repeat(room + 1), null, 1).chunks;"
           "let tooLong = ''; try { O.makeOffering(c, 'a'.repeat(1200), null, 1); } catch (e) { tooLong = e.message; }"
           "let empty = ''; try { O.makeOffering(c, '   ', null, 1); } catch (e) { empty = e.message; }"
           "console.log(JSON.stringify({ room, fits, over, tooLong, empty, zec: O.zatToZec(1000) }))", json.dumps(CHOIR))
    assert r["room"] == 363 and r["fits"] == 1 and r["over"] == 2
    assert "too long" in r["tooLong"] and "nothing to give" in r["empty"] and r["zec"] == "0.00001"


def test_contrib_id_comes_from_the_csprng_not_math_random():
    src = (ROOT / "web" / "offering.js").read_text()
    assert "getRandomValues" in src and "Math.random" not in src
