"""Bitcoin anchoring of the work's published states (OpenTimestamps). Integrity, not privacy: see docs/anchoring.md.

The statement (`anchor.json`) is a tiny canonical JSON file built deterministically from a render's
`out/score.json`, the skiplist and the repo commit. It holds hashes, versions, counts and one height: nothing
private (no viewing key, no address, no memo content, no txid). Stamping it with OpenTimestamps proves that this
exact statement existed no later than a given Bitcoin block, so we, the operator, cannot later pretend a different
render (other order, other skiplist) was the one we published at that height.

This module is stdlib only; stamping, upgrading and verifying need the OpenTimestamps client (anchor/ots.py).
"""
from __future__ import annotations

import hashlib
import json
import re
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
STATEMENT_VERSION = "anchor/1"
NETWORKS = {"test": "zcash-testnet", "main": "zcash-mainnet"}

# Every field the statement may carry, and nothing else. Adding one is a STATEMENT_VERSION bump.
FIELDS = ("statement", "network", "as_of_height", "score_hash", "score_hash_version", "render_hash",
          "render_hash_version", "composer", "decoder_fingerprint", "voice_fingerprint", "g6_hash", "offerings",
          "skipped", "skiplist_sha256", "repo_commit")

_HEX64 = re.compile(r"^[0-9a-f]{64}$")
_VERSION = re.compile(r"^[a-z0-9]+/[0-9]+$")
_COMMIT = re.compile(r"^([0-9a-f]{40}|unknown)$")


class StatementError(ValueError):
    pass


def repo_commit(cwd: Path = REPO) -> str:
    """The checked-out commit, or 'unknown' outside a git checkout."""
    try:
        out = subprocess.run(["git", "rev-parse", "HEAD"], cwd=cwd, capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.SubprocessError):
        return "unknown"
    sha = out.stdout.strip()
    return sha if out.returncode == 0 and _COMMIT.match(sha) else "unknown"


def network_name(choir_config: Path = REPO / "config" / "choir.json") -> str:
    net = json.loads(choir_config.read_text())["network"]   # only this field is read: the file also holds an address
    if net not in NETWORKS:
        raise StatementError(f"unknown network {net!r} in {choir_config}")
    return NETWORKS[net]


def build(score: dict, skiplist: bytes, commit: str, network: str) -> dict:
    """The statement as a dict, from a parsed score.json. Copies named fields only and validates every value."""
    try:
        render = score["render"]
        doc = {
            "statement": STATEMENT_VERSION,
            "network": network,
            "as_of_height": score["score"]["as_of_height"],
            "score_hash": score["score_hash"],
            "score_hash_version": score["score_hash_version"],
            "render_hash": score["render_hash"],
            "render_hash_version": score["render_hash_version"],
            "composer": render["composer"],
            "decoder_fingerprint": render["decoder"]["fingerprint"],
            "voice_fingerprint": render["voice"]["fingerprint"],
            "g6_hash": score["regression"]["g6_hash"],
            "offerings": len(score["score"]["offerings"]),
            "skipped": len(score["score"]["skipped"]),
            "skiplist_sha256": hashlib.sha256(skiplist).hexdigest(),
            "repo_commit": commit,
        }
    except (KeyError, TypeError) as e:
        raise StatementError(f"score.json lacks {e}") from None
    check(doc)
    return doc


def check(doc: dict) -> None:
    """Refuse anything but the fixed fields with well-formed values (so nothing else can ever be stamped)."""
    if tuple(sorted(doc)) != tuple(sorted(FIELDS)):
        raise StatementError(f"fields differ from {FIELDS}: {sorted(set(doc) ^ set(FIELDS))}")
    for k in ("score_hash", "render_hash", "decoder_fingerprint", "voice_fingerprint", "g6_hash", "skiplist_sha256"):
        if not isinstance(doc[k], str) or not _HEX64.match(doc[k]):
            raise StatementError(f"{k} is not 64 lowercase hex characters")
    for k in ("statement", "score_hash_version", "render_hash_version", "composer"):
        if not isinstance(doc[k], str) or not _VERSION.match(doc[k]):
            raise StatementError(f"{k} is not a version tag like 'score/1'")
    for k in ("as_of_height", "offerings", "skipped"):
        if type(doc[k]) is not int or doc[k] < 0:
            raise StatementError(f"{k} is not a non-negative integer")
    if doc["network"] not in NETWORKS.values():
        raise StatementError(f"network {doc['network']!r} is not one of {sorted(NETWORKS.values())}")
    if not isinstance(doc["repo_commit"], str) or not _COMMIT.match(doc["repo_commit"]):
        raise StatementError("repo_commit is not a 40-character commit hash (or 'unknown')")


def canonical(doc: dict) -> bytes:
    """The bytes that are stamped: sorted keys, one field per line, ASCII, trailing newline."""
    check(doc)
    return (json.dumps(doc, sort_keys=True, indent=1, ensure_ascii=True) + "\n").encode("ascii")


def from_out(out_dir: Path, skiplist: Path = REPO / "config" / "skiplist.txt", commit: str | None = None,
             network: str | None = None) -> bytes:
    score = json.loads((Path(out_dir) / "score.json").read_text())
    return canonical(build(score, Path(skiplist).read_bytes(), commit or repo_commit(),
                           network or network_name()))


def parse(data: bytes) -> dict:
    """Read a statement back and insist it is canonical (byte-identical to what canonical() would write)."""
    try:
        doc = json.loads(data)
    except ValueError:
        raise StatementError("not a statement (not JSON)") from None
    if not isinstance(doc, dict):
        raise StatementError("not a statement (not a JSON object)")
    if canonical(doc) != data:
        raise StatementError("not a canonical statement (re-serialised bytes differ)")
    return doc


def name_for(data: bytes) -> str:
    """Content-addressed file name on the anchors branch: never overwrites an earlier statement."""
    doc = parse(data)
    return f"{doc['as_of_height']}-{hashlib.sha256(data).hexdigest()[:16]}.json"
