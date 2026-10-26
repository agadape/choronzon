"""The pending eye's storage (web/pending.js): only {cid, t} is kept (never text or an address), entries expire after
3 days, at most 4, a throwing storage (private mode) never breaks anything, and a snapshot that carries a pending
contrib_id opens it."""
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")
JS = Path(tempfile.mkdtemp()) / "pending.cjs"   # package.json says "type": "module": node reads a .cjs copy
shutil.copyfile(ROOT / "web" / "pending.js", JS)

DRIVER = r"""
const P = require(process.argv[1]);
const mem = () => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, m }; };
const broken = { getItem() { throw new Error("SecurityError"); }, setItem() { throw new Error("QuotaExceeded"); }, removeItem() { throw new Error("x"); } };
const out = {};
const s = mem(), day = 86400000, t0 = 1_800_000_000_000;
P.add(s, 7, t0); P.add(s, 9, t0 + 1000);
out.stored = JSON.parse(s.m[P.KEY]);
out.afterTwoDays = P.load(s, t0 + 2 * day).map((e) => e.cid);
out.afterFourDays = P.load(s, t0 + 4 * day).map((e) => e.cid);
out.keyGone = !(P.KEY in s.m);
const s2 = mem(); for (let i = 0; i < 6; i++) P.add(s2, 100 + i, t0 + i);
out.max = P.load(s2, t0 + 10).map((e) => e.cid);
P.add(s2, 104, t0 + 20); out.readded = P.load(s2, t0 + 30).map((e) => e.cid);
out.removed = P.remove(s2, 103, t0 + 40).map((e) => e.cid);
s2.setItem(P.KEY, "not json"); out.corrupt = P.load(s2, t0);
s2.setItem(P.KEY, JSON.stringify([{ cid: 5, t: t0, text: "secret", addr: "zutest1" }, { cid: -1, t: t0 }, { cid: "x", t: t0 }]));
out.sanitised = P.load(s2, t0);
out.broken = [P.load(broken, t0), P.add(broken, 1, t0), P.remove(broken, 1, t0)];
const rec = P.reconcile([{ cid: 7, t: 0 }, { cid: 9, t: 0 }], [{ contrib_id: 9, tx: "ab" }, { contrib_id: 1, tx: "cd" }]);
out.reconcile = rec;
console.log(JSON.stringify(out));
"""


def test_pending_storage():
    r = json.loads(subprocess.run([NODE, "-e", DRIVER, str(JS)], capture_output=True, text=True, check=True).stdout)
    assert r["stored"] == [{"cid": 7, "t": 1_800_000_000_000}, {"cid": 9, "t": 1_800_000_001_000}]   # cid + time only
    assert r["afterTwoDays"] == [7, 9] and r["afterFourDays"] == [] and r["keyGone"]
    assert r["max"] == [102, 103, 104, 105] and r["readded"] == [102, 103, 105, 104] and r["removed"] == [102, 105, 104]
    assert r["corrupt"] == [] and r["sanitised"] == [{"cid": 5, "t": 1_800_000_000_000}]
    assert r["broken"] == [[], [], []]
    assert r["reconcile"] == {"opened": [{"cid": 9, "tx": "ab"}], "still": [7]}


def test_the_page_never_stores_the_secret_or_an_address():
    src = (ROOT / "web" / "pending.js").read_text() + (ROOT / "web" / "give.js").read_text()
    assert "localStorage" not in (ROOT / "web" / "pending.js").read_text()      # storage is passed in
    assert "Pending.add(" in src and "give_text" not in (ROOT / "web" / "pending.js").read_text()
