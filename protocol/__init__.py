"""Memo wire protocol v1 (binary memos, phone-safe ASCII envelope, human-readable phone replies)."""
from .address import address_network, is_unified_address
from .envelope import (ASCII_BINARY_CAP, TextReply, decode_any_reply, decode_reply_text, encode_contribution_ascii,
                       encode_reply_text, normalize_memo, to_ascii_memo)
from .memo import (AUDIO_CODECS, CODEC_C2_700C, CODEC_C2_1200, CODEC_C2_1300, CODEC_TEXT, KIND_CONDUCTOR,
                   KIND_CONTRIBUTION, KIND_REPLY, KNOWN_CODECS, MAX_BODY, MAX_CHUNKS, MEMO_SIZE, Contribution,
                   Header, ProtocolError, Reply, decode_contribution, decode_reply, encode_conductor,
                   encode_contribution, encode_reply, parse_memo)
