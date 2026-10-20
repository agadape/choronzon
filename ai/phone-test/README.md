# Tes interop HP (±15 menit) — Whisper Back & G1

Tujuan: tahu apakah wallet HP sungguhan bisa (a) mem-parse alamat Revision 2 `zu…`, (b) memilih receiver shielded dari alamat R0 `u…`, (c) mengirim memo biner dari QR ZIP-321 apa adanya.

Wallet yang bisa dipakai: Zashi atau Zodl (mode/build testnet kalau ada), Zingo! (ada switch testnet di settings), YWallet. Kalau tidak ada wallet testnet di HP, kerjakan **T4 saja** (mainnet, parse-only, tanpa kirim).

Catat hasil tiap tes dengan satu baris: `OK` / `GAGAL: <pesan error persis>` / `TIDAK BISA DICOBA`.

| Tes | Scan | Yang dicek | Kirim? |
|---|---|---|---|
| **T1** | `T1_testnet_R2.png` | Alamat `zutest1…` (R2) diterima di layar kirim? Amount & memo terisi? | Ya, 0.00001 TAZ (kalau punya TAZ) |
| **T2** | `T2_testnet_R0.png` | Alamat `utest1…` (R0, ada transparent receiver) diterima? Wallet bilang "shielded"? | Ya, 0.00001 TAZ |
| **T3** (= G1) | `T3_contribution_binary_memo.png` | QR berisi memo **biner** (header `0xFF`). Wallet menolak? Mengubah memo? Atau mengirim apa adanya? | Ya, 0.00001 TAZ ke dompet paduan suara |
| **T4** | `T4_mainnet_R2_parse_only.png` | **Mainnet.** Cuma lihat: alamat `zu1…` diterima di layar kirim atau ditolak? | **JANGAN kirim** |

Setelah T1–T3 terkirim, kirimkan txid-nya (atau cukup bilang "terkirim jam X"). Aku cek dari sini:
- T1: masuk di wallet A, pool Ironwood?
- T2: masuk ke receiver shielded, bukan transparent?
- T3: wallet V (viewing key publik) mendekode memo sebagai kontribusi valid dengan `contrib_id 3510208332` dan alamat balasan utuh?

Catatan: kalau wallet HP minta "memo teks" dan menolak byte biner, itu sudah jawaban: G1 harus pakai fallback memo teks base64.
