#!/usr/bin/env bash
# S3 — Create two throwaway TESTNET wallets (A = payer, B = merchant), print their
# Unified Addresses, then sync. Fund A from the faucet between steps.
# Usage:
#   ./spikes/s3_wallets.sh init      # create A and B, print addresses
#   (faucet: https://faucet.testnet.valargroup.dev  -> send TAZ to wallet A's UA)
#   ./spikes/s3_wallets.sh sync      # sync both, show balances (needs faucet tx mined)
# DEVTOOL env picks the binary: bin/devtool-nu7 (default) or bin/devtool-main.
set -uo pipefail
cd "$(dirname "$0")/.."
DT=${DEVTOOL:-bin/devtool-nu7}; CONN=${CONN:+--connection $CONN}
NET=${NET:-test}
SRV=${SRV:-zecrocks}        # devtool maps 'zecrocks' + test -> testnet.zec.rocks:443
W=wallets/$NET; mkdir -p "$W" logs
exec > >(tee -a logs/s3_wallets_$NET.log) 2>&1
echo "== $(date -u +%FT%TZ) $1 on $NET with $DT =="

case "${1:-}" in
  init)
    for n in A B; do
      [ -d "$W/$n" ] && { echo "$n exists, skip"; continue; }
      $DT wallet -w "$W/$n" init --name "spike-$n" -i "$W/$n.age" -n "$NET" -s "$SRV" $CONN
    done
    for n in A B; do echo "--- wallet $n ---"; $DT wallet -w "$W/$n" list-addresses; done
    echo "NEXT: fund wallet A from the faucet, wait ~1-2 min, then run: $0 sync"
    ;;
  sync)
    for n in A B; do
      echo "--- sync $n ---"; time $DT wallet -w "$W/$n" sync -s "$SRV" $CONN
      $DT wallet -w "$W/$n" balance
    done
    ;;
  *) echo "usage: $0 init|sync"; exit 1;;
esac
