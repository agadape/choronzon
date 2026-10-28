#!/usr/bin/env bash
# Whisper Back spike harness. Real testnet txs via the NU7-patched devtool. Roles:
#   A = contributor (has reply destination A2 = fresh diversified UA from `generate-address`)
#   B = choir wallet (its FULL viewing key is "public": wallet V holds only that key)
#   V = anyone holding the public viewing key (the "listener's reader")
#   L = listener's own spending wallet (sends the reply)
# Usage: wb_harness.sh contribute "<secret text>"   |  wb_harness.sh read-as-V  |  wb_harness.sh reply "<text>"  |  wb_harness.sh check-A
set -uo pipefail
cd "$(dirname "$0")/.."
DT=${DEVTOOL:-bin/devtool-aegis}; S="-s zecrocks --connection socks5://127.0.0.1:1080"; W=wallets/test
mkdir -p logs; exec > >(tee -a logs/wb_harness.log) 2>&1
echo "== $(date -u +%FT%TZ) $*"
acct() { $DT wallet -w "$W/$1" list-accounts 2>/dev/null | grep -oE '[0-9a-f]{8}-[0-9a-f-]{27}' | head -1; }
ua()   { $DT wallet -w "$W/$1" list-addresses 2>/dev/null | grep -oE '(zu|u)test1[0-9a-z]{60,}' | head -1; }
memos_of() { # $1 wallet, $2 txid-prefix -> raw memo bytes as hex lines (received notes only)
  python3 - "$W/$1/data.sqlite" "$2" <<'EOF'
import sqlite3,sys
c=sqlite3.connect(sys.argv[1]); p=sys.argv[2].lower()
rows=c.execute("select n.action_index, n.memo from ironwood_received_notes n join transactions t on t.id_tx=n.transaction_id where lower(hex(t.txid)) like ? or lower(hex(t.txid)) like ?", ('%'+p+'%', '%'+bytes.fromhex(p)[::-1].hex()+'%' if len(p)%2==0 else 'x')).fetchall()
for i,m in sorted(rows): print(i, bytes(m).hex())
EOF
}

case "${1:-}" in
  contribute)
    A2=$(grep -oE 'Address: [a-z]+1[0-9a-z]+' logs/wb_genaddr_A.txt | head -1 | cut -d' ' -f2)
    UA_B=$(ua B); ACC_A=$(acct A)
    read -r CID MEMO_B64 < <(python3 - "$2" "$A2" <<'EOF'
import sys; sys.path.insert(0,"spikes"); import wb_protocol as p
cid, ms = p.encode_contribution(sys.argv[1].encode(), p.CODEC_TEXT, sys.argv[2])
assert len(ms)==1; print(cid, p.b64url(ms[0]))
EOF
)
    echo "contrib_id=$CID reply_addr=${A2:0:16}… memo_len=$(( ${#MEMO_B64} * 3 / 4 ))B"; echo "$CID" > logs/wb_cid.txt
    $DT wallet -w "$W/A" sync $S >/dev/null 2>&1
    echo y | $DT wallet -w "$W/A" pay "$ACC_A" -i "$W/A.age" --payment-uri "zcash:$UA_B?amount=0.00001&memo=$MEMO_B64" $S 2>&1 | grep -E "^[0-9a-f]{64}$|^Error|Pool:" | tee logs/wb_tx2_contrib.txt
    ;;
  read-as-V)
    TX=$(grep -oE '^[0-9a-f]{64}$' logs/wb_tx2_contrib.txt | head -1)
    $DT wallet -w "$W/V" sync $S >/dev/null 2>&1; $DT wallet -w "$W/V" enhance $S >/dev/null 2>&1
    memos_of V "$TX" > logs/wb_V_memos.txt; cat logs/wb_V_memos.txt | cut -c1-80
    python3 - <<'EOF'
import sys; sys.path.insert(0,"spikes"); import wb_protocol as p
ms=[bytes.fromhex(l.split()[1]) for l in open("logs/wb_V_memos.txt") if l.strip()]
d=p.decode_contribution(ms); print("V decoded:", {k:(v[:40]+"…" if isinstance(v,str) and len(v)>40 else v) for k,v in d.items()})
open("logs/wb_reply_target.txt","w").write(d["reply_addr"]); open("logs/wb_cid_fromV.txt","w").write(str(d["contrib_id"]))
EOF
    ;;
  reply)
    TARGET=$(cat logs/wb_reply_target.txt); CID=$(cat logs/wb_cid_fromV.txt); ACC_L=$(acct L)
    MEMO_B64=$(python3 -c "import sys; sys.path.insert(0,'spikes'); import wb_protocol as p; print(p.b64url(p.encode_reply(int('$CID'), '''$2'''.encode())))")
    $DT wallet -w "$W/L" sync $S >/dev/null 2>&1; $DT wallet -w "$W/L" balance 2>&1 | grep -E "Ironwood Spendable"
    echo y | $DT wallet -w "$W/L" pay "$ACC_L" -i "$W/L.age" --payment-uri "zcash:$TARGET?amount=0.00001&memo=$MEMO_B64" $S 2>&1 | grep -E "^[0-9a-f]{64}$|^Error|Pool:|\] ->" | sed -E 's/((zu|u)test1[0-9a-z]{12})[0-9a-z]+/\1…/g' | tee logs/wb_tx3_reply.txt
    ;;
  check-A)
    TX=$(grep -oE '^[0-9a-f]{64}$' logs/wb_tx3_reply.txt | head -1)
    $DT wallet -w "$W/A" sync $S >/dev/null 2>&1; $DT wallet -w "$W/A" enhance $S >/dev/null 2>&1
    $DT wallet -w "$W/A" list-tx 2>/dev/null | awk -v t="$TX" '$0 ~ t {p=1} /^[0-9a-f]{64}$/ && $0 !~ t {p=0} p' | sed -E 's/((zu|u|tu)test1[0-9a-z]{12})[0-9a-z]+/\1…/g' | cut -c1-120
    memos_of A "$TX" > logs/wb_A_reply_memo.txt
    python3 - <<'EOF'
import sys, sqlite3; sys.path.insert(0,"spikes"); import wb_protocol as p
ms=[bytes.fromhex(l.split()[1]) for l in open("logs/wb_A_reply_memo.txt") if l.strip()]
r=p.decode_reply(ms[0]); print("A decoded reply:", r, "matches contrib_id:", str(r["contrib_id"])==open("logs/wb_cid.txt").read().strip())
c=sqlite3.connect("wallets/test/A/data.sqlite")
print("A: received-at address diversifier index for reply note:",
  c.execute("select hex(a.diversifier_index_be) from ironwood_received_notes n join addresses a on a.id=n.address_id join transactions t on t.id_tx=n.transaction_id where n.memo=?", (ms[0],)).fetchall())
EOF
    ;;
  *) echo "usage: contribute|read-as-V|reply|check-A";;
esac
