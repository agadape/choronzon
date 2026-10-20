# kiosk/

Sender kiosk (Day 4, not started): text -> local TTS (espeak-ng) -> Codec2 700C (`bin/c2enc`) -> memo chunks
(`protocol/`) -> `wallet pay` from an **ephemeral** wallet funded from the note pool. The wallet directory is wiped
after each session and raw recordings are never stored. Copy comes from `config/brand.json`.
