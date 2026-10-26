"""scripts/demo.sh retry loops (audit 26 Oct, S2): a failed speak/whisper that BUILT a transaction is never resent.

The real loop functions are cut out of demo.sh and run under bash with `python3` stubbed: the stub plays the kiosk /
renderer commands and `kiosk sent-since`, and records every call.
"""
import shutil
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
TXID = "ab" * 32

pytestmark = pytest.mark.skipif(shutil.which("bash") is None, reason="needs bash")


def _loop_functions() -> str:
    lines = (REPO / "scripts" / "demo.sh").read_text(encoding="utf-8").splitlines()
    start = next(i for i, l in enumerate(lines) if l.startswith("ATTEMPTS="))
    end = next(i for i, l in enumerate(lines) if l.startswith("hashes(){"))
    return "\n".join(lines[start:end])


STUB = r'''
set -uo pipefail
V=wallets/test/V; L=wallets/test/L; B=wallets/test/B
python3(){
  echo "$*" >> "$STATE/calls"
  case "$*" in
    "-m kiosk sent-since "*" --after "*)
      if [ -f "$STATE/built" ]; then echo "built txid $(cat "$STATE/built") not mined yet"; return 0; fi
      echo "nothing built since the marker"; return 3 ;;
    "-m kiosk sent-since "*) echo 41 ;;
    "-m kiosk speak "*|"-m renderer whisper "*)
      cat >/dev/null
      if [ "$MODE" = ok ]; then echo "whisper sent directly to the offering's reply address. txid $TXID"; echo "sent. txid $TXID"; return 0; fi
      [ "$MODE" = built ] && echo "$TXID" > "$STATE/built"
      echo "devtool pay exit 1: peer closed connection without sending TLS close_notify"; return 1 ;;
  esac
}
'''


def run(tmp_path, mode, call):
    script = STUB + _loop_functions() + "\nPAUSES=(0 0 0)\n" + call + "\necho \"rc=$?\"\n"
    done = subprocess.run(["bash", "-c", script], capture_output=True, text=True, timeout=60,
                          env={"PATH": "/usr/bin:/bin", "STATE": str(tmp_path), "MODE": mode, "TXID": TXID})
    calls = (tmp_path / "calls").read_text().splitlines() if (tmp_path / "calls").exists() else []
    sends = [c for c in calls if c.startswith(("-m kiosk speak", "-m renderer whisper"))]
    return done.stdout, done.stderr, calls, sends


@pytest.mark.parametrize("call,kind", [("speak_retry 'we are many.' $B", "speak"),
                                       ("speak_retry 'i am the god.' $A --forge", "speak"),
                                       ("whisper_retry " + "cd" * 32, "whisper")])
def test_a_failed_send_that_built_a_transaction_is_not_resent(tmp_path, call, kind):
    out, err, calls, sends = run(tmp_path, "built", call.replace("$A", "wallets/test/A"))
    assert len(sends) == 1, calls                       # the old loop sent 4 times here
    assert f"txid {TXID}" in out and "rc=0" in out      # demo.sh greps the txid and goes on to wait_seen
    assert "NOT retried" in err
    assert any("--after 41" in c for c in calls)        # asked with the marker taken before the attempt


def test_a_failed_send_that_built_nothing_is_retried(tmp_path):
    out, err, calls, sends = run(tmp_path, "nothing", "speak_retry 'x' $B")
    assert len(sends) == 4 and "rc=1" in out
    assert all("--from wallets/test/B" in s for s in sends)


def test_a_successful_send_is_sent_once(tmp_path):
    out, _, calls, sends = run(tmp_path, "ok", "speak_retry 'x' $B")
    assert len(sends) == 1 and f"txid {TXID}" in out and "rc=0" in out
    assert not any("--after" in c for c in calls)


def test_bash_syntax_of_both_scripts():
    for name in ("demo.sh", "smoke.sh"):
        assert subprocess.run(["bash", "-n", str(REPO / "scripts" / name)]).returncode == 0, name


def test_smoke_syncs_over_tor_by_default_with_same_route_retries():
    src = (REPO / "scripts" / "smoke.sh").read_text(encoding="utf-8")
    assert 'LWD_CONNECTION="${LWD_CONNECTION:-tor}"' in src
    for line in src.splitlines():
        if "devtool-aegis" in line and (" sync " in line or " enhance " in line):
            assert '--connection "$LWD_CONNECTION"' in line, line
    assert "for i in 1 2 3" in src
    # the node probe opens a direct connection: only with LWD_CONNECTION=direct
    probe = [i for i, l in enumerate(src.splitlines()) if "s1_lightd.mjs" in l]
    assert probe and all('[ "$LWD_CONNECTION" = direct ]' in src.splitlines()[i - 1] for i in probe)
