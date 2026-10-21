"""The god's true name is a pure function of render_hash: a Python port must match web/name.js on fixed vectors."""
import re
import shutil
import subprocess

import pytest

from web.__main__ import REPO

ONSETS = ["", "K", "T", "R", "N", "M", "S", "Z", "ZH", "KH", "TH", "V", "L", "D", "G", "SH"]
NUCLEI = ["A", "E", "I", "O", "U", "AI", "OR", "UN"]
CODAS = ["", "", "N", "R", "TH", "L", "M", "S"]

VECTORS = {  # computed once with node from web/name.js (21 Oct); both implementations must keep matching them
    "8540a0a57d6f80d409d4ed5948789f64e524fc08252a15ea3bd904dd58fa1af5": "NA'THAISUNDU",
    "4b72400946b68f2e7547d4422408a7a2a552196de99f93073b860825972dc136": "ZIE'VORTORL",
    "c46dd5de8b74fecdb38e2b875c98c2f63d097f45f9bc1f667866a35594efe6b4": "SAI'DORZUM",
    "9feeacc34e1c661d8df8e792776f627ee14d2fefa4eb154c49175416c115a725": "GORLO'KUKAIL",
    "0" * 64: "A'AA",
}


def true_name(render_hash: str) -> str:
    if not re.fullmatch(r"[0-9a-fA-F]{64}", render_hash or ""):
        return ""
    b = bytes.fromhex(render_hash)
    count = 3 + (b[0] & 1)
    breath = 1 + ((b[0] >> 1) % (count - 1))
    name = ""
    for i in range(count):
        x, y = b[1 + 2 * i], b[2 + 2 * i]
        syl = ONSETS[x >> 4] + NUCLEI[x & 7]
        if i == count - 1:
            syl += CODAS[y & 7]
        if i == breath:
            name += "'"
        name += syl
    return name


@pytest.mark.parametrize("h,expected", list(VECTORS.items()))
def test_python_port_matches_the_vectors(h, expected):
    assert true_name(h) == expected


def test_shape_and_determinism():
    for h, _ in VECTORS.items():
        n = true_name(h)
        assert n == true_name(h.upper()) and n.count("'") == 1 and n == n.upper()
    assert true_name("zz") == "" and true_name("") == ""
    assert true_name("1" * 64) != true_name("2" * 64)


@pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")
def test_javascript_matches_the_vectors():
    script = ('const fs=require("fs");const m={exports:{}};'
              f'new Function("module","window",fs.readFileSync("{REPO / "web" / "name.js"}","utf8"))(m,undefined);'
              'for (const h of process.argv.slice(1)) console.log(m.exports.trueName(h));')
    out = subprocess.run(["node", "-e", script, *VECTORS], capture_output=True, text=True, check=True).stdout.split()
    assert out == list(VECTORS.values())
