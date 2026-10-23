"""OpenTimestamps glue: stamp (reference CLI), upgrade and verify (library), check a Bitcoin header without a node.

What leaves the machine when stamping: `ots stamp` hashes the file locally, appends a 16-byte random nonce, hashes
again and POSTs only that 32-byte digest to the public calendars (otsclient/cmds.py stamp_command,
opentimestamps/calendar.py RemoteCalendar.submit). Upgrading and verifying send the calendar's own commitment back
to it (GET /timestamp/<hex>). Calendars and block explorers see the caller's IP; set ANCHOR_SOCKS5 (e.g. a local
Tor at 127.0.0.1:9050) to route `ots stamp` through a SOCKS5 proxy.

Pinned client: opentimestamps-client 0.7.2 / opentimestamps 0.4.5 (anchor/requirements.txt, hash-pinned wheels).
"""
from __future__ import annotations

import hashlib
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

EXPLORERS = (("mempool.space", "https://mempool.space/api"), ("blockstream.info", "https://blockstream.info/api"))
POW_LIMIT = 0x00000000FFFF0000000000000000000000000000000000000000000000000000   # Bitcoin mainnet, difficulty 1
USER_AGENT = "anchor-verify/1"
INSTALL_HINT = ("needs the OpenTimestamps library: pip install --break-system-packages opentimestamps-client==0.7.2 "
                "(or the hash-pinned anchor/requirements.txt)")


class AnchorError(RuntimeError):
    pass


def _lib():
    try:
        from opentimestamps.calendar import DEFAULT_CALENDAR_WHITELIST, RemoteCalendar
        from opentimestamps.core.notary import BitcoinBlockHeaderAttestation, PendingAttestation
        from opentimestamps.core.serialize import BytesDeserializationContext, BytesSerializationContext
        from opentimestamps.core.timestamp import DetachedTimestampFile
    except ImportError:
        raise AnchorError(INSTALL_HINT) from None
    return locals()


# ---------------------------------------------------------------- stamp (reference CLI)

def ots_cli() -> str:
    """$ANCHOR_OTS, else `ots` next to this interpreter (a venv), else on PATH."""
    if os.environ.get("ANCHOR_OTS"):
        return os.environ["ANCHOR_OTS"]
    sibling = Path(sys.executable).parent / "ots"
    if sibling.exists():
        return str(sibling)
    found = shutil.which("ots")
    if not found:
        raise AnchorError("the `ots` command is not installed; " + INSTALL_HINT)
    return found


def stamp(path: Path, timeout: float = 90.0) -> Path:
    """`ots stamp path` -> path.ots (pending until a calendar's Bitcoin transaction confirms). Raises on failure."""
    path = Path(path)
    proof = path.with_name(path.name + ".ots")
    if proof.exists():
        raise AnchorError(f"{proof} already exists (a proof is never overwritten)")
    cmd = [ots_cli()]
    if os.environ.get("ANCHOR_SOCKS5"):
        cmd += ["--socks5-proxy", os.environ["ANCHOR_SOCKS5"]]
    cmd += ["stamp", str(path)]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        proof.unlink(missing_ok=True)
        raise AnchorError(f"ots stamp timed out after {timeout:.0f} s") from None
    if r.returncode != 0 or not proof.exists():
        proof.unlink(missing_ok=True)
        tail = (r.stderr or r.stdout).strip().splitlines()[-1:] or ["no output"]
        raise AnchorError(f"ots stamp failed (exit {r.returncode}): {tail[0]}")
    return proof


# ---------------------------------------------------------------- read / upgrade (library)

def load(proof: bytes):
    L = _lib()
    try:
        return L["DetachedTimestampFile"].deserialize(L["BytesDeserializationContext"](proof))
    except Exception as e:     # BadMagicError, DeserializationError, ...
        raise AnchorError(f"not an OpenTimestamps proof: {e}") from None


def dump(detached) -> bytes:
    ctx = _lib()["BytesSerializationContext"]()
    detached.serialize(ctx)
    return ctx.getbytes()


def _walk(ts):
    yield ts
    for sub in ts.ops.values():
        yield from _walk(sub)


def status(detached) -> dict:
    """Offline summary: which calendars still hold it pending, which Bitcoin heights it claims (not yet checked)."""
    L = _lib()
    pending, heights = set(), set()
    for _msg, att in detached.timestamp.all_attestations():
        if isinstance(att, L["PendingAttestation"]):
            pending.add(att.uri)
        elif isinstance(att, L["BitcoinBlockHeaderAttestation"]):
            heights.add(att.height)
    return {"digest": detached.file_digest.hex(), "pending": sorted(pending), "bitcoin_heights": sorted(heights)}


def upgrade(proof: bytes, timeout: float = 20.0, log=lambda s: None) -> tuple[bytes, bool]:
    """Ask each pending calendar (default whitelist only) for the path to its Bitcoin transaction.

    Returns (new proof bytes, changed). The result only ever adds attestations; the file digest is unchanged.
    """
    L = _lib()
    detached = load(proof)
    before = {a for _m, a in detached.timestamp.all_attestations()}
    for ts in list(_walk(detached.timestamp)):
        for att in list(ts.attestations):
            if not isinstance(att, L["PendingAttestation"]):
                continue
            if att.uri not in L["DEFAULT_CALENDAR_WHITELIST"]:
                log(f"ignoring calendar {att.uri}: not in the default whitelist")
                continue
            try:
                ts.merge(L["RemoteCalendar"](att.uri, user_agent=USER_AGENT).get_timestamp(ts.msg, timeout=timeout))
            except Exception as e:  # CommitmentNotFoundError (still pending), URLError, timeouts
                log(f"{att.uri}: {getattr(e, 'reason', e)}")
    after = {a for _m, a in detached.timestamp.all_attestations()}
    return dump(detached), after != before


# ---------------------------------------------------------------- Bitcoin header check (no node)

def http_get(url: str, timeout: float = 20.0) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(4096).decode("ascii").strip()


def _sha256d(b: bytes) -> bytes:
    return hashlib.sha256(hashlib.sha256(b).digest()).digest()


def bits_to_target(bits: int) -> int:
    exp, mant = bits >> 24, bits & 0x007FFFFF
    return mant << (8 * (exp - 3)) if exp >= 3 else mant >> (8 * (3 - exp))


@dataclass
class Block:
    height: int
    hash: str
    merkle_root: bytes      # internal byte order, as in the header (what an OTS attestation commits to)
    time: int
    sources: list[str] = field(default_factory=list)

    @property
    def time_utc(self) -> str:
        return datetime.fromtimestamp(self.time, timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


def bitcoin_block(height: int, get=http_get, explorers=EXPLORERS, pow_limit: int = POW_LIMIT) -> Block:
    """The header at `height`, checked: every explorer names the same block hash, the 80-byte header hashes to it,
    and that hash meets the header's own proof-of-work target (at least Bitcoin's minimum difficulty)."""
    hashes = {}
    for name, base in explorers:
        try:
            hashes[name] = get(f"{base}/block-height/{height}").lower()
        except Exception as e:
            raise AnchorError(f"{name}: no block hash for height {height} ({e})") from None
    if len(set(hashes.values())) != 1:
        raise AnchorError(f"explorers disagree on block {height}: {hashes}")
    block_hash = next(iter(hashes.values()))
    name, base = explorers[0]
    header = bytes.fromhex(get(f"{base}/block/{block_hash}/header"))
    if len(header) != 80:
        raise AnchorError(f"{name}: header for {block_hash} is {len(header)} bytes, not 80")
    if _sha256d(header)[::-1].hex() != block_hash:
        raise AnchorError(f"{name}: header does not hash to {block_hash}")
    bits = struct.unpack("<I", header[72:76])[0]
    target = bits_to_target(bits)
    if target > pow_limit or int.from_bytes(_sha256d(header), "little") > target:
        raise AnchorError(f"block {block_hash} does not meet its proof-of-work target")
    return Block(height, block_hash, header[36:68], struct.unpack("<I", header[68:72])[0], [n for n, _ in explorers])


@dataclass
class Verdict:
    digest_ok: bool
    confirmed: list[Block]
    pending: list[str]
    problems: list[str]

    @property
    def earliest(self) -> Block | None:
        return min(self.confirmed, key=lambda b: b.height) if self.confirmed else None


def verify(data: bytes, proof: bytes, get=http_get, online_upgrade: bool = True, explorers=EXPLORERS,
           pow_limit: int = POW_LIMIT, log=lambda s: None) -> Verdict:
    """Check that `proof` commits to sha256(data) and that each Bitcoin attestation matches a real block header."""
    L = _lib()
    if online_upgrade:
        proof, _ = upgrade(proof, log=log)
    detached = load(proof)
    digest_ok = detached.file_digest == hashlib.sha256(data).digest()
    confirmed, problems = [], []
    if not digest_ok:
        problems.append("the proof is for another file (sha256 differs)")
    seen = set()
    for msg, att in detached.timestamp.all_attestations():
        if not isinstance(att, L["BitcoinBlockHeaderAttestation"]) or (msg, att.height) in seen:
            continue
        seen.add((msg, att.height))
        try:
            block = bitcoin_block(att.height, get=get, explorers=explorers, pow_limit=pow_limit)
        except AnchorError as e:
            problems.append(str(e))
            continue
        if block.merkle_root != msg:
            problems.append(f"block {att.height}: merkle root {block.merkle_root[::-1].hex()} is not the proof's "
                            f"{msg[::-1].hex()}")
            continue
        confirmed.append(block)
    return Verdict(digest_ok, confirmed, status(detached)["pending"], problems)


def scratch_dir() -> Path:
    return Path(tempfile.mkdtemp(prefix="anchor-"))
