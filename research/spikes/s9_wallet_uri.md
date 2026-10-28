# S9 — ZIP-321 payment URI → real mobile wallet (manual, ~20 min)

Why: every payments/markets idea ends with "user scans a QR in Zashi/Zodl". If the
wallet ignores the memo or the amount, the demo breaks. Prove it on a real phone.

1. Take wallet B's UA from S3 (testnet) — or your own mainnet UA for the mainnet run.
2. Build the URI (memo is base64url, no padding):
   ```
   node -e "const m=Buffer.from('ZECATHON order#42').toString('base64url');console.log('zcash:'+process.argv[1]+'?amount=0.001&memo='+m+'&label=spike')" <UA>
   ```
3. Turn it into a QR (any generator, or `npx qrcode-terminal "<uri>"`).
4. Scan with each wallet you have. Record per wallet:
   | Wallet | Network | Amount prefilled? | Memo prefilled? | Sent to Ironwood? | txid |
   |---|---|---|---|---|---|
   | Zashi / Zodl | | | | | |
   | Zingo! | | | | | |
   | Cake / Edge / YWallet | | | | | |
5. Testnet note: check whether the wallet even has a testnet mode. If none does, the
   mobile part of the demo must run on **mainnet** with small amounts → log that as ⚠️.
6. Multi-recipient URI (`address.1=…&amount.1=…`): does any wallet support it? (payroll / split-pay lanes)
