"""The G6 spike hash, kept only as a regression check (research/spikes/g6_render.py; c46dd5de... at height 4522002).

Same inputs and formula as the spike: SHA-256(score JSON || decoded PCM and text bytes, concatenated || as_of).
It differs from the product hashes on purpose and must not change: if it does, decoding or ordering regressed.
"""
from __future__ import annotations

import hashlib
import json

import protocol
from protocol import ProtocolError

from .decoder import DecodeError, Decoder
from .wallet import Candidate


def g6_hash(candidates: list[Candidate], as_of: int, decoder: Decoder) -> str:
    score, pcm = [], bytearray()
    for c in sorted(candidates, key=lambda c: (c.height, c.tx_index, c.action_index)):
        if c.height > as_of or c.pool != "ironwood" or c.own_spend:
            continue
        try:
            d = protocol.decode_contribution([protocol.normalize_memo(m) for m in c.memos if m and m.rstrip(b"\0")])
        # (the spike read a NULL memo as empty; build_score runs first and fails closed on those instead)
        except ProtocolError:
            continue
        entry = {"tx": c.txid, "h": c.height, "i": c.tx_index, "cid": d.contrib_id, "codec": d.codec,
                 "bytes": len(d.data), "has_reply": d.reply_present}
        if d.codec in protocol.AUDIO_CODECS:
            try:
                audio = decoder.decode(d.codec, d.data)
            except DecodeError:
                continue
            pcm += audio
            entry["pcm_bytes"] = len(audio)
        else:
            pcm += d.data
            entry["text"] = d.data.decode("utf-8", "replace")
        score.append(entry)
    canonical = json.dumps(score, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(canonical + bytes(pcm) + str(as_of).encode()).hexdigest()
