#!/usr/bin/env python3
"""Stand up a new god for your own community: scripts/new_god.sh --slug <slug> --name "<name>" [--tagline "..."]

A god is a Zcash testnet address whose full viewing key is published. It cannot learn who wrote to it, and it cannot
hide what it received: anyone holding the key re-renders every offering to the same hash, and sees the silenced ones
with their reasons. This script makes one, next to the main god and without touching it:

  wallets/gods/<slug>/god/ + god.age     the god's own wallet (spend key; the .age file decrypts its mnemonic)
  wallets/gods/<slug>/key.txt            its full viewing key, mode 600 (publish it on purpose; never printed here)
  wallets/gods/<slug>/watcher/           a view-only wallet made from that key alone (what every listener has)
  wallets/gods/<slug>/config/            choir.json (address + fixed amount), brand.json (name, tagline,
                                         one-liner), skiplist.txt: point GOD_CONFIG_DIR here
  wallets/gods/<slug>/out/               where its renders go

Everything lives under wallets/, which git ignores: the god belongs to its community, not to this repo. Its
address and key are public by design; its config holds nothing private, so a community that forks this repo can
copy config/ into its fork (or keep pointing GOD_CONFIG_DIR at it).

Idempotent: rerun with the same arguments and it finishes a half-made god or, when everything is there, changes
nothing. It refuses to overwrite: other name/tagline, a key.txt that is not this wallet's key, a half-made wallet
it cannot read. Testnet only. The key goes to key.txt and to the devtool's `init-fvk` argument (as in
`renderer summon`), never to this terminal or a log.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO))

import protocol  # noqa: E402
from kiosk.devtool import DEFAULT_DEVTOOL, Devtool, DevtoolError  # noqa: E402
from renderer import network  # noqa: E402

SLUG = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$")
UFVK = re.compile(r"uv[a-z]*1[0-9a-z]{20,}")
AMOUNT_ZAT = 1000          # the same fixed amount as the main god: amounts carry no information
NETWORK = "test"
SKIPLIST_HEADER = """\
# Flagged offerings: the reference renderer skips these txids. They stay on chain and are listed in
# score.json under "skipped" with reason "flagged"; nothing else is reordered or edited.
# One txid per line in explorer (display) byte order; put the reason after "#". Example:
# 0000000000000000000000000000000000000000000000000000000000000000  # reason
"""


class Refused(SystemExit):
    def __init__(self, msg: str):
        super().__init__(f"new_god: refused: {msg}")


def scrub(text: str, key: str | None = None) -> str:
    """Anything shaped like a viewing key out of a message (a devtool error could echo its argument)."""
    if key:
        text = text.replace(key, "<key>")
    return UFVK.sub("<key>", text)


def rel(p: Path) -> str:
    try:
        return str(p.resolve().relative_to(REPO))
    except ValueError:
        return str(p)


def brand_doc(slug: str, name: str, tagline: str | None, repo_url: str = "") -> dict:
    return {
        "name": name,
        "slug": slug,
        "tagline": tagline or "It asks no names. It forgets nothing it is given.",
        "one_liner": (f"{name} is a box made of Zcash shielded transactions: it cannot learn who wrote to it, and it "
                      f"cannot hide what it received. Anyone holding its published key hears every offering and "
                      f"re-renders it to the same hash."),
        "kiosk_cta": "Give it a secret. It does not ask your name.",
        # where this god's code lives, for the page's source link; empty: the page links no repository
        "repo_url": repo_url,
    }


def write_new(path: Path, text: str, mode: int = 0o644) -> bool:
    """Create `path` with `text`; never overwrite. Returns False when it already held exactly that text."""
    if path.exists():
        if path.read_text(encoding="utf-8") != text:
            raise Refused(f"{rel(path)} exists with other content; not overwriting it")
        return False
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(text)
    os.chmod(path, mode)
    return True


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="scripts/new_god.sh", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--slug", required=True, help="lowercase letters, digits, dashes (e.g. retro-demo)")
    p.add_argument("--name", required=True, help="display name on its page and kiosk")
    p.add_argument("--tagline", help="one line under the name")
    p.add_argument("--repo-url", default="", help="https URL of your fork, shown as the page's source link "
                   "(default: none)")
    p.add_argument("--gods-dir", default=str(REPO / "wallets" / "gods"), help=argparse.SUPPRESS)  # tests
    p.add_argument("--devtool", default=str(DEFAULT_DEVTOOL), help="the patched zcash-devtool (bin/devtool-aegis)")
    p.add_argument("--server", default="zecrocks")
    p.add_argument("--tor-cache-from", help="copy the public Tor directory cache from this warm wallet dir")
    network.add_argument(p)
    a = p.parse_args(argv)

    if not SLUG.match(a.slug):
        p.error("--slug: 1-40 lowercase letters, digits or dashes, not starting or ending with a dash")
    name, tagline = a.name.strip(), (a.tagline.strip() if a.tagline else None)
    if not name or len(name) > 60 or any(c in name for c in "\r\n\t"):
        p.error("--name: one line, 1-60 characters")
    if tagline is not None and (len(tagline) > 120 or any(c in tagline for c in "\r\n\t")):
        p.error("--tagline: one line, at most 120 characters")
    try:
        os.environ[network.ENV] = network.resolve(a.connection)
    except ValueError as e:
        p.error(str(e))

    base = Path(a.gods_dir) / a.slug
    cfg, out = base / "config", base / "out"
    god_dir, identity, watcher_dir, key_file = base / "god", base / "god.age", base / "watcher", base / "key.txt"
    if a.repo_url and not re.match(r"^https://[^\s\"<>]+$", a.repo_url):
        p.error("--repo-url: an https:// URL")
    brand = brand_doc(a.slug, name, tagline, a.repo_url)

    # same god, other words: refuse before anything runs
    if (cfg / "brand.json").exists():
        old = json.loads((cfg / "brand.json").read_text(encoding="utf-8"))
        if old.get("name") != name or (tagline is not None and old.get("tagline") != tagline):
            raise Refused(f"{rel(cfg / 'brand.json')} already names this god differently; edit that file by hand "
                          f"if you mean to rename it, or pick another --slug")
        brand = old

    created = []
    old_umask = os.umask(0o077)
    key = None
    try:
        base.mkdir(parents=True, exist_ok=True)
        os.chmod(base, 0o700)
        kw = dict(binary=Path(a.devtool), server=a.server)
        god = Devtool(god_dir, identity, **kw)

        # 1. the god's wallet: new mnemonic, its own age identity, birthday = current chain height
        if god_dir.exists():
            try:
                key, birthday = god.full_viewing_key()
            except DevtoolError:
                raise Refused(f"{rel(god_dir)} exists but holds no readable wallet (a half-made init?). Nothing "
                              f"can have been sent to it yet: look at it, delete it and {identity.name}, and rerun")
        else:
            if a.tor_cache_from and os.environ[network.ENV] == "tor":
                from kiosk.session import seed_tor_cache
                seed_tor_cache(Path(a.tor_cache_from), god_dir)
            print(f"creating the god's wallet in {rel(god_dir)} (birthday: the current chain height)")
            god.init(f"god-{a.slug}")
            created.append(rel(god_dir))
            key, birthday = god.full_viewing_key()
        address = god.default_address()
        if not (protocol.is_unified_address(address) and address.startswith("zutest1")):
            raise Refused("the god's default address is not a shielded-only testnet address (zutest1...)")

        # 2. the key, for whoever will publish it: mode 600, never printed
        if write_new(key_file, key + "\n", 0o600):
            created.append(rel(key_file))
        os.chmod(key_file, 0o600)

        # 3. a Watcher from the key alone: what any listener builds (renderer summon does the same)
        if watcher_dir.exists():
            try:
                wkey, _ = Devtool(watcher_dir, **kw).full_viewing_key()
            except DevtoolError:
                raise Refused(f"{rel(watcher_dir)} exists but holds no readable wallet; it is view-only and "
                              f"holds nothing private: delete it and rerun")
            if wkey != key:
                raise Refused(f"{rel(watcher_dir)} watches another key than this god's; delete it and rerun")
        else:
            if a.tor_cache_from and os.environ[network.ENV] == "tor":
                from kiosk.session import seed_tor_cache
                seed_tor_cache(Path(a.tor_cache_from), watcher_dir)
            print(f"creating the view-only watcher in {rel(watcher_dir)} from the key alone")
            Devtool(watcher_dir, **kw)._run("init-fvk", "--name", f"{a.slug}-watcher", "--fvk", key,
                                            "--birthday", str(birthday), "-s", a.server)
            created.append(rel(watcher_dir))
            try:
                wkey, _ = Devtool(watcher_dir, **kw).full_viewing_key()
                if wkey != key:
                    raise Refused("the watcher does not hold the god's key")
            except DevtoolError:
                pass   # a view-only wallet that lists no UFVK: the render below is the real check

        # 4. the god's config: what GOD_CONFIG_DIR points at
        cfg.mkdir(exist_ok=True)
        out.mkdir(exist_ok=True)
        os.chmod(cfg, 0o755)
        choir = {"network": NETWORK, "address": address, "amount_zat": AMOUNT_ZAT,
                 "note": "Public destination of every offering (this god's wallet). Its full viewing key is "
                         "published separately (key.txt next to this directory), never in a repo."}
        if (cfg / "choir.json").exists():
            if json.loads((cfg / "choir.json").read_text(encoding="utf-8")).get("address") != address:
                raise Refused(f"{rel(cfg / 'choir.json')} names another address than this god's wallet")
        # brand.json was checked above and skiplist.txt is the community's to edit: existing ones are left alone
        for fname, text in (("choir.json", json.dumps(choir, indent=2) + "\n"),
                            ("brand.json", json.dumps(brand, indent=2, ensure_ascii=False) + "\n"),
                            ("skiplist.txt", SKIPLIST_HEADER)):
            if not (cfg / fname).exists() and write_new(cfg / fname, text, 0o644):
                created.append(rel(cfg / fname))

        # 5. first sync of the watcher (from its birthday: seconds). Not fatal: `renderer once --sync` retries it.
        try:
            w = Devtool(watcher_dir, **kw)
            w.sync()
            w.enhance()
        except DevtoolError as e:
            print(f"!! first sync of the watcher failed ({scrub(str(e), key)}); `renderer once --sync` below "
                  f"does it again", file=sys.stderr)
    except DevtoolError as e:
        raise SystemExit(f"new_god: {scrub(str(e), key)}") from None
    finally:
        os.umask(old_umask)

    g, c = rel(base), rel(cfg)
    env = f"GOD_CONFIG_DIR={c}"
    print()
    print(f"{brand['name']}: {'made' if created else 'already there, nothing changed'}"
          + (f" ({len(created)} new: {', '.join(created)})" if created else ""))
    print(f"  birthday height {birthday}; network testnet; fixed offering {AMOUNT_ZAT} zat")
    print(f"  its address is in {c}/choir.json; its full viewing key is in {g}/key.txt (mode 600, not shown)")
    print(f"""
next steps (from the repo root):
  render it (the watcher holds only the key; GOD_CONFIG_DIR gives the renderer this god's skiplist):
    {env} python3 -m renderer once --wallet {g}/watcher --sync --out {g}/out
  give it an offering (a phone wallet scans the QR; the text is typed at the prompt):
    {env} python3 -m kiosk qr --png {g}/out/give.png
  or run a kiosk (an ephemeral session wallet funded from your own wallet):
    {env} python3 -m kiosk session open --pool <your funded testnet wallet dir>
    {env} python3 -m kiosk offer
  serve its page locally:
    {env} python3 -m web --port 8765 --out {g}/out --wallet {g}/watcher --key-file {g}/key.txt --birthday {birthday}
  build a static site (the key goes to key.txt on the site: publishing it is the point, and irrevocable):
    {env} scripts/build_web.sh --out {g}/out --dist {g}/dist --key-file {g}/key.txt --birthday {birthday}
  deploy {g}/dist/ to your own static host, e.g.:
    npx vercel deploy {g}/dist --prod      (or netlify deploy --dir, GitHub Pages, any web server)
  nothing refreshes it for you: after new offerings, render, build and upload again
  one kiosk session per machine, whichever god (wallets/kiosk/current/): close one before opening another
  anyone else hears it from the key alone:
    python3 -m renderer summon --key-file key.txt --birthday {birthday} --wallet wallets/watcher
walkthrough: docs/your-own-god.md""")
    return 0


if __name__ == "__main__":
    sys.exit(main())
