"""OpenTimestamps glue: stamp (reference CLI), upgrade and verify (library), check a Bitcoin header without a node.

What leaves the machine when stamping: `ots stamp` hashes the file locally, appends a 16-byte random nonce, hashes
again and POSTs only that 32-byte digest to the public calendars (otsclient/cmds.py stamp_command,
opentimestamps/calendar.py RemoteCalendar.submit). Upgrading and verifying send the calendar's own commitment back
to it (GET /timestamp/<hex>). Calendars and block explorers see the caller's IP; set ANCHOR_SOCKS5 (e.g. a local
Tor at 127.0.0.1:9050) to route `ots stamp` through a SOCKS5 proxy.

verify: VERIFIED (exit 0) / MISMATCH (1) / PENDING (3) / UNCHECKED (4, explorers or calendars unreachable).

Pinned client: opentimestamps-client 0.7.2 / opentimestamps 0.4.5 (anchor/requirements.txt, hash-pinned wheels).
"""
from __future__ import annotations

import hashlib
import http.client
import os
import shutil
import socket
import ssl
import struct
import subprocess
import sys
import tempfile
import time
import urllib.parse
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

# Esplora-compatible block explorers run by different operators. A block counts as checked when QUORUM of them name
# the same valid header; the rest are fallbacks (on 24 Oct an ISP filter here blocked the first two).
EXPLORERS = (("mempool.space", "https://mempool.space/api"), ("blockstream.info", "https://blockstream.info/api"),
             ("mempool.emzy.de", "https://mempool.emzy.de/api"), ("btcscan.org", "https://btcscan.org/api"),
             ("bitcoin.lu.ke", "https://bitcoin.lu.ke/api"), ("mempool.bitaroo.net", "https://mempool.bitaroo.net/api"))
QUORUM = 2
REQUEST_TIMEOUT = 10.0     # seconds per request, all addresses of a host included
CONNECT_TIMEOUT = 5.0      # seconds per address
MIN_DIFFICULTY_AFTER_700K = 10 ** 13
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
#
# Outcomes are kept apart on purpose: a header that does not match the proof is a MISMATCH; an explorer we could not
# reach (network down, blocked by an ISP filter, TLS certificate of someone else, garbage, a header that does not
# hash to the hash it named) only means that source could not be used: UNCHECKED, never a mismatch.

class SourceError(AnchorError):
    """An explorer could not be used (unreachable, blocked, malformed or inconsistent answer)."""


class _IPv4FirstHTTPS(http.client.HTTPSConnection):
    """Tries the host's IPv4 addresses before IPv6, each for at most CONNECT_TIMEOUT, all within self.timeout.

    (urllib tries every address with the full timeout each: a host with 4 dead addresses cost 4 x timeout.)"""

    def connect(self):
        infos = socket.getaddrinfo(self.host, self.port, 0, socket.SOCK_STREAM)
        infos.sort(key=lambda i: i[0] != socket.AF_INET)
        deadline, last, sock = time.monotonic() + self.timeout, None, None
        for family, kind, proto, _name, addr in infos:
            left = deadline - time.monotonic()
            if left <= 0:
                break
            sock = socket.socket(family, kind, proto)
            sock.settimeout(min(left, CONNECT_TIMEOUT))
            try:
                sock.connect(addr)
                break
            except OSError as e:
                last, sock = e, sock.close()
        if sock is None:
            raise last or TimeoutError("no address answered")
        sock.settimeout(max(1.0, deadline - time.monotonic()))
        self.sock = self._context.wrap_socket(sock, server_hostname=self.host)


class Fetcher:
    """GET small text answers from explorers; a source that fails to connect is skipped for the rest of the run."""

    def __init__(self, timeout: float = REQUEST_TIMEOUT, retries: int = 1):
        self.timeout, self.retries, self.dead = timeout, retries, {}

    def __call__(self, url: str) -> str:
        parts = urllib.parse.urlsplit(url)
        host = parts.hostname
        if host in self.dead:
            raise SourceError(f"{host}: skipped ({self.dead[host]})")
        for attempt in range(self.retries + 1):
            conn = _IPv4FirstHTTPS(host, parts.port or 443, timeout=self.timeout,
                                   context=ssl.create_default_context())
            try:
                conn.request("GET", parts.path + (f"?{parts.query}" if parts.query else ""),
                             headers={"User-Agent": USER_AGENT, "Accept": "text/plain"})
                r = conn.getresponse()
                body = r.read(4096)
                if r.status == 200:
                    return body.decode("ascii").strip()
                if r.status < 500 or attempt == self.retries:
                    raise SourceError(f"{host}: HTTP {r.status}")
            except ssl.SSLCertVerificationError as e:
                self.dead[host] = f"TLS certificate is not {host}'s ({e.verify_message}): blocked or intercepted"
                raise SourceError(f"{host}: {self.dead[host]}") from None
            except (OSError, http.client.HTTPException, UnicodeDecodeError) as e:
                if attempt == self.retries or isinstance(e, (socket.gaierror, TimeoutError, ConnectionRefusedError)) \
                        or getattr(e, "errno", None) in (101, 113):   # network/host unreachable: retrying won't help
                    self.dead[host] = f"unreachable: {e.__class__.__name__}: {e}"[:160]
                    raise SourceError(f"{host}: {self.dead[host]}") from None
            finally:
                conn.close()
            time.sleep(1)
        raise SourceError(f"{host}: no answer")


http_get = Fetcher()


def _sha256d(b: bytes) -> bytes:
    return hashlib.sha256(hashlib.sha256(b).digest()).digest()


def bits_to_target(bits: int) -> int:
    exp, mant = bits >> 24, bits & 0x007FFFFF
    return mant << (8 * (exp - 3)) if exp >= 3 else mant >> (8 * (3 - exp))


def pow_floor(height: int) -> int:
    """The largest target we accept at `height`. Difficulty 1 is not enough: anyone can mine a difficulty-1 header
    around any merkle root in seconds, so a single lying explorer could fake one. Blocks after 700,000 (2021) all
    have difficulty > 1.3e13; faking a header at 1e13 costs about as much as mining a real block."""
    return POW_LIMIT // MIN_DIFFICULTY_AFTER_700K if height >= 700_000 else POW_LIMIT


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


def _header_from(name: str, base: str, height: int, get, pow_limit: int) -> Block:
    """One explorer's block at `height`, after checking the header hashes to the hash it named and meets the
    proof-of-work floor. Any failure here is that source's fault (SourceError), not the proof's."""
    try:
        block_hash = get(f"{base}/block-height/{height}").lower()
        header = bytes.fromhex(get(f"{base}/block/{block_hash}/header"))
    except SourceError:
        raise
    except ValueError:
        raise SourceError(f"{name}: answer is not hex (a filter page?)") from None
    if len(header) != 80 or _sha256d(header)[::-1].hex() != block_hash:
        raise SourceError(f"{name}: header does not hash to the block hash it named for height {height}")
    target = bits_to_target(struct.unpack("<I", header[72:76])[0])
    if target > pow_limit or int.from_bytes(_sha256d(header), "little") > target:
        raise SourceError(f"{name}: block {block_hash} is below the proof-of-work floor for height {height}")
    return Block(height, block_hash, header[36:68], struct.unpack("<I", header[68:72])[0], [name])


@dataclass
class HeightCheck:
    height: int
    outcome: str                    # "confirmed" | "mismatch" | "unchecked"
    block: Block | None
    detail: str
    unusable: list[str] = field(default_factory=list)   # "<source>: <why>" for every explorer that could not be used


def check_height(height: int, msg: bytes, get=http_get, explorers=EXPLORERS, quorum: int = QUORUM,
                 pow_limit: int | None = None) -> HeightCheck:
    """Ask explorers in order until `quorum` of them name the same valid header for `height`, then compare its
    merkle root with the proof's. Fewer than `quorum` usable sources, or sources that disagree: unchecked."""
    pow_limit = pow_floor(height) if pow_limit is None else pow_limit
    by_hash: dict[str, Block] = {}
    unusable: list[str] = []
    for name, base in explorers:
        try:
            b = _header_from(name, base, height, get, pow_limit)
        except SourceError as e:
            unusable.append(str(e))
            continue
        if b.hash in by_hash:
            by_hash[b.hash].sources.append(name)
        else:
            by_hash[b.hash] = b
        agreed = by_hash[b.hash]
        if len(agreed.sources) >= quorum and len(by_hash) == 1:
            if agreed.merkle_root != msg:
                return HeightCheck(height, "mismatch", agreed,
                                   f"block {height} ({agreed.hash}) has merkle root {agreed.merkle_root[::-1].hex()}, "
                                   f"the proof commits to {msg[::-1].hex()}", unusable)
            return HeightCheck(height, "confirmed", agreed, f"{' + '.join(agreed.sources)} agree", unusable)
    if len(by_hash) > 1:
        seen = "; ".join(f"{'+'.join(b.sources)}: {h}" for h, b in by_hash.items())
        return HeightCheck(height, "unchecked", None, f"explorers disagree on block {height} ({seen})", unusable)
    got = next(iter(by_hash.values()), None)
    have = f"only {len(got.sources)} ({got.sources[0]})" if got else "none"
    return HeightCheck(height, "unchecked", got, f"needs {quorum} agreeing explorers, reached {have}", unusable)


@dataclass
class Verdict:
    digest_ok: bool
    heights: list[HeightCheck]
    pending: list[str]

    @property
    def confirmed(self) -> list[Block]:
        return [h.block for h in self.heights if h.outcome == "confirmed"]

    @property
    def earliest(self) -> Block | None:
        return min(self.confirmed, key=lambda b: b.height) if self.confirmed else None

    @property
    def outcome(self) -> str:
        """VERIFIED (exit 0), MISMATCH (1), PENDING (3), UNCHECKED (4)."""
        if not self.digest_ok or any(h.outcome == "mismatch" for h in self.heights):
            return "MISMATCH"
        if self.confirmed:
            return "VERIFIED"
        if self.heights:
            return "UNCHECKED"
        return "PENDING" if self.pending else "MISMATCH"   # no attestation at all: not a proof


EXIT = {"VERIFIED": 0, "MISMATCH": 1, "PENDING": 3, "UNCHECKED": 4}


def verify(data: bytes, proof: bytes, get=http_get, online_upgrade: bool = True, explorers=EXPLORERS,
           quorum: int = QUORUM, pow_limit: int | None = None, log=lambda s: None) -> Verdict:
    """Check that `proof` commits to sha256(data) and that each Bitcoin attestation matches a real block header."""
    L = _lib()
    if online_upgrade:
        proof, _ = upgrade(proof, timeout=REQUEST_TIMEOUT, log=log)
    detached = load(proof)
    digest_ok = detached.file_digest == hashlib.sha256(data).digest()
    checks, seen = [], set()
    for msg, att in detached.timestamp.all_attestations():
        if not isinstance(att, L["BitcoinBlockHeaderAttestation"]) or (msg, att.height) in seen:
            continue
        seen.add((msg, att.height))
        checks.append(check_height(att.height, msg, get=get, explorers=explorers, quorum=quorum,
                                   pow_limit=pow_limit))
    return Verdict(digest_ok, sorted(checks, key=lambda c: c.height), status(detached)["pending"])


def scratch_dir() -> Path:
    return Path(tempfile.mkdtemp(prefix="anchor-"))
