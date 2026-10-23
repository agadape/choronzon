"""The `anchors` branch: an append-only, content-addressed archive of every stamped statement and its proof.

A new deploy replaces the whole static site, so proofs live here too. Written with git plumbing only
(hash-object, mktree, commit-tree, push): the working tree and the checked-out branch are never touched, so this is
safe in a shared checkout. Layout (flat): README.md, <height>-<sha256(statement)[:16]>.json and the same name + .ots.
Files are only ever added; a proof is only ever replaced by an upgraded proof for the same statement.
"""
from __future__ import annotations

import hashlib
import subprocess
from typing import Callable

from . import REPO, name_for

BRANCH = "anchors"
WORKDIR = REPO          # the repository whose object store and remotes are used (tests point it elsewhere)

README = b"""# anchors

Append-only archive of the work's published states, each stamped in Bitcoin with OpenTimestamps.
Written by the `publish-web` and `anchor-upgrade` workflows (and `python3 -m anchor persist` from a laptop) on
the default branch; nothing here is ever rewritten. `<height>-<id>.json` is a canonical statement (hashes,
versions, counts, one height: nothing private); `<height>-<id>.json.ots` is its OpenTimestamps proof.

Verify one (no Bitcoin node needed; checks the header against two public explorers):

    python3 -m anchor verify <height>-<id>.json

or drop both files on https://opentimestamps.org, or run `ots verify <height>-<id>.json.ots` with a Bitcoin node.
This proves that the statement existed no later than the block it is anchored in. It hides nothing and does not
prove that the chain data behind the hashes is complete. How and why: docs/anchoring.md on the default branch.
"""


class BranchError(RuntimeError):
    pass


def _git(*args: str, data: bytes | None = None, check: bool = True) -> subprocess.CompletedProcess:
    r = subprocess.run(["git", *args], cwd=WORKDIR, input=data, capture_output=True, timeout=120)
    if check and r.returncode != 0:
        raise BranchError(f"git {args[0]} failed: {r.stderr.decode(errors='replace').strip()[-300:]}")
    return r


def fetch(remote: str, branch: str = BRANCH) -> str | None:
    """Tip of remote/branch after a fetch, or None when the branch does not exist yet."""
    heads = _git("ls-remote", "--heads", remote, branch).stdout.decode().strip()
    if not heads:
        return None
    _git("fetch", "--quiet", "--no-tags", remote, f"+refs/heads/{branch}:refs/remotes/{remote}/{branch}")
    return _git("rev-parse", f"refs/remotes/{remote}/{branch}").stdout.decode().strip()


def files_at(commit: str | None) -> dict[str, str]:
    """name -> blob sha of the (flat) tree at commit."""
    if commit is None:
        return {}
    out = {}
    for entry in _git("ls-tree", "-z", commit).stdout.split(b"\0"):
        if entry:
            meta, name = entry.split(b"\t", 1)
            mode, kind, sha = meta.decode().split()
            if kind == "blob":
                out[name.decode()] = sha
    return out


def blob(sha: str) -> bytes:
    return _git("cat-file", "blob", sha).stdout


def write_blob(data: bytes) -> str:
    return _git("hash-object", "-w", "--stdin", data=data).stdout.decode().strip()


def _commit(files: dict[str, str], parent: str | None, message: str) -> str:
    listing = "".join(f"100644 blob {sha}\t{name}\n" for name, sha in sorted(files.items())).encode()
    tree = _git("mktree", data=listing).stdout.decode().strip()
    args = ["commit-tree", tree, "-m", message] + (["-p", parent] if parent else [])
    return _git(*args).stdout.decode().strip()


def update(change: Callable[[dict[str, str]], dict[str, str] | None], message: str, remote: str = "origin",
           push: bool = True, attempts: int = 3, log=print) -> str | None:
    """Apply change(files) on top of remote/anchors and push (fast-forward only, retried if someone pushed first).

    change() returns the new name -> blob map, or None for "nothing to do". Returns the new commit or None."""
    for attempt in range(1, attempts + 1):
        parent = fetch(remote)
        files = files_at(parent)
        new = change(dict(files))
        if new is None:
            return None
        removed = set(files) - set(new)
        if removed:
            raise BranchError(f"refusing to remove {sorted(removed)} from the append-only {BRANCH} branch")
        new.setdefault("README.md", write_blob(README))
        commit = _commit(new, parent, message)
        if not push:
            return commit
        r = _git("push", "--quiet", remote, f"{commit}:refs/heads/{BRANCH}", check=False)
        if r.returncode == 0:
            return commit
        log(f"push to {remote}/{BRANCH} rejected (attempt {attempt}): {r.stderr.decode(errors='replace').strip()[-200:]}")
    raise BranchError(f"could not push to {remote}/{BRANCH} after {attempts} attempts")


def add_statement(statement: bytes, proof: bytes | None) -> Callable[[dict[str, str]], dict[str, str] | None]:
    """A change() that adds a statement (and its proof, if it has none yet); never replaces anything."""
    name = name_for(statement)

    def change(files: dict[str, str]) -> dict[str, str] | None:
        changed = False
        if name in files:
            if hashlib.sha256(blob(files[name])).digest() != hashlib.sha256(statement).digest():
                raise BranchError(f"{name} exists with other content")
        else:
            files[name] = write_blob(statement)
            changed = True
        if proof is not None and name + ".ots" not in files:
            files[name + ".ots"] = write_blob(proof)
            changed = True
        return files if changed else None

    return change
