#!/usr/bin/env bash
# S4 — Shielded send A -> B with an encrypted memo. Captures the txid.
# Then B syncs and lists txs: proves memo round-trip + which pool was used (expect Ironwood).
# Also times "broadcast -> visible to B" (real confirmation latency for the demo).
# Usage: ./spikes/s4_send_memo.sh [zatoshis] [memo]
set -uo pipefail
cd "$(dirname "$0")/.."
DT=${DEVTOOL:-bin/devtool-nu7}; CONN=${CONN:+--connection $CONN}; NET=${NET:-test}; SRV=${SRV:-zecrocks}
W=wallets/$NET; AMT=${1:-100000}; MEMO=${2:-"ZECATHON-SPIKE order#42 $(date -u +%s)"}
mkdir -p logs; exec > >(tee -a logs/s4_send_$NET.log) 2>&1

ACC_A=$($DT wallet -w "$W/A" list-accounts | grep -oE '[0-9a-f]{8}-[0-9a-f-]{27}' | head -1)
UA_B=$($DT wallet -w "$W/B" list-addresses | grep -oE '(zu|zutest|u|utest)1[0-9a-z]{60,}' | head -1)
echo "from account: $ACC_A"; echo "to: $UA_B"; echo "amount: $AMT zat"; echo "memo: $MEMO"

$DT wallet -w "$W/A" sync -s "$SRV" $CONN
T0=$(date +%s)
$DT wallet -w "$W/A" send "$ACC_A" -i "$W/A.age" --address "$UA_B" --value "$AMT" --memo "$MEMO" -s "$SRV" $CONN \
  || { echo "SEND_FAILED (copy the error into SPIKE_LOG)"; exit 1; }

echo "== polling B until the tx shows up =="
for i in $(seq 1 40); do
  $DT wallet -w "$W/B" sync -s "$SRV" $CONN >/dev/null 2>&1
  if $DT wallet -w "$W/B" list-tx | grep -q "$(echo "$MEMO" | cut -c1-20)"; then
    echo "SEEN_BY_B after $(( $(date +%s) - T0 ))s"; break
  fi
  sleep 15
done
$DT wallet -w "$W/B" list-tx | tail -40
echo "Paste the txid into a testnet explorer and screenshot it (evidence)."
