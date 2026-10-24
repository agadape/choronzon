"""Anchor the work's published states in Bitcoin (OpenTimestamps). Integrity, not privacy: docs/anchoring.md.

  python3 -m anchor statement --out out [--commit SHA] [--to anchor.json]   canonical statement from a render
  python3 -m anchor stamp anchor.json [--soft]                              -> anchor.json.ots (pending)
  python3 -m anchor upgrade anchor.json.ots ...                             pending -> Bitcoin-confirmed, in place
  python3 -m anchor upgrade --branch [--no-push]                            the same for every proof on `anchors`
                                                                            (and stamps statements that have none)
  python3 -m anchor verify anchor.json [--ots P] [--offline]                Bitcoin block height/time, no node
  python3 -m anchor persist anchor.json [--ots P] [--no-push]               add to the append-only `anchors` branch

verify exits 0 VERIFIED (in Bitcoin, header confirmed by 2+ explorers), 1 MISMATCH (proof or header does not
match), 3 PENDING (not in Bitcoin yet), 4 UNCHECKED (explorers unreachable from this network: nothing found wrong).
"""
from __future__ import annotations

import argparse
import hashlib
import sys
import tempfile
from pathlib import Path

from . import REPO, StatementError, from_out, name_for, parse
from . import branch as br
from . import ots


def _proof_path(statement: Path, given: str | None) -> Path:
    return Path(given) if given else statement.with_name(statement.name + ".ots")


def cmd_statement(a) -> int:
    data = from_out(Path(a.out), Path(a.skiplist), a.commit or None)
    if a.to:
        Path(a.to).write_bytes(data)
    else:
        sys.stdout.buffer.write(data)
    return 0


def cmd_stamp(a) -> int:
    try:
        parse(Path(a.file).read_bytes())          # only a canonical statement is ever stamped
        proof = ots.stamp(Path(a.file))
    except (ots.AnchorError, StatementError, OSError) as e:
        print(f"{'::warning::' if a.soft else ''}stamp failed: {e}", file=sys.stderr)
        return 0 if a.soft else 1
    print(f"stamped {a.file} -> {proof} (pending: in Bitcoin after the calendars' next transaction confirms)")
    return 0


def cmd_upgrade(a) -> int:
    if a.branch:
        return _upgrade_branch(a)
    if not a.proofs:
        print("give proof files or --branch", file=sys.stderr)
        return 2
    for p in map(Path, a.proofs):
        new, changed = ots.upgrade(p.read_bytes(), log=lambda s: print("  " + s, file=sys.stderr))
        if changed:
            p.write_bytes(new)
        st = ots.status(ots.load(new))
        print(f"{p}: {'upgraded, ' if changed else ''}"
              f"{'Bitcoin block ' + ', '.join(map(str, st['bitcoin_heights'])) if st['bitcoin_heights'] else 'still pending'}")
    return 0


def _upgrade_branch(a) -> int:
    report = []

    def change(files: dict[str, str]):
        changed = False
        for name in sorted(n for n in files if n.endswith(".json")):
            statement = br.blob(files[name])
            if name + ".ots" not in files:          # the calendars were down at deploy time: stamp it now
                with tempfile.TemporaryDirectory() as d:
                    f = Path(d) / name
                    f.write_bytes(statement)
                    try:
                        files[name + ".ots"] = br.write_blob(ots.stamp(f).read_bytes())
                        report.append(f"{name}: stamped (late; the proof's time is now, not the deploy's)")
                        changed = True
                    except ots.AnchorError as e:
                        report.append(f"{name}: no proof yet, stamp failed: {e}")
                continue
            old = br.blob(files[name + ".ots"])
            new, upgraded = ots.upgrade(old)
            st = ots.status(ots.load(new))
            if st["digest"] != hashlib.sha256(statement).hexdigest():
                raise ots.AnchorError(f"{name}.ots is not a proof of {name}")
            if upgraded:
                files[name + ".ots"] = br.write_blob(new)
                changed = True
            report.append(f"{name}: " + ("upgraded, " if upgraded else "")
                          + (f"Bitcoin block {', '.join(map(str, st['bitcoin_heights']))}" if st["bitcoin_heights"]
                             else "pending"))
        return files if changed else None

    commit = br.update(change, "anchors: upgrade proofs", remote=a.remote, push=not a.no_push)
    print("\n".join(report) or "no statements on the anchors branch yet")
    print(f"anchors: {'committed ' + commit + (' (not pushed)' if a.no_push else ' and pushed') if commit else 'nothing changed'}")
    return 0


def cmd_verify(a) -> int:
    statement_path = Path(a.statement)
    data = statement_path.read_bytes()
    doc = parse(data)
    proof = _proof_path(statement_path, a.ots).read_bytes()
    print(f"statement  {doc['statement']}  {doc['network']}  as_of_height {doc['as_of_height']}  "
          f"({doc['offerings']} offerings, {doc['skipped']} skipped)")
    print(f"           score_hash  {doc['score_hash']}")
    print(f"           render_hash {doc['render_hash']}")
    print(f"           skiplist_sha256 {doc['skiplist_sha256']}  repo_commit {doc['repo_commit'][:12]}")
    if a.offline:
        st = ots.status(ots.load(proof))
        ok = st["digest"] == hashlib.sha256(data).hexdigest()
        print(f"proof      {'commits to this statement' if ok else 'IS FOR ANOTHER FILE'}; claims Bitcoin block(s) "
              f"{st['bitcoin_heights'] or 'none yet'}; pending at {len(st['pending'])} calendar(s) (offline: not checked)")
        return 0 if ok and st["bitcoin_heights"] else (1 if not ok else 3)
    explorers = ots.EXPLORERS
    if a.explorers:
        wanted = a.explorers.split(",")
        known = dict(ots.EXPLORERS)
        unknown = [w for w in wanted if w not in known]
        if unknown:
            print(f"unknown explorer(s) {unknown}; known: {', '.join(known)}", file=sys.stderr)
            return 2
        explorers = tuple((w, known[w]) for w in wanted)
    v = ots.verify(data, proof, explorers=explorers,
                   log=lambda s: print("           calendar " + s, file=sys.stderr))
    print(f"proof      {'commits to sha256 of this statement' if v.digest_ok else 'IS FOR ANOTHER FILE'}")
    why: dict[str, str] = {}                  # one line per explorer: the first real reason, not "skipped (...)"
    for u in (u for h in v.heights for u in h.unusable):
        host = u.split(":", 1)[0]
        if host not in why or ": skipped (" in why[host]:
            why[host] = u
    unusable = [why[h] for h in sorted(why)]
    for h in v.heights:
        if h.outcome == "confirmed":
            b = h.block
            print(f"bitcoin    block {b.height}  {b.hash}  {b.time_utc}  (header checked; {h.detail})")
        elif h.outcome == "mismatch":
            print(f"MISMATCH   {h.detail}")
        else:
            print(f"unchecked  block {h.height}: {h.detail}")
    for u in unusable:
        print(f"           explorer not used: {u}")
    outcome = v.outcome
    if outcome == "VERIFIED":
        print(f"=> VERIFIED: this statement existed no later than {v.earliest.time_utc} "
              f"(Bitcoin block {v.earliest.height}, header confirmed by {ots.QUORUM}+ independent explorers).")
    elif outcome == "PENDING":
        print(f"=> PENDING: not in Bitcoin yet ({len(v.pending)} calendar(s) hold it). Calendars publish a Bitcoin "
              "transaction every few hours; try again later.")
    elif outcome == "UNCHECKED":
        print(f"=> UNCHECKED: the proof names Bitcoin block(s) {[h.height for h in v.heights]}, but fewer than "
              f"{ots.QUORUM} explorers could confirm them from this network. Nothing was found wrong; retry from "
              "another network (or via Tor), use https://opentimestamps.org, or `ots verify` with a Bitcoin node.")
    else:
        print("=> MISMATCH: the proof does not match this statement or the Bitcoin chain.")
    return ots.EXIT[outcome]


def cmd_persist(a) -> int:
    statement_path = Path(a.statement)
    data = statement_path.read_bytes()
    parse(data)
    p = _proof_path(statement_path, a.ots)
    proof = p.read_bytes() if p.exists() else None
    commit = br.update(br.add_statement(data, proof), f"anchors: add {name_for(data)}", remote=a.remote,
                       push=not a.no_push)
    print(f"anchors/{name_for(data)}{' + .ots' if proof else ' (no proof yet)'}: "
          f"{'committed ' + commit + (' (not pushed)' if a.no_push else ' and pushed') if commit else 'already there'}")
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="python3 -m anchor", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="command", required=True)
    s = sub.add_parser("statement")
    s.add_argument("--out", default=str(REPO / "out"), help="render directory holding score.json")
    s.add_argument("--skiplist", default=str(REPO / "config" / "skiplist.txt"))
    s.add_argument("--commit", default="", help="repo commit (default: git rev-parse HEAD)")
    s.add_argument("--to", help="write here instead of stdout")
    s = sub.add_parser("stamp")
    s.add_argument("file")
    s.add_argument("--soft", action="store_true", help="a failure is a warning and exits 0 (deploys go on)")
    s = sub.add_parser("upgrade")
    s.add_argument("proofs", nargs="*")
    s.add_argument("--branch", action="store_true", help=f"upgrade every proof on the {br.BRANCH} branch")
    s.add_argument("--remote", default="origin")
    s.add_argument("--no-push", action="store_true")
    s = sub.add_parser("verify")
    s.add_argument("statement")
    s.add_argument("--ots", help="proof file (default: <statement>.ots)")
    s.add_argument("--offline", action="store_true", help="no network: only check the digest and list the claims")
    s.add_argument("--explorers", help="comma-separated subset/order of the built-in explorers (default: all, in order)")
    s = sub.add_parser("persist")
    s.add_argument("statement")
    s.add_argument("--ots", help="proof file (default: <statement>.ots, if it exists)")
    s.add_argument("--remote", default="origin")
    s.add_argument("--no-push", action="store_true")
    a = p.parse_args(argv)
    try:
        return {"statement": cmd_statement, "stamp": cmd_stamp, "upgrade": cmd_upgrade, "verify": cmd_verify,
                "persist": cmd_persist}[a.command](a)
    except (StatementError, ots.AnchorError, br.BranchError, OSError) as e:
        print(f"error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
