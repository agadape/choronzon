"""Tor by default: every devtool call that reaches lightwalletd carries `--connection`, and a failure never retries
direct. No devtool, no network: subprocess.run is replaced by a recorder."""
from __future__ import annotations

import re
import subprocess
from pathlib import Path

import pytest

from kiosk import devtool
from renderer import network
from renderer.wallet import sync_and_enhance

REPO = Path(__file__).resolve().parents[2]
TXID = "ab" * 32
UUID = "8bdf96d0-b2a6-4da9-8ecd-daf338dbba6e"
UA = "utest1" + "q" * 100


class Recorder:
    """Stands in for subprocess.run; answers each devtool subcommand with a plausible line."""

    def __init__(self, returncode: int = 0, stderr: str = ""):
        self.calls: list[list[str]] = []
        self.returncode, self.stderr = returncode, stderr

    def __call__(self, cmd, *a, **k):
        self.calls.append([str(c) for c in cmd])
        sub = cmd[4]
        out = {"list-accounts": f"Account {UUID} (birthday height 4502962)\n",
               "generate-address": f"Address: {UA}\n", "list-addresses": f"     Default Address: {UA}\n",
               "pay": f"{TXID}\n", "send": f"{TXID}\n"}.get(sub, "")

        class Done:
            returncode, stdout = self.returncode, out
            stderr = self.stderr if k.get("text") else self.stderr.encode()
        return Done()

    def subcommands(self) -> list[tuple[str, str | None]]:
        """(subcommand, value after --connection or None) for every call."""
        return [(c[4], c[c.index("--connection") + 1] if "--connection" in c else None) for c in self.calls]


@pytest.fixture
def rec(monkeypatch):
    monkeypatch.delenv(network.ENV, raising=False)
    monkeypatch.delenv("GITHUB_ACTIONS", raising=False)
    r = Recorder()
    monkeypatch.setattr(subprocess, "run", r)
    return r


# --- the setting ---------------------------------------------------------------------------------------------------

def test_default_is_tor():
    assert network.default_connection({}) == "tor"
    assert network.DEFAULT == "tor"


def test_env_overrides_default():
    assert network.default_connection({network.ENV: "direct"}) == "direct"
    assert network.default_connection({network.ENV: " TOR "}) == "tor"


def test_github_runner_defaults_to_direct_but_env_wins():
    assert network.default_connection({"GITHUB_ACTIONS": "true"}) == "direct"
    assert network.default_connection({"GITHUB_ACTIONS": "true", network.ENV: "tor"}) == "tor"


def test_unknown_value_is_refused_not_guessed():
    for bad in ("socks5://127.0.0.1:9050", "off", "yes"):
        with pytest.raises(ValueError):
            network.default_connection({network.ENV: bad})
    with pytest.raises(ValueError):
        network.args_for("sync", "torr")


def test_only_network_commands_get_the_flag():
    for sub in ("sync", "enhance", "send", "pay", "init", "init-fvk"):
        assert network.args_for(sub, "tor") == ["--connection", "tor"]
    for sub in ("list-accounts", "list-addresses", "balance", "generate-address", "list-tx"):
        assert network.args_for(sub, "tor") == []


# --- kiosk wrapper -------------------------------------------------------------------------------------------------

def test_devtool_defaults_to_tor_on_every_network_call(rec, tmp_path):
    w = devtool.Devtool(tmp_path / "w", tmp_path / "w.age")
    assert w.connection == "tor"
    w.sync()
    w.enhance()
    w.init("kiosk-session", birthday=4500000)
    w.pay("zcash:?address=x&amount=0.00001")
    w.send(UA, 1000, "memo")
    w.generate_address()
    w.spendable_zat()
    for sub, conn in rec.subcommands():
        if sub in network.NETWORK_COMMANDS:
            assert conn == "tor", (sub, conn)
        else:
            assert conn is None, (sub, conn)
    assert {s for s, _ in rec.subcommands()} >= {"sync", "enhance", "init", "pay", "send", "list-accounts", "balance"}


def test_devtool_reads_env_and_explicit_direct(rec, tmp_path, monkeypatch):
    monkeypatch.setenv(network.ENV, "direct")
    devtool.Devtool(tmp_path).sync()
    devtool.Devtool(tmp_path, connection="tor").sync()
    assert rec.subcommands() == [("sync", "direct"), ("sync", "tor")]


def test_tor_failure_fails_closed_with_a_hint(monkeypatch, tmp_path):
    monkeypatch.delenv(network.ENV, raising=False)
    monkeypatch.delenv("GITHUB_ACTIONS", raising=False)
    r = Recorder(returncode=1, stderr="Error: tor bootstrap failed (to " + UA + ")")
    monkeypatch.setattr(subprocess, "run", r)
    with pytest.raises(devtool.DevtoolError) as e:
        devtool.Devtool(tmp_path).sync()
    msg = str(e.value)
    assert "--connection direct" in msg and "IP" in msg and UA not in msg
    assert r.subcommands() == [("sync", "tor")]          # exactly one attempt, never a silent direct retry


def test_timeout_is_an_error_with_the_hint(monkeypatch, tmp_path):
    monkeypatch.delenv(network.ENV, raising=False)

    def hang(cmd, *a, **k):
        raise subprocess.TimeoutExpired(cmd, k.get("timeout"))
    monkeypatch.setattr(subprocess, "run", hang)
    with pytest.raises(devtool.DevtoolError, match="--connection direct"):
        devtool.Devtool(tmp_path, connection="tor").enhance()


def test_session_offer_goes_over_tor(rec, tmp_path, monkeypatch):
    from kiosk import session as sess
    from kiosk.offering import Choir
    s = sess.Session(tmp_path)
    monkeypatch.setattr(sess, "make_offering", lambda text, voice, reply: type(
        "O", (), {"memos": [b"\xff" + b"G" * 20], "contrib_id": 7})())
    monkeypatch.setattr(sess, "payment_uri", lambda choir, memos: "zcash:?address=x&amount=0.00001")
    s.offer("a secret", None, Choir.load(), want_reply=True)
    subs = rec.subcommands()
    assert ("sync", "tor") in subs and ("pay", "tor") in subs
    assert all(c == "tor" for sub, c in subs if sub in network.NETWORK_COMMANDS)


def test_session_seeds_only_the_public_tor_cache(tmp_path):
    from kiosk.session import seed_tor_cache
    src, dst = tmp_path / "pool", tmp_path / "session" / "wallet"
    (src / "tor" / "arti-cache").mkdir(parents=True)
    (src / "tor" / "arti-cache" / "dir.sqlite3").write_text("consensus")
    (src / "tor" / "arti-cache" / "dir.lock").write_text("")
    (src / "tor" / "arti-data" / "state").mkdir(parents=True)
    (src / "tor" / "arti-data" / "state" / "guards.json").write_text("{}")
    assert seed_tor_cache(src, dst)
    assert (dst / "tor" / "arti-cache" / "dir.sqlite3").read_text() == "consensus"
    assert not (dst / "tor" / "arti-cache" / "dir.lock").exists()
    assert not (dst / "tor" / "arti-data").exists()            # guards are never shared between wallets
    assert not seed_tor_cache(src, dst)                         # never overwrites an existing cache
    assert not seed_tor_cache(tmp_path / "cold", tmp_path / "x")  # nothing to copy from a cold wallet


# --- renderer sync helper ------------------------------------------------------------------------------------------

def test_renderer_sync_defaults_to_tor(rec, tmp_path):
    sync_and_enhance("devtool", tmp_path)
    assert rec.subcommands() == [("sync", "tor"), ("enhance", "tor")]


def test_renderer_sync_explicit_and_github_runner(rec, tmp_path, monkeypatch):
    sync_and_enhance("devtool", tmp_path, connection="direct")
    monkeypatch.setenv("GITHUB_ACTIONS", "true")          # the scheduled publisher (scripts/ci_render.sh)
    sync_and_enhance("devtool", tmp_path)
    assert rec.subcommands() == [("sync", "direct"), ("enhance", "direct"), ("sync", "direct"), ("enhance", "direct")]


def test_renderer_sync_tor_failure_fails_closed(monkeypatch, tmp_path):
    monkeypatch.delenv(network.ENV, raising=False)
    monkeypatch.delenv("GITHUB_ACTIONS", raising=False)
    r = Recorder(returncode=1, stderr="Error: tor: unable to bootstrap")
    monkeypatch.setattr(subprocess, "run", r)
    with pytest.raises(RuntimeError, match="--connection direct"):
        sync_and_enhance("devtool", tmp_path, pause=0)
    assert r.subcommands() == [("sync", "tor")] * 3      # retried on the same route, never direct; enhance not run


def test_renderer_sync_resumes_after_a_broken_circuit(monkeypatch, tmp_path):
    monkeypatch.delenv(network.ENV, raising=False)
    monkeypatch.delenv("GITHUB_ACTIONS", raising=False)
    r = Recorder()
    outcomes = iter([1, 0, 0])            # sync breaks once ("stream closed because of a broken pipe"), then works

    def flaky(cmd, *a, **k):
        r.returncode = next(outcomes)
        return r(cmd, *a, **k)
    monkeypatch.setattr(subprocess, "run", flaky)
    sync_and_enhance("devtool", tmp_path, pause=0)
    assert r.subcommands() == [("sync", "tor"), ("sync", "tor"), ("enhance", "tor")]


# --- CLIs ----------------------------------------------------------------------------------------------------------

def test_renderer_cli_resolves_connection(monkeypatch):
    import renderer.__main__ as cli
    seen = []
    monkeypatch.setattr(cli, "cmd_once", lambda args: seen.append(args.connection))
    monkeypatch.delenv(network.ENV, raising=False)
    monkeypatch.delenv("GITHUB_ACTIONS", raising=False)
    cli.main(["once", "--wallet", "w"])
    cli.main(["once", "--wallet", "w", "--connection", "direct"])
    monkeypatch.setenv(network.ENV, "direct")
    cli.main(["once", "--wallet", "w"])
    assert seen == ["tor", "direct", "direct"]
    for name in ("daemon", "whisper", "summon"):
        with pytest.raises(SystemExit):            # argparse rejects anything but tor/direct for every subcommand
            cli.main([name, "--wallet", "w", "--connection", "socks5://x"])


def test_kiosk_cli_sets_one_setting_for_the_process(monkeypatch):
    import os
    import kiosk.__main__ as cli
    monkeypatch.setenv(network.ENV, "tor")                 # restored after the test
    monkeypatch.setattr(cli.Session, "current", classmethod(lambda c: None))
    with pytest.raises(SystemExit):
        cli.main(["inbox", "--connection", "direct"])
    assert os.environ[network.ENV] == "direct"
    monkeypatch.delenv(network.ENV)
    with pytest.raises(SystemExit):
        cli.main(["inbox"])
    assert os.environ[network.ENV] == "tor"


def test_no_other_path_starts_the_devtool():
    """Only the two wrappers spawn the devtool, so the flag cannot be skipped by a new call site."""
    spawners = set()
    for path in [*REPO.glob("kiosk/*.py"), *REPO.glob("renderer/*.py"), *REPO.glob("web/*.py")]:
        if re.search(r"subprocess\.(run|Popen|call|check_output|check_call)\(", path.read_text()):
            spawners.add(path.relative_to(REPO).as_posix())
    # tts.py and decoder.py run espeak-ng / sox / c2dec, which never touch the network
    assert spawners == {"kiosk/devtool.py", "renderer/wallet.py", "renderer/tts.py", "renderer/decoder.py"}
