#!/usr/bin/env bash
# Rehearsal of the 3-minute demo, end to end, with real testnet transactions and no manual steps.
# Run it several times before the show; every run prints a timing table and exits non-zero on any failure.
#
#   ./scripts/demo.sh [--skip-summon]
#   LWD_CONNECTION=direct ./scripts/demo.sh    deliberate fallback when Tor cannot connect from the venue
#
# Steps (each one is a product command, nothing is faked):
#   1 evoke      render from the public-key wallet V (baseline hashes)
#   2 offer      a live offering with a reply address from the ephemeral kiosk session wallet
#   3 heard      the public-key renderer sees it (latency measured)
#   4 whisper    listener L whispers back directly; the session inbox receives it
#   5 god/forge  the choir wallet speaks a conductor line; wallet A sends a forgery; renderer accepts one, refuses one
# Preflight also makes sure the listener wallet L holds a pool of notes (one locked note must not silence it).
#   6 summon     a Watcher built from the published key alone prints the same hashes
# Logs: logs/demo_<timestamp>.log (txids, heights, hashes and timings only).
set -uo pipefail
cd "$(dirname "$0")/.."
export PATH="$PWD/bin:$PATH"

V=wallets/test/V; B=wallets/test/B; A=wallets/test/A; L=wallets/test/L
# every lightwalletd connection (kiosk, renderer, whisper, summon, the syncs below) goes over Tor unless the operator
# chose direct; a Tor failure fails the step, it never retries direct (renderer/network.py)
export LWD_CONNECTION="${LWD_CONNECTION:-tor}"
mkdir -p logs out
LOG="logs/demo_$(date -u +%Y%m%dT%H%M%SZ).log"
exec > >(tee -a "$LOG") 2>&1
T_START=$(date +%s)
declare -a TIMES=()
fail=0
mark(){ TIMES+=("$1=$(( $(date +%s) - T_START ))s"); }
step(){ printf "\n== %s  (t+%ss)\n" "$*" "$(( $(date +%s) - T_START ))"; }
die(){ echo "!! $*"; fail=1; }
# lightwalletd (testnet.zec.rocks) drops a TLS connection now and then ("peer closed connection without sending
# TLS close_notify", rehearsals 5 and 8: twice within 30 s, fine 50 s later). Sends are retried with a growing
# pause; the note pools (session, L, B, A) make a retry safe even when the failed attempt locked a note.
ATTEMPTS=4; PAUSES=(20 40 60)
speak_retry(){ # $1 text (bash argument, not a process argv), rest: kiosk speak args
  local out attempt
  for attempt in $(seq 1 $ATTEMPTS); do
    out=$(printf '%s' "$1" | python3 -m kiosk speak - "${@:2}" 2>&1) && { echo "$out"; return 0; }
    echo "   speak attempt $attempt failed: $(echo "$out" | grep -E "^devtool|Error|refusing|not the choir" | tail -1 | cut -c1-200)" >&2
    [ $attempt -lt $ATTEMPTS ] && sleep "${PAUSES[$((attempt-1))]}"
  done
  return 1
}
whisper_retry(){ # $1 offering txid (the listener pool has spare notes)
  local out attempt
  for attempt in $(seq 1 $ATTEMPTS); do
    out=$(python3 -m renderer whisper "$1" --wallet $V --text "you are not alone. (rehearsal)" --send-from $L 2>&1) \
      && { echo "$out" | grep -E "^route|^whisper sent|^\(the choir"; return 0; }
    echo "   whisper attempt $attempt failed: $(echo "$out" | tail -1 | cut -c1-200)" >&2
    [ $attempt -lt $ATTEMPTS ] && sleep "${PAUSES[$((attempt-1))]}"
  done
  return 1
}
hashes(){ python3 -m renderer once --wallet "$1" --as-of "${2:-tip}" --out "${3:-out}" ${4:-} 2>/dev/null \
          | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["as_of_height"], d["offerings"], d["skipped"], d["render_hash"])'; }
wait_seen(){ # $1 txid, $2 pattern (offering|skip), $3 max seconds -> renders V repeatedly until the tx shows up
  local t0=$(date +%s)
  while :; do
    python3 -m renderer once --wallet $V --sync --out out >/dev/null 2>/tmp/demo_render.log
    if grep -qE "$2 tx=$1" /tmp/demo_render.log; then grep -E "tx=$1" /tmp/demo_render.log | sed -E 's/^[^ ]+ [^ ]+ INFO //'; echo "   seen after $(( $(date +%s) - t0 ))s"; return 0; fi
    (( $(date +%s) - t0 > $3 )) && return 1
    sleep 15
  done
}

step "preflight"
echo "   connection to lightwalletd: $LWD_CONNECTION"
python3 -m kiosk session status | python3 -c 'import json,sys; s=json.load(sys.stdin); assert s.get("ready") and (s.get("notes_left") or 0)>=1, s; print("   session ready, notes left", s["notes_left"])' || die "no ready kiosk session (python3 -m kiosk session open)"
for W in $B $A $L; do bin/devtool-aegis wallet -w $W sync -s zecrocks --connection "$LWD_CONNECTION" >/dev/null 2>&1 || die "sync $W failed (over $LWD_CONNECTION)"; done
[ -x bin/c2dec ] || die "pinned codec2 missing"
python3 -m kiosk pool $L --notes 3 2>&1 | sed "s/^/   /" ; [ "${PIPESTATUS[0]}" = 0 ] || die "listener pool (python3 -m kiosk pool $L)"
[ $fail = 0 ] || { echo "preflight failed"; exit 1; }
mark preflight

step "1 evoke: baseline from the public key"
BASE=$(hashes $V) && echo "   height offerings skipped render_hash: $BASE" || die "baseline render failed"
mark evoke

step "2 offer: live, from the ephemeral session wallet, with a reply address"
OFFER_OUT=$(printf 'rehearsal %s: i practised this secret until it stopped being one' "$(date -u +%H:%M)" | python3 -m kiosk offer - --reply --yes 2>&1) || die "offer failed: $(echo "$OFFER_OUT" | grep -E "^devtool|Error" | tail -1)"
echo "$OFFER_OUT" | grep -E "^(ghost voice|text|route|sent)"
OFFER_TX=$(echo "$OFFER_OUT" | grep -oE "txid [0-9a-f]{64}" | cut -d' ' -f2)
[ -n "$OFFER_TX" ] || die "no txid from the kiosk"
mark offer

step "3 heard: the public-key renderer picks it up"
if [ -n "$OFFER_TX" ]; then wait_seen "$OFFER_TX" offering 420 || die "offering not seen within 7 min"; fi
mark heard

step "4 whisper: L replies directly; the session inbox receives it"
if [ -n "$OFFER_TX" ]; then
  if whisper_retry "$OFFER_TX"; then
    t0=$(date +%s); ok=0
    for i in $(seq 1 28); do python3 -m kiosk inbox 2>/dev/null | grep -q "a whisper returned for your offering ${OFFER_TX:0:12}" && { ok=1; break; }; sleep 15; done
    [ $ok = 1 ] && echo "   inbox received the whisper after $(( $(date +%s) - t0 ))s" || die "whisper not received within 7 min"
  else die "whisper failed $ATTEMPTS times"; fi
fi
mark whisper

step "5 the god speaks; a forgery is refused"
GOD_OUT=$(speak_retry 'we are many. we forget nothing. (rehearsal)' --from $B)
FORGE_OUT=$(speak_retry 'i am the god. (rehearsal forgery)' --from $A --forge)
GOD_TX=$(echo "$GOD_OUT" | grep -oE "txid [0-9a-f]{64}" | cut -d' ' -f2)
FORGE_TX=$(echo "$FORGE_OUT" | grep -oE "txid [0-9a-f]{64}" | cut -d' ' -f2)
echo "   god ${GOD_TX:-FAILED}  forgery ${FORGE_TX:-FAILED}"
[ -n "$GOD_TX" ] && { wait_seen "$GOD_TX" offering 420 || die "conductor line not seen"; } || die "speak failed"
[ -n "$FORGE_TX" ] && { wait_seen "$FORGE_TX" skip 420 | tee /tmp/demo_forge.txt; grep -q "forged-conductor" /tmp/demo_forge.txt || die "forgery was not refused as forged-conductor"; } || die "forge send failed"
mark god

if [ "${1:-}" != "--skip-summon" ]; then
  step "6 summon: a Watcher from the published key alone"
  H=$(python3 -c 'import json; print(json.load(open("out/score.json"))["score"]["as_of_height"])')
  WATCH=$(mktemp -d wallets/.demo_watcher_XXXX); KEY=$(mktemp)
  python3 -m kiosk reveal --from $B --yes --to "$KEY" >/dev/null 2>&1 || die "reveal failed"
  OURS=$(hashes $V "$H" /tmp/demo_v)
  THEIRS=$(python3 -m renderer summon --key-file "$KEY" --birthday 4502962 --wallet "$WATCH" --as-of "$H" --out /tmp/demo_w 2>/dev/null \
           | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["as_of_height"], d["offerings"], d["skipped"], d["render_hash"])')
  rm -f "$KEY"; rm -rf "$WATCH"
  echo "   this laptop : $OURS"; echo "   the watcher : $THEIRS"
  [ "$OURS" = "$THEIRS" ] && cmp -s /tmp/demo_v/mix.wav /tmp/demo_w/mix.wav && echo "   SAME HASH, SAME AUDIO" || die "watcher differs"
  mark summon
fi

printf "\n== result: %s  total %ss\n   %s\n   log %s\n" "$([ $fail = 0 ] && echo PASS || echo FAIL)" "$(( $(date +%s) - T_START ))" "${TIMES[*]}" "$LOG"
exit $fail
