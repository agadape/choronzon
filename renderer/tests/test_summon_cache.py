"""summon --tor-cache-from: copies only the public Tor directory cache into the new Watcher, before init-fvk."""
from pathlib import Path

from renderer import __main__ as cli


def _args(tmp, **kw):
    a = cli.main.__globals__["argparse"].Namespace(
        key_file=None, wallet=str(tmp / "w"), birthday=1, server="zecrocks", connection="tor", devtool="x",
        tor_cache_from=str(tmp / "warm"), as_of="tip", out="", skiplist="", c2dec="")
    vars(a).update(kw)
    return a


def test_cache_is_seeded_before_init_and_guards_are_not(tmp_path, monkeypatch):
    warm = tmp_path / "warm" / "tor"
    (warm / "arti-cache").mkdir(parents=True)
    (warm / "arti-cache" / "consensus").write_text("c")
    (warm / "arti-data").mkdir()
    (warm / "arti-data" / "guards.json").write_text("g")
    seen = {}

    class FakeDevtool:
        def __init__(self, wallet_dir, **kw):
            self.wallet_dir = Path(wallet_dir)

        def _run(self, *argv):
            seen["cache_at_init"] = (self.wallet_dir / "tor" / "arti-cache" / "consensus").exists()

    monkeypatch.setenv("SUMMON_KEY", "uvftest1example")
    monkeypatch.setattr("kiosk.devtool.Devtool", FakeDevtool)
    monkeypatch.setattr(cli, "sync_and_enhance", lambda *a, **k: None)
    monkeypatch.setattr(cli, "cmd_once", lambda a: None)
    cli.cmd_summon(_args(tmp_path))
    assert seen["cache_at_init"] is True
    assert not (tmp_path / "w" / "tor" / "arti-data").exists()


def test_no_copy_over_direct(tmp_path, monkeypatch):
    (tmp_path / "warm" / "tor" / "arti-cache").mkdir(parents=True)

    class FakeDevtool:
        def __init__(self, wallet_dir, **kw):
            pass

        def _run(self, *argv):
            pass

    monkeypatch.setenv("SUMMON_KEY", "uvftest1example")
    monkeypatch.setattr("kiosk.devtool.Devtool", FakeDevtool)
    monkeypatch.setattr(cli, "sync_and_enhance", lambda *a, **k: None)
    monkeypatch.setattr(cli, "cmd_once", lambda a: None)
    cli.cmd_summon(_args(tmp_path, connection="direct"))
    assert not (tmp_path / "w" / "tor").exists()
