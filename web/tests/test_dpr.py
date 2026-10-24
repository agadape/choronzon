"""The god's adaptive resolution (web/dpr.js), driven in node with synthetic frame times: load spikes are ignored,
a steady 60 fps holds or climbs to the cap, sustained slow frames step down but never below the floor, and a level
that was too slow is not retried at once (no thrashing). ?dpr=N pins it."""
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

import pytest

# the repo's package.json says "type": "module", so node reads a .cjs copy (the browser loads dpr.js as a plain script)
DPR_JS = Path(tempfile.mkdtemp()) / "dpr.cjs"
shutil.copyfile(Path(__file__).resolve().parents[1] / "dpr.js", DPR_JS)
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")

# A scenario is a list of [frame_ms, how_long_ms]; the driver plays them back to back from t=0, settling 2.5 s at
# mount like god.js, and records the DPR after every frame.
DRIVER = r"""
const { create, limits } = require(process.argv[1]);   // node -e: the first argument is argv[1]
const sc = JSON.parse(process.argv[2]);
const a = create(limits(sc.ratio, sc.phone, sc.query));
a.settle(0, 2500);
let t = 0; const trace = [];
for (const [dt, dur] of sc.frames) { const end = t + dur; while (t < end) { t += dt; a.frame(t, dt); trace.push([Math.round(t), a.dpr]); } }
console.log(JSON.stringify({ start: create(limits(sc.ratio, sc.phone, sc.query)).dpr, end: a.dpr, min: Math.min(...trace.map((x) => x[1])),
  changes: trace.filter((x, i) => i && x[1] !== trace[i - 1][1]).length, trace: trace.filter((_, i) => i % 30 === 0) }));
"""


def run(frames, ratio=1.25, phone=False, query=None):
    sc = {"ratio": ratio, "phone": phone, "query": query, "frames": frames}
    out = subprocess.run([NODE, "-e", DRIVER, str(DPR_JS), json.dumps(sc)], capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def test_load_spikes_do_not_drop_the_resolution():
    # shader compile + first frames: 400 ms, 120 ms, 80 ms spikes inside the settle window, then a steady 60 fps
    r = run([[400, 400], [120, 600], [80, 800], [16.7, 15000]])
    assert r["start"] == 1.25 and r["min"] == 1.25 and r["end"] == 1.25


def test_starts_at_the_device_ratio_capped():
    assert run([[16.7, 100]], ratio=3)["start"] == 2          # desktop cap
    assert run([[16.7, 100]], ratio=3, phone=True)["start"] == 1.5


def test_sustained_slow_frames_step_down_to_the_floor_not_below():
    r = run([[16.7, 3000], [40, 30000]], ratio=2)
    assert r["end"] == 0.75 and r["min"] == 0.75
    r = run([[16.7, 3000], [60, 30000]], ratio=2, phone=True)
    assert r["end"] == 0.85 and r["min"] == 0.85


def test_one_slow_second_is_not_enough_and_a_single_spike_is_ignored():
    r = run([[16.7, 4000], [30, 600], [16.7, 3000], [250, 250], [16.7, 5000]])
    assert r["min"] == 1.25 and r["changes"] == 0


def test_climbs_back_up_after_a_slow_patch():
    # a slow patch pushes it down; once frames hold vsync again it climbs back to the cap
    r = run([[16.7, 3000], [35, 4000], [16.7, 120000]], ratio=1.25)
    assert r["min"] < 1.25 and r["end"] == 1.25


def test_no_thrash_when_the_top_level_is_just_too_slow():
    # a GPU that holds 60 fps at <=1.0 but drops to 30 fps above it: count every change over two minutes
    driver = DRIVER.replace("for (const [dt, dur] of sc.frames)", "for (const [, dur] of sc.frames)").replace(
        "while (t < end) { t += dt;", "while (t < end) { const dt = a.dpr > 1.001 ? 33 : 16.7; t += dt;")
    sc = {"ratio": 1.5, "phone": False, "query": None, "frames": [[0, 120000]]}
    out = subprocess.run([NODE, "-e", driver, str(DPR_JS), json.dumps(sc)], capture_output=True, text=True, check=True)
    r = json.loads(out.stdout)
    assert r["end"] <= 1.1 + 1e-9
    # 1.5 -> 1.0 in five steps, then retries of 1.1 that are further and further apart (15 s, 30 s, 60 s, ...)
    assert r["changes"] <= 12
    late = [x for x in r["trace"] if x[0] > 70000]
    assert sum(1 for i in range(1, len(late)) if late[i][1] != late[i - 1][1]) <= 2


def test_dpr_query_pins_it():
    r = run([[16.7, 3000], [60, 20000]], query="1.75")
    assert r["start"] == 1.75 and r["end"] == 1.75 and r["changes"] == 0
    assert run([[16.7, 100]], query="9")["start"] == 3 and run([[16.7, 100]], query="0.1")["start"] == 0.25
    assert run([[16.7, 100]], query="abc")["start"] == 1.25
