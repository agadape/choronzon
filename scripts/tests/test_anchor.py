"""anchor/: the stamped statement is deterministic and carries nothing private; proofs check out against a header;
the anchors branch is append-only; the workflow anchors without new secrets and never lets a stamp fail a deploy."""
import copy
import hashlib
import json
import re
import shutil
import struct
import subprocess
from pathlib import Path

import pytest

import anchor
from anchor import branch as br
from anchor import ots

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github" / "workflows" / "publish-web.yml"
UPGRADE_WORKFLOW = ROOT / ".github" / "workflows" / "anchor-upgrade.yml"
H = "ab" * 32


def score_fixture():
    return {
        "score": {"as_of_height": 4522002, "format": "score/1",
                  "offerings": [{"tx": "11" * 32, "memos": 1, "has_reply": True, "codec": 10, "contrib_id": 7,
                                 "reply_addr": "utest1qqqqqqqqqqqqqqqq", "memo": "a secret"}],
                  "skipped": [{"tx": "22" * 32, "reason": "flagged"}]},
        "score_hash": "41" * 32, "score_hash_version": "score/1",
        "render_hash": "9b" * 32, "render_hash_version": "render/1",
        "render": {"composer": "choir/2", "decoder": {"fingerprint": "1e" * 32, "codec2_tag": "1.2.0"},
                   "voice": {"fingerprint": "19" * 32, "espeak_ng": "1.51"}, "timeline": []},
        "regression": {"g6_hash": "c4" * 32},
        "ufvk": "uviewtest1secretkey",
    }


def statement(**over):
    doc = anchor.build(score_fixture(), b"# skiplist\n", "0" * 40, "zcash-testnet")
    doc.update(over)
    return doc


# ------------------------------------------------------------------ statement

def test_statement_bytes_are_deterministic_and_key_order_free():
    a = anchor.canonical(anchor.build(score_fixture(), b"x\n", "f" * 40, "zcash-testnet"))
    s = score_fixture()
    shuffled = json.loads(json.dumps(s, sort_keys=True))     # same data, other key order
    b = anchor.canonical(anchor.build(shuffled, b"x\n", "f" * 40, "zcash-testnet"))
    assert a == b and a.endswith(b"\n") and a.isascii()
    assert anchor.parse(a) == json.loads(a)


def test_statement_holds_exactly_the_fixed_fields_and_nothing_private():
    data = anchor.canonical(statement())
    doc = json.loads(data)
    assert tuple(sorted(doc)) == tuple(sorted(anchor.FIELDS))
    text = data.decode()
    for forbidden in ("utest1", "uview", "uvftest", "secret", "memo", "reply", "11" * 32, "22" * 32, "contrib"):
        assert forbidden not in text, forbidden
    assert not re.search(r"\b(zu|tu|u)(test)?1[0-9a-z]{10,}", text)
    assert doc["offerings"] == 1 and doc["skipped"] == 1
    assert doc["skiplist_sha256"] == hashlib.sha256(b"# skiplist\n").hexdigest()


@pytest.mark.parametrize("bad", [
    {"memo": "hi"},                          # an extra field
    {"score_hash": "AB" * 32},               # not lowercase hex
    {"render_hash": "ab" * 31},              # too short
    {"as_of_height": True},                  # bool is not a height
    {"as_of_height": -1},
    {"network": "zcash-regtest"},
    {"repo_commit": "main"},
    {"composer": "choir 2"},
])
def test_check_refuses_malformed_statements(bad):
    with pytest.raises(anchor.StatementError):
        anchor.canonical(statement(**bad))


def test_build_refuses_a_score_without_hashes():
    s = score_fixture()
    del s["render_hash"]
    with pytest.raises(anchor.StatementError):
        anchor.build(s, b"", "0" * 40, "zcash-testnet")


def test_parse_refuses_non_canonical_bytes_and_names_are_content_addressed():
    data = anchor.canonical(statement())
    with pytest.raises(anchor.StatementError):
        anchor.parse(json.dumps(json.loads(data)).encode())   # same JSON, other bytes
    name = anchor.name_for(data)
    assert name == f"4522002-{hashlib.sha256(data).hexdigest()[:16]}.json"
    assert anchor.name_for(anchor.canonical(statement(repo_commit="1" * 40))) != name


def test_network_comes_from_choir_config_only():
    assert anchor.network_name() == "zcash-testnet"


@pytest.mark.skipif(not (ROOT / "out" / "score.json").exists(), reason="needs a render in out/")
def test_statement_from_the_real_render():
    data = anchor.from_out(ROOT / "out", commit="a" * 40)
    doc = anchor.parse(data)
    score = json.loads((ROOT / "out" / "score.json").read_text())
    assert doc["render_hash"] == score["render_hash"] and doc["as_of_height"] == score["score"]["as_of_height"]
    assert anchor.from_out(ROOT / "out", commit="a" * 40) == data


# ------------------------------------------------------------------ Bitcoin header check

def sha256d(b):
    return hashlib.sha256(hashlib.sha256(b).digest()).digest()


def mine(merkle_root: bytes, time=1792000000, bits=0x207FFFFF):
    """A header with an easy (regtest-like) target, ground until it meets it (two tries on average)."""
    for nonce in range(1000):
        header = struct.pack("<I", 0x20000000) + b"\0" * 32 + merkle_root + struct.pack("<III", time, bits, nonce)
        if int.from_bytes(sha256d(header), "little") <= ots.bits_to_target(bits):
            return header
    raise AssertionError("could not mine")


def explorer(headers: dict[int, bytes], wrong_hash_on=None):
    by_hash = {sha256d(h)[::-1].hex(): h for h in headers.values()}

    def get(url):
        name = url.split("/")[2]
        if "/block-height/" in url:
            height = int(url.rsplit("/", 1)[1])
            if name == wrong_hash_on:
                return "00" * 32
            return sha256d(headers[height])[::-1].hex()
        return by_hash[url.split("/")[-2]].hex()
    return get


EASY = 2 ** 256


def test_bits_to_target_matches_bitcoin():
    assert ots.bits_to_target(0x1D00FFFF) == ots.POW_LIMIT
    assert ots.bits_to_target(0x170331DB) == 0x0331DB << (8 * (0x17 - 3))


def test_bitcoin_block_checks_hash_header_and_agreement():
    header = mine(b"\x11" * 32)
    b = ots.bitcoin_block(900000, get=explorer({900000: header}), pow_limit=EASY)
    assert b.merkle_root == b"\x11" * 32 and b.time == 1792000000 and b.time_utc.startswith("2026-")
    with pytest.raises(ots.AnchorError, match="disagree"):
        ots.bitcoin_block(900000, get=explorer({900000: header}, wrong_hash_on="blockstream.info"), pow_limit=EASY)
    with pytest.raises(ots.AnchorError, match="proof-of-work"):
        ots.bitcoin_block(900000, get=explorer({900000: header}))       # an easy target is not Bitcoin's


def synthetic_proof(data: bytes, height: int):
    """A proof of `data` claiming Bitcoin block `height`; returns (proof bytes, the merkle root it commits to)."""
    pytest.importorskip("opentimestamps")
    from opentimestamps.core.notary import BitcoinBlockHeaderAttestation, PendingAttestation
    from opentimestamps.core.op import OpAppend, OpSHA256
    from opentimestamps.core.timestamp import DetachedTimestampFile, Timestamp
    d = DetachedTimestampFile(OpSHA256(), Timestamp(hashlib.sha256(data).digest()))
    leaf = d.timestamp.ops.add(OpAppend(b"\x07" * 16)).ops.add(OpSHA256())
    leaf.attestations.add(BitcoinBlockHeaderAttestation(height))
    leaf.attestations.add(PendingAttestation("https://alice.btc.calendar.opentimestamps.org"))
    return ots.dump(d), leaf.msg


def test_verify_a_confirmed_proof_against_a_header():
    data = anchor.canonical(statement())
    proof, root = synthetic_proof(data, 900000)
    get = explorer({900000: mine(root)})
    v = ots.verify(data, proof, get=get, online_upgrade=False, pow_limit=EASY)
    assert v.digest_ok and not v.problems and v.earliest.height == 900000
    st = ots.status(ots.load(proof))
    assert st["bitcoin_heights"] == [900000] and st["digest"] == hashlib.sha256(data).hexdigest()


def test_verify_rejects_another_file_and_a_wrong_block():
    data = anchor.canonical(statement())
    proof, root = synthetic_proof(data, 900000)
    other = anchor.canonical(statement(skipped=2))      # e.g. a skiplist edited after the fact
    v = ots.verify(other, proof, get=explorer({900000: mine(root)}), online_upgrade=False, pow_limit=EASY)
    assert not v.digest_ok
    v = ots.verify(data, proof, get=explorer({900000: mine(b"\x22" * 32)}), online_upgrade=False, pow_limit=EASY)
    assert v.problems and "merkle root" in v.problems[0] and not v.confirmed


# ------------------------------------------------------------------ anchors branch (append-only)

def git(cwd, *args):
    return subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, check=True).stdout.strip()


@pytest.fixture
def repo(tmp_path, monkeypatch):
    if not shutil.which("git"):
        pytest.skip("needs git")
    remote = tmp_path / "remote.git"
    git(tmp_path, "init", "--quiet", "--bare", str(remote))
    work = tmp_path / "work"
    git(tmp_path, "init", "--quiet", str(work))
    git(work, "remote", "add", "origin", str(remote))
    for k, v in (("user.name", "test"), ("user.email", "test@example.invalid")):
        git(work, "config", k, v)
    monkeypatch.setattr(br, "WORKDIR", work)
    return work


def test_persist_is_append_only_and_idempotent(repo):
    s1, s2 = anchor.canonical(statement()), anchor.canonical(statement(as_of_height=4527794))
    c1 = br.update(br.add_statement(s1, b"proof-1"), "add 1", log=lambda s: None)
    assert c1 and br.update(br.add_statement(s1, b"proof-other"), "again") is None   # already there: no-op
    c2 = br.update(br.add_statement(s2, None), "add 2")
    files = br.files_at(br.fetch("origin"))
    n1, n2 = anchor.name_for(s1), anchor.name_for(s2)
    assert set(files) == {"README.md", n1, n1 + ".ots", n2}
    assert br.blob(files[n1 + ".ots"]) == b"proof-1"                       # the first proof is kept
    assert git(repo, "rev-parse", f"{c2}^") == c1                         # history only grows
    c3 = br.update(br.add_statement(s2, b"proof-2"), "late proof")
    assert br.blob(br.files_at(c3)[n2 + ".ots"]) == b"proof-2"
    with pytest.raises(br.BranchError, match="append-only"):
        br.update(lambda files: {k: v for k, v in files.items() if k != n1}, "drop one")


# ------------------------------------------------------------------ workflows

@pytest.fixture(scope="module")
def workflows():
    yaml = pytest.importorskip("yaml")
    return yaml.safe_load(WORKFLOW.read_text()), yaml.safe_load(UPGRADE_WORKFLOW.read_text())


def test_only_the_anchor_jobs_may_write_and_they_hold_no_secrets(workflows):
    publish, upgrade = workflows
    assert publish["permissions"] == {"contents": "read"}
    assert "permissions" not in publish["jobs"]["publish"]
    assert publish["jobs"]["anchor"]["permissions"] == {"contents": "write"}
    assert upgrade["permissions"] == {"contents": "write"}
    for job in (publish["jobs"]["anchor"], *upgrade["jobs"].values()):
        assert "secrets." not in json.dumps(job)
    assert set(re.findall(r"secrets\.([A-Z_]+)", UPGRADE_WORKFLOW.read_text())) == set()
    assert set(re.findall(r"secrets\.([A-Z_]+)", WORKFLOW.read_text())) == {"CHOIR_UFVK", "VERCEL_TOKEN"}


def test_a_stamp_never_fails_the_deploy(workflows):
    publish, _ = workflows
    steps = {s["name"]: s for s in publish["jobs"]["publish"]["steps"]}
    build = steps["Build the static snapshot (allow-list)"]
    assert "--stamp" in build["run"]
    install = steps["Install the OpenTimestamps client (hash-pinned wheels, own venv)"]
    assert install.get("continue-on-error") is True and "ci_anchor.sh" in install["run"]
    assert publish["jobs"]["anchor"]["needs"] == "publish"
    assert "deployed" in publish["jobs"]["anchor"]["if"]
    script = (ROOT / "scripts" / "build_web.sh").read_text()
    assert "anchor stamp" in script and "--soft" in script
    ci = (ROOT / "scripts" / "ci_anchor.sh").read_text()
    assert "--require-hashes" in ci and "--only-binary" in ci


def test_requirements_are_fully_hash_pinned():
    lines = [l for l in (ROOT / "anchor" / "requirements.txt").read_text().splitlines()
             if l.strip() and not l.startswith("#")]
    assert lines and all(re.match(r"^[A-Za-z0-9_.-]+==[0-9.]+ --hash=sha256:[0-9a-f]{64}$", l) for l in lines)
    assert any(l.startswith("opentimestamps-client==0.7.2 ") for l in lines)
