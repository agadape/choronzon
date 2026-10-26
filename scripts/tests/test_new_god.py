"""scripts/new_god.sh: makes a god (wallet, key.txt mode 600, watcher, config/) without the chain (a fake devtool),
never echoes the viewing key, is idempotent and refuses to overwrite."""
import json
import os
import stat
import subprocess
import sys
from pathlib import Path

import pytest

from protocol import address

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "new_god.sh"
KEY = "uvftest1" + "q" * 30 + "zx9" * 30
ADDR = address.bech32m_encode("zutest", [(i * 7) % 32 for i in range(170)])

FAKE = r'''#!/usr/bin/env python3
"""Stand-in for bin/devtool-aegis: just enough of `wallet ...` for new_god.py. Logs every call (keys redacted)."""
import os, sys
from pathlib import Path
a = sys.argv[1:]
assert a[0] == "wallet" and a[1] == "-w", a
w, cmd, rest = Path(a[2]), a[3], a[4:]
log = Path(os.environ["FAKE_LOG"])
log.open("a").write(" ".join([cmd] + ["<key>" if x == os.environ["FAKE_KEY"] else x for x in rest]) + "\n")
def opt(name):
    return rest[rest.index(name) + 1]
if cmd == "init":
    w.mkdir(parents=True)
    (w / "data.sqlite").write_text("spend")
    ident = Path(opt("-i"))
    if not ident.exists():
        ident.write_text("AGE-SECRET-KEY-FAKE\n")
elif cmd == "init-fvk":
    w.mkdir(parents=True)
    (w / "data.sqlite").write_text("view")
    (w / "fvk").write_text(opt("--fvk"))
elif cmd == "list-accounts":
    if not (w / "data.sqlite").exists():
        print("no wallet", file=sys.stderr); sys.exit(1)
    key = (w / "fvk").read_text() if (w / "fvk").exists() else os.environ["FAKE_KEY"]
    print("Account 0\n  Uuid: 0b3c1f9e-1111-4222-8333-944455556666\n  Name: x\n"
          f"  UFVK: {key}\n  UIVK: uivtest1zzz\n  Source: derived, birthday height 4600123")
elif cmd == "list-addresses":
    print(f"Account 0\n  Default Address: {os.environ['FAKE_ADDR']}")
elif cmd in ("sync", "enhance"):
    if os.environ.get("FAKE_SYNC_FAIL"):
        print(f"cannot reach the server for {os.environ['FAKE_KEY']}", file=sys.stderr); sys.exit(3)
else:
    print(f"unexpected {cmd}", file=sys.stderr); sys.exit(9)
'''


@pytest.fixture
def env(tmp_path):
    fake = tmp_path / "devtool"
    fake.write_text(FAKE)
    fake.chmod(0o755)
    e = {**os.environ, "FAKE_KEY": KEY, "FAKE_ADDR": ADDR, "FAKE_LOG": str(tmp_path / "calls.log"),
         "LWD_CONNECTION": "direct"}
    e.pop("GOD_CONFIG_DIR", None)

    def run(*args, check=True, **extra):
        r = subprocess.run(["bash", str(SCRIPT), "--gods-dir", str(tmp_path / "gods"), "--devtool", str(fake), *args],
                           cwd=ROOT, capture_output=True, text=True, env={**e, **extra})
        if check:
            assert r.returncode == 0, r.stdout + r.stderr
        return r
    run.gods = tmp_path / "gods"
    run.calls = lambda: (tmp_path / "calls.log").read_text().splitlines()
    return run


def never_echoes_the_key(r):
    text = r.stdout + r.stderr
    assert KEY not in text and "zx9zx9zx9" not in text


def snapshot(d: Path) -> dict:
    return {str(p.relative_to(d)): p.read_bytes() for p in sorted(d.rglob("*")) if p.is_file()}


def test_makes_a_god_without_echoing_the_key(env):
    r = env("--slug", "retro-demo", "--name", "The Retro God", "--tagline", "What the sprint never said.")
    never_echoes_the_key(r)
    g = env.gods / "retro-demo"
    key = g / "key.txt"
    assert key.read_text() == KEY + "\n" and stat.S_IMODE(key.stat().st_mode) == 0o600
    assert stat.S_IMODE(g.stat().st_mode) == 0o700
    assert (g / "god" / "data.sqlite").exists() and (g / "god.age").exists()
    assert (g / "watcher" / "fvk").read_text() == KEY                      # the watcher holds the key alone
    choir = json.loads((g / "config" / "choir.json").read_text())
    assert choir["address"] == ADDR and choir["network"] == "test" and choir["amount_zat"] == 1000
    assert KEY not in (g / "config" / "choir.json").read_text()
    brand = json.loads((g / "config" / "brand.json").read_text())
    assert brand["name"] == "The Retro God" and brand["slug"] == "retro-demo"
    assert brand["tagline"] == "What the sprint never said." and brand["one_liner"] and brand["kiosk_cta"]
    for word in ("anonymous", "untraceable"):                              # CLAUDE.md section 6 wording
        assert word not in json.dumps(brand).lower()
    assert (g / "config" / "skiplist.txt").read_text().startswith("# Flagged offerings")
    calls = env.calls()
    assert calls[0].startswith("init --name god-retro-demo") and "--birthday" not in calls[0]   # current tip
    assert any(c.startswith("init-fvk --name retro-demo-watcher --fvk <key> --birthday 4600123") for c in calls)
    assert "GOD_CONFIG_DIR=" in r.stdout and "build_web.sh" in r.stdout and "renderer once" in r.stdout


def test_rerun_is_idempotent_and_changes_nothing(env):
    env("--slug", "retro-demo", "--name", "The Retro God")
    g = env.gods / "retro-demo"
    before, n = snapshot(g), len(env.calls())
    r = env("--slug", "retro-demo", "--name", "The Retro God")
    never_echoes_the_key(r)
    assert "already there, nothing changed" in r.stdout
    assert snapshot(g) == before
    assert not any(c.startswith(("init ", "init-fvk")) for c in env.calls()[n:])


def test_refuses_another_name_for_the_same_slug(env):
    env("--slug", "retro-demo", "--name", "The Retro God")
    brand = (env.gods / "retro-demo" / "config" / "brand.json").read_bytes()
    r = env("--slug", "retro-demo", "--name", "Someone Else", check=False)
    assert r.returncode != 0 and "refused" in r.stderr
    r = env("--slug", "retro-demo", "--name", "The Retro God", "--tagline", "new words", check=False)
    assert r.returncode != 0 and "refused" in r.stderr
    assert (env.gods / "retro-demo" / "config" / "brand.json").read_bytes() == brand


def test_refuses_a_key_file_that_is_not_this_wallets_key(env):
    env("--slug", "retro-demo", "--name", "The Retro God")
    key = env.gods / "retro-demo" / "key.txt"
    key.write_text("uvftest1somethingelse\n")
    r = env("--slug", "retro-demo", "--name", "The Retro God", check=False)
    assert r.returncode != 0 and "key.txt exists with other content" in r.stderr
    never_echoes_the_key(r)
    assert key.read_text() == "uvftest1somethingelse\n"


def test_refuses_a_half_made_wallet(env):
    (env.gods / "x1" / "god").mkdir(parents=True)          # a dir with no wallet in it
    r = env("--slug", "x1", "--name", "X", check=False)
    assert r.returncode != 0 and "half-made" in r.stderr
    assert not (env.gods / "x1" / "key.txt").exists()


def test_a_failed_sync_is_not_fatal_and_scrubs_the_key(env):
    r = env("--slug", "retro-demo", "--name", "The Retro God", FAKE_SYNC_FAIL="1")
    never_echoes_the_key(r)
    assert "first sync of the watcher failed" in r.stderr


@pytest.mark.parametrize("slug", ["../escape", "Retro", "-x", "x-", "a/b", "", "x" * 41])
def test_rejects_bad_slugs(env, slug):
    r = env("--slug", slug, "--name", "X", check=False)
    assert r.returncode != 0
    assert not env.gods.exists() or not any(env.gods.iterdir())


def test_rejects_multiline_names(env):
    assert env("--slug", "ok", "--name", "a\nb", check=False).returncode != 0


def test_gods_live_under_the_ignored_wallets_dir():
    r = subprocess.run(["git", "check-ignore", "-q", "wallets/gods/retro-demo/config/brand.json"], cwd=ROOT)
    assert r.returncode == 0
    for f in ("scripts/new_god.sh", "scripts/new_god.py"):
        assert os.access(ROOT / f, os.X_OK) or f.endswith(".py"), f


def test_help_runs_without_a_chain():
    r = subprocess.run(["bash", str(SCRIPT), "--help"], cwd=ROOT, capture_output=True, text=True)
    assert r.returncode == 0 and "GOD_CONFIG_DIR" in r.stdout
