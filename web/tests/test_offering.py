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
ZU_TEST = bech32m_encode("zutest", [(i * 11) % 32 for i in range(90)])
UA_MAIN = bech32m_encode("u", [(i * 5) % 32 for i in range(120)])

VECTORS = [
    ("i never told her", None, 0),
    ("I lied about the fire.", None, 0xFFFFFFFF),
    ("a secret with ünïcödé, emoji 🜏 and 漢字", None, 2339178536),
    ("tell me you heard this", UA_TEST, 123456789),
    ("short", ZU_TEST, 42),
    ("x" * 340, None, 7),            # exactly near the one-memo edge
    ("long secret " * 60, None, 99),  # several memos
    ("long secret with a reply " * 20, UA_TEST, 31337),
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


def test_reply_address_checks_match_the_kiosk():
    r = js("const O = require(process.argv[1]); const out = {};"
           "for (const [k, a] of Object.entries(JSON.parse(process.argv[2]))) { try { O.checkReplyTo(a, 'test'); out[k] = 'ok'; } catch (e) { out[k] = e.message; } }"
           "console.log(JSON.stringify(out))",
           json.dumps({"ua": UA_TEST, "zu": ZU_TEST, "main": UA_MAIN, "typo": UA_TEST[:-1] + ("q" if UA_TEST[-1] != "q" else "p"),
                       "junk": "hello", "empty": ""}))
    assert r["ua"] == "ok" and r["zu"] == "ok"
    assert "not a testnet address" in r["main"]
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
