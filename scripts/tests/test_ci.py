"""The publish-web workflow: schedule, secret handling and pins (docs/auto-publish.md)."""
import re
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github" / "workflows" / "publish-web.yml"
CI_SCRIPTS = sorted((ROOT / "scripts").glob("ci_*.sh"))


@pytest.fixture(scope="module")
def workflow():
    yaml = pytest.importorskip("yaml")
    wf = yaml.safe_load(WORKFLOW.read_text())
    wf["on"] = wf.get("on", wf.get(True))       # YAML 1.1 reads the bare key `on` as True
    return wf


def steps(wf):
    return wf["jobs"]["publish"]["steps"]


def test_triggers_schedule_and_concurrency(workflow):
    assert workflow["on"]["schedule"] == [{"cron": "*/30 * * * *"}]
    assert "workflow_dispatch" in workflow["on"]
    assert workflow["concurrency"]["group"] and workflow["concurrency"]["cancel-in-progress"] is False
    assert workflow["jobs"]["publish"]["runs-on"] == "ubuntu-24.04"
    assert workflow["permissions"] == {"contents": "read"}


def test_secrets_reach_steps_only_through_env(workflow):
    for step in steps(workflow):
        assert "secrets." not in step.get("run", ""), step["name"]
        assert "secrets." not in str(step.get("with", "")), step["name"]
    used = set(re.findall(r"secrets\.([A-Z_]+)", WORKFLOW.read_text()))
    assert used == {"CHOIR_UFVK", "VERCEL_TOKEN"}


def test_key_file_is_private_and_always_deleted(workflow):
    names = [s["name"] for s in steps(workflow)]
    write = steps(workflow)[names.index("Write the key file")]
    assert "umask 077" in write["run"] and "RUNNER_TEMP" in write["run"]
    render = names.index(next(n for n in names if n.startswith("Render from the key")))
    delete = steps(workflow)[render + 1]
    assert delete["name"] == "Delete the key file" and delete["if"] == "always()"
    assert "shred -u" in delete["run"]


def test_no_xtrace_anywhere():
    assert CI_SCRIPTS
    for f in [WORKFLOW, *CI_SCRIPTS]:
        code = "\n".join(line for line in f.read_text().splitlines() if not line.lstrip().startswith("#"))
        assert not re.search(r"set -[a-wyz]*x|set -o xtrace|bash -x", code), f.name


@pytest.mark.skipif(not shutil.which("bash") or not Path("/etc/os-release").exists(), reason="needs Linux")
def test_build_pins_come_from_setup_sh():
    out = subprocess.run(["bash", "scripts/ci_build_tools.sh", "--key"], cwd=ROOT, capture_output=True, text=True,
                         check=True).stdout
    setup = (ROOT / "scripts" / "setup.sh").read_text()
    codec2 = re.search(r"^CODEC2_COMMIT=([0-9a-f]+)$", setup, re.M).group(1)
    devtool = re.search(r"git checkout -q ([0-9a-f]{7,40})", setup).group(1)
    key = re.search(r"^key=(\S+)$", out, re.M).group(1)
    assert f"devtool-{devtool}-" in key and key.endswith(f"codec2-{codec2[:12]}")
    assert re.search(r"^devtool=" + devtool + r"-nu7-[0-9a-f]{16}$", out, re.M)
