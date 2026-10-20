#!/usr/bin/env bash
# S5 — View-only verification: export B's UFVK, create wallet V (no spend key) from it,
# sync, and check V sees the same incoming payment + memo from S4.
# This is the primitive behind: merchant verification servers, auditor views,
# "prove you paid" receipts, sealed-bid books with a published viewing key.
set -uo pipefail
cd "$(dirname "$0")/.."
DT=${DEVTOOL:-bin/devtool-nu7}; CONN=${CONN:+--connection $CONN}; NET=${NET:-test}; SRV=${SRV:-zecrocks}; W=wallets/$NET
mkdir -p logs; exec > >(tee -a logs/s5_viewonly_$NET.log) 2>&1

$DT wallet -w "$W/B" list-accounts > logs/s5_accounts_B.txt
UFVK=$(grep -oE 'UFVK: [a-z]+1[0-9a-z]+' logs/s5_accounts_B.txt | head -1 | cut -d' ' -f2)
[ -z "$UFVK" ] && { echo "NO_UFVK in list-accounts output -> check logs/s5_accounts_B.txt"; exit 1; }
echo "UFVK prefix: ${UFVK:0:16}…  (never commit the full key)"
BDAY=${BIRTHDAY:-}   # set to a height a bit before the S4 tx to speed up sync

[ -d "$W/V" ] || $DT wallet -w "$W/V" init-fvk --name spike-V --fvk "$UFVK" ${BDAY:+--birthday $BDAY} -s "$SRV" $CONN
time $DT wallet -w "$W/V" sync -s "$SRV" $CONN
$DT wallet -w "$W/V" balance
$DT wallet -w "$W/V" list-tx | tail -40
echo "PASS if the S4 memo and amount appear above with no spending key present."
