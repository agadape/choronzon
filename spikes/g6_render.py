#!/usr/bin/env python3
"""G6 — deterministic Ghost Choir renderer ("the blockchain is the score").

Reads ONE wallet database that holds the choir's viewing key (spend key not needed), and produces:
  * the score: ordered list of valid contributions, canonical order = (mined_height, tx_index, min action_index)
  * a render log: every candidate tx and why it was accepted / skipped
  * PCM: decoded audio (Codec2 via `c2dec`) for audio contributions, text contributions as UTF-8
  * RENDER HASH = SHA-256(canonical score JSON || PCM bytes || as_of_height)
Two independently synced wallets with the same key must print the same hash. That is the proof.

Usage: python3 spikes/g6_render.py <wallet_dir> <as_of_height> [--audio-dir DIR]
"""
import sys, os, json, hashlib, sqlite3, subprocess, tempfile
sys.path.insert(0, os.path.dirname(__file__)); import wb_protocol as p

CODEC_MODES = {p.CODEC_C2_700C: "700C", p.CODEC_C2_1200: "1200", 3: "1300"}


def load_candidates(db_path, as_of):
    c = sqlite3.connect(db_path)
    rows = c.execute("""
        select hex(t.txid), t.mined_height, t.tx_index, n.action_index, n.value, n.memo, n.is_change
        from ironwood_received_notes n join transactions t on t.id_tx = n.transaction_id
        where t.mined_height is not null and t.mined_height <= ? order by t.mined_height, t.tx_index, n.action_index""", (as_of,)).fetchall()
    by_tx = {}
    for txid, h, ti, ai, value, memo, is_change in rows:
        by_tx.setdefault(txid, {"height": h, "tx_index": ti, "first_action": ai, "memos": [], "values": [], "change": bool(is_change)})
        by_tx[txid]["memos"].append(bytes(memo or b""))
        by_tx[txid]["values"].append(value)
    return sorted(by_tx.items(), key=lambda kv: (kv[1]["height"], kv[1]["tx_index"], kv[1]["first_action"]))


def decode_audio(codec, data, workdir):
    mode = CODEC_MODES[codec]
    c2 = os.path.join(workdir, "in.c2"); raw = os.path.join(workdir, "out.raw")
    open(c2, "wb").write(data)
    subprocess.run(["c2dec", mode, c2, raw], check=True, capture_output=True)
    return open(raw, "rb").read()


def render(wallet_dir, as_of):
    score, log, pcm = [], [], bytearray()
    with tempfile.TemporaryDirectory() as wd:
        for txid, tx in load_candidates(os.path.join(wallet_dir, "data.sqlite"), as_of):
            disp = bytes.fromhex(txid)[::-1].hex()  # display byte order (explorers, Zingo)
            if tx["change"]:  # the choir's own spends: conductor voice candidates (S13); not a contribution
                log.append({"tx": disp, "h": tx["height"], "result": "skip", "why": "choir-own-spend (conductor channel)"}); continue
            try:
                memos = [p.normalize_memo(m) for m in tx["memos"] if m.rstrip(b"\0")]
                d = p.decode_contribution(memos)
            except Exception as e:
                log.append({"tx": disp, "h": tx["height"], "result": "skip", "why": f"invalid: {e}"}); continue
            entry = {"tx": disp, "h": tx["height"], "i": tx["tx_index"], "cid": d["contrib_id"], "codec": d["codec"],
                     "bytes": len(d["data"]), "has_reply": d["reply_addr"] is not None}
            if d["codec"] in CODEC_MODES:
                try: audio = decode_audio(d["codec"], d["data"], wd); pcm += audio; entry["pcm_bytes"] = len(audio)
                except Exception as e: log.append({"tx": disp, "h": tx["height"], "result": "skip", "why": f"audio decode failed: {e}"}); continue
            elif d["codec"] == p.CODEC_TEXT:
                pcm += d["data"]; entry["text"] = d["data"].decode("utf-8", "replace")
            else:
                log.append({"tx": disp, "h": tx["height"], "result": "skip", "why": f"unknown codec {d['codec']}"}); continue
            score.append(entry); log.append({"tx": disp, "h": tx["height"], "result": "accept", "cid": d["contrib_id"]})
    canonical = json.dumps(score, sort_keys=True, separators=(",", ":")).encode()
    h = hashlib.sha256(canonical + bytes(pcm) + str(as_of).encode()).hexdigest()
    return score, log, h


if __name__ == "__main__":
    wallet_dir, as_of = sys.argv[1], int(sys.argv[2])
    score, log, h = render(wallet_dir, as_of)
    print(json.dumps({"wallet": wallet_dir, "as_of_height": as_of, "accepted": len(score),
                      "skipped": sum(1 for l in log if l["result"] == "skip"), "render_hash": h}, indent=1))
    for l in log: print("  ", l)
