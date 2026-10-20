# GHOST CHOIR: a god made of secrets
### Refined concept v3 — ZECATHON WILDCARD

v2 disusun 19 Okt 2026 dari dokumen konsep v1 + hasil spike di `SPIKE_LOG.md`.
v3 (20 Okt) memasukkan review eksternal + tiga koreksi tambahan.
Deadline 28 Okt 2026. Tim 2–3 orang, ±12 jam fokus per hari.

---

## v3: perubahan dari review

| # | Masukan | Perubahan di v3 |
|---|---|---|
| R1 | Viewing key publik mengubah arti "rahasia": isinya publik, yang privat adalah **hubungan** pengirim ↔ kontribusi | Framing baru: *"A place to release a secret without attaching your name to it."* Model privasi 3 lapis (§7) |
| R2 | "Operator tidak bisa memalsukan/menghapus" terlalu luas | Klaim dipersempit: **data** tidak bisa dihapus dari chain; **tampilan** dijamin lewat renderer deterministik open-source dengan aturan eksplisit (§6a) |
| R3 | Voice mask bukan jaminan biometrik | Mode utama jadi **teks → TTS lokal**; suara asli + mask jadi mode kedua; rekaman mentah tidak disimpan (§9) |
| R4 | Protokol biner butuh tes ketat | Daftar tes wajib (§5a) |
| R5 | Jangan wajibkan 3 fitur paling berisiko | Vertical slice baru; QR, Codec2-browser, dan konduktor jadi milestone terpisah (§9) |
| R6 | God harus fungsi deterministik dari urutan kontribusi | Spesifikasi urutan, dedup, dan render bit-exact + **hash render** sebagai bukti (§6a) |
| K1 | *(koreksi tambahan)* Deteksi konduktor (S13) butuh **full** viewing key, bukan incoming viewing key | Yang dipublikasikan UFVK dompet paduan suara. Konsekuensi: pengeluaran dompet itu ikut publik → dana kontribusi tidak pernah dipakai selain self-send konduktor, atau dipakai secara transparan (§2, §7) |
| K2 | *(koreksi tambahan)* Korelasi waktu: di ruangan demo, semua tahu siapa yang baru bicara | Ditulis jujur di §7; di dunia nyata ada jeda acak sebelum kirim |
| K3 | *(koreksi tambahan)* Beberapa wallet bisa menyisipkan alamat balasan ke memo | Masuk tes G1: pastikan memo dari QR terkirim persis apa adanya |

---

## 0. TL;DR: apa yang berubah dari v1

| # | v1 | v2 | Alasan |
|---|---|---|---|
| 1 | Dua proyek terpisah (Ghost Choir dan God Made of Secrets) | **Satu karya.** Choir = suaranya, God = tubuhnya. Visual digerakkan oleh audio | Satu pipeline, dua indera. Tidak ada scope ganda |
| 2 | Kontribusi = "fragmen suara apa saja" | Kontribusi = **rahasia yang dibisikkan** (PostSecret, versi suara di dalam amplop tertutup) | Memberi alasan emosional kenapa transaksi shielded *layak dibuat* |
| 3 | Hanya receiver/operator yang bisa membaca memo; viewing key dirahasiakan | **Viewing key paduan suara dipublikasikan.** Siapa pun bisa menyusun ulang karya yang sama persis dari chain | Tanpa server tepercaya. Operator tidak bisa memalsukan atau menghapus kontribusi. "The blockchain is the score." |
| 4 | Payload JSON + base64 | **Format biner 12 byte header**, 500 B audio per memo | JSON + base64 membuang ±40% kapasitas memo |
| 5 | "Wallet & memo harus di-spike" (18–22 jam) | **Sudah terbukti** (S4, S5, S12, S13). Sisa spike ±1 hari | Jam kerja dipindahkan ke seni, audio, dan demo |
| 6 | Risiko "suara bisa dikenali" hanya diakui | **Voice mask lokal** (pitch/formant shift) + Codec2 = suara hantu | Risikonya jadi estetika |
| 7 | Tidak ada keaslian | **Suara Sang Dewa** (baris dari "konduktor") bisa diverifikasi asli; suntikan palsu ditolak (S13) | Momen demo tambahan + anti-spoof |

---

## 1. Konsep

**One-liner.** Sebuah dewa yang tubuh dan suaranya terbuat dari rahasia yang dilepaskan orang-orang, dikirim di dalam amplop tertutup Zcash. Semua orang bisa mendengar rahasianya. Sistem tidak pernah menautkan rahasia itu ke pengirimnya.

**Tagline.** *A place to release a secret without attaching your name to it.*

**Pitch 30 detik.**
> "Sejak 2004, PostSecret mengumpulkan rahasia orang lewat kartu pos anonim. Hari ini, apa pun yang kamu tulis atau ucapkan online bisa dilacak balik, oleh platform, oleh blockchain publik, bahkan oleh AI. Ghost Choir adalah tempat untuk melepaskan sebuah rahasia tanpa menempelkan namamu padanya. Rahasiamu diucapkan oleh suara hantu, dikirim sebagai transaksi shielded, dan menjadi bagian dari dewa yang terus tumbuh. Siapa pun bisa mendengarnya, langsung dari blockchain. Tidak ada daftar yang menghubungkannya denganmu, bahkan di tangan kami."

**Pengalaman.** Layar gelap. Satu dengung. Setiap rahasia yang masuk menambah satu suara ke paduan, dan satu bagian tubuh ke makhluk: cabang, mata, denyut. Makin banyak rahasia, makin hidup dewanya.

---

## 2. Kenapa harus Zcash

1. **Amplop.** Pengirim, penerima, dan nominal terenkripsi. Penerima pun tidak tahu siapa pengirimnya. Itu sifat bawaan Zcash, bukan fitur yang kita bangun.
2. **Viewing key publik = partitur.** Dompet paduan suara mempublikasikan **full viewing key (UFVK)**-nya:
   - Siapa pun bisa membaca semua memo yang masuk dan menyusun ulang karya yang identik.
   - Viewing key ini **tidak** mengungkap pengirim.
   - Nominal kontribusi dibuat **tetap** (misal 0,0001 ZEC), jadi nominal pun tidak bercerita apa-apa.
   - Kenapa *full*, bukan *incoming*: deteksi suara konduktor (poin 3) butuh kemampuan melihat pengeluaran dompet itu sendiri, dan itu hanya ada di full viewing key.
   - Konsekuensinya: **semua pengeluaran dompet paduan suara juga publik.** Aturannya: dana kontribusi hanya dipakai untuk self-send konduktor, atau dipakai secara terbuka (misalnya "semua dana karya ini dikirim ke X"). Ini jadi akuntansi transparan, bukan kebocoran, karena tidak menyentuh identitas kontributor.
3. **Suara Sang Dewa tidak bisa dipalsukan.** Baris narasi dari dompet "konduktor" adalah transaksi yang membelanjakan note milik konduktor sendiri. Pemegang viewing key bisa membedakannya dari kiriman orang luar (S13).
4. **Tes "tanpa Zcash".** Di Ethereum, setiap rahasia terikat ke alamat publik selamanya. Di aplikasi biasa, server tahu akun dan IP-mu. Di dua tempat itu, orang tidak akan berbisik jujur.

---

## 3. Bukti yang sudah ada (dari SPIKE_LOG)

| Kemampuan | Bukti | Status |
|---|---|---|
| Kirim shielded + memo di testnet NU7 | txid `22b168c9…`, blok 4.503.134 | ✅ (pakai devtool + patch NU7) |
| Wallet view-only membaca nominal + memo | wallet V, `Purpose: view-only` | ✅ |
| Suara Codec2: 10,16 detik = 1.019 B (700C) / 1.525 B (1200) | S12a | ✅ |
| 1 transaksi, 3 output, 3 memo audio biner | txid `576ff393…`, blok 4.518.093, **59 detik** broadcast→terlihat, fee 20.000 zat | ✅ |
| Audio disusun ulang identik dari wallet **view-only** | S12c, file `from_chain.wav` | ✅ |
| Transaksi asli konduktor vs kiriman palsu bisa dibedakan | AUTH `08993bf2…` vs SPOOF `d869107b…` | ✅ |

**Gotcha yang sudah diketahui:**
- Memo tidak ada di compact block. Receiver wajib `enhance` (ambil transaksi lengkap).
- Memo biner tampil sebagai `Memo::Future(f5)` di devtool. Byte mentahnya dibaca dari `ironwood_received_notes.memo` di SQLite wallet.
- Spike S12 memakai byte awal `0xF5`, yang menurut ZIP-302 adalah nilai legacy yang ambigu. Protokol v2 memakai `0xFF` (data arbitrer resmi). Perlu satu tes ulang singkat.
- Wallet memotong nol di ujung memo. Panjang payload harus ditulis eksplisit di header.
- Broadcast yang ditolak mengunci note ±40 blok. Siapkan beberapa note kecil.
- Testnet NU7 butuh devtool yang di-patch; mainnet (NU6.3) bisa pakai devtool stok (belum dites, S6).

---

## 4. Yang belum terbukti: spike hari 1 (±6–8 jam)

| # | Spike | Kenapa penting | Fallback |
|---|---|---|---|
| G1 | Kirim memo biner lewat **ZIP-321 QR dari Zashi/Zodl** | Agar orang luar (dan juri) bisa berkontribusi dari HP | Memo teks base64 (±380 B audio per memo), atau kiosk pengirim di laptop |
| G2 | **Codec2 di browser** (kandidat: `@uimaxbai/ffmpeg-core-codec2`, ffmpeg.wasm) | Pendengar bisa memutar langsung di browser tanpa server | Decode di renderer lokal (Node/Python), stream WAV ke halaman |
| G3 | **TTS lokal** (espeak-ng sudah terpasang di spike; kandidat kualitas lebih baik: Piper) + voice mask untuk mode suara asli | Suara manusia adalah biometrik; TTS menghapus suara asli sepenuhnya | espeak-ng saja (robotik, tapi cocok estetika hantu) |
| G6 | **Determinisme**: dua proses renderer terpisah menghasilkan hash render yang sama dari data chain yang sama | Inti klaim "the blockchain is the score" | Turunkan klaim jadi "urutan dan isi identik", tanpa bit-exact audio |
| G7 | Tes ulang memo biner dengan byte awal `0xFF` (S12 pakai `0xF5`) | Kepatuhan ZIP-302 | — |
| G4 | **Kolam note**: 10+ kontribusi beruntun tanpa menunggu konfirmasi | Demo live nggak boleh macet | Pre-split dana ke 20 note sebelum demo |
| G5 | Mainnet dengan devtool stok (S6) | Opsi demo di mainnet kalau testnet bermasalah | Tetap testnet + devtool patch |

**Status 20 Okt (hari 1): G1 ✅ (Zingo, dengan amplop ASCII), G3 ✅ (espeak-ng), G4 ✅ (5 kontribusi/32 detik), G6 ✅ (hash identik V vs B, termasuk audio), G7 ✅. Whisper Back: GO (lihat `ai/whisper-back-spike.md`). Sisa: G2 (Codec2 di browser, opsional) dan G5 (mainnet, opsional). Lihat `SPIKE_LOG.md` → "Day-1 gates".**

---

## 5. Protokol payload v2 (biner)

Satu kontribusi = satu transaksi, 1–3 output ke alamat paduan suara. Satu memo per output.

```
offset  size  field
0       1     0xFF           ZIP-302 marker "arbitrary data" (spike S12 pakai 0xF5 = legacy/ambigu; jangan dipakai)
1       1     0x47 ('G')     magic Ghost Choir
2       1     version        = 1
3       4     contrib_id     acak 32-bit (bukan identitas)
7       1     seq            0..total-1
8       1     total          1..3
9       1     codec          1=C2-700C, 2=C2-1200, 3=C2-1300, 10=teks UTF-8
10      2     len            panjang payload di memo ini (big-endian)
12      ≤500  payload        audio Codec2; memo terakhir diakhiri CRC32 (4 B) seluruh stream
```

- **Kapasitas:** 500 B per memo ≈ 5,7 detik @700C. Maksimal 3 memo ≈ 17 detik per rahasia.
- **Biaya:** ±0,0002 ZEC per rahasia (3 output + change, ZIP-317).
- **Validasi:** magic, versi, `seq < total`, `len ≤ 500`, CRC32 cocok, durasi ≤ batas. Payload yang gagal validasi diabaikan, tidak pernah dieksekusi.
- **Baris konduktor:** format sama, tapi dikirim dari dompet konduktor ke dirinya sendiri. Renderer hanya memperlakukannya sebagai "suara dewa" kalau terdeteksi sebagai spend milik konduktor (S13).
- **Checksum ≠ autentikasi.** CRC32 hanya mendeteksi kerusakan. Siapa yang mengirim dibuktikan terpisah, lewat bukti spend (konduktor) atau tidak sama sekali (kontributor biasa memang anonim).

### 5a. Tes wajib protokol (otomatis, sebelum UI)

- Payload kosong, payload maksimum (500 B), dan 3 memo penuh.
- Memo yang kehilangan byte terakhir; padding nol yang dipotong wallet.
- `len` tidak cocok dengan data; `seq ≥ total`; `total` berubah antar chunk.
- Chunk duplikat, chunk hilang, urutan chunk acak.
- CRC32 gagal; versi atau magic tidak dikenal; codec tidak dikenal.
- `contrib_id` bentrok antar transaksi berbeda (kunci unik tetap `txid`, jadi bentrok tidak merusak).
- Broadcast gagal → note terkunci → pengiriman berikutnya memakai note lain dari kolam.
- Round-trip: encode → memo → decode → PCM sama persis dengan input yang sudah di-encode.

---

## 6. Arsitektur

```
Kontributor (web / kiosk)
  rekam bisikan → voice mask lokal → Codec2 → potong ke memo → header + CRC
        │
        ├─ HP: QR ZIP-321 → Zashi/Zodl kirim shielded           (G1)
        └─ Kiosk: devtool `wallet pay` dari dompet kiosk
        ▼
Zcash (Ironwood shielded pool)  ──  explorer publik: hanya noise
        ▼
Renderer (SIAPA PUN yang memegang viewing key publik)
  sync view-only → enhance → baca memo → validasi → susun stream
        ▼
Komposer deterministik
  urutan = (tinggi blok, indeks tx)  ·  pan/pitch-layer = hash(contrib_id)
        ▼
Audio engine (WebAudio)  +  Makhluk 2D (Canvas), digerakkan energi & pitch audio
```

**Prinsip kunci:** operator hanyalah salah satu renderer. Laptop lain dengan viewing key yang sama akan mendengar dan melihat karya yang **identik**, tanpa server kita.

### 6a. Spesifikasi determinisme ("the blockchain is the score")

**Yang dijamin chain:** transaksi yang sudah tercatat tidak bisa dihapus atau diubah.
**Yang dijamin renderer open-source:** semua orang yang menjalankan kode yang sama atas data chain yang sama mendapat karya yang sama. Operator yang menjalankan renderer lain bisa saja menampilkan hal berbeda, tapi itu akan terbukti beda (lihat hash di bawah).

1. **Penemuan kontribusi:** semua output Ironwood yang masuk ke dompet paduan suara, mulai dari tinggi blok genesis karya, sampai tinggi blok yang disebut eksplisit (`as_of_height`).
2. **Urutan:** `(mined_height, tx_index, action_index)`. Ketiganya sudah tersedia di database wallet (`transactions.tx_index` terverifikasi di DB view-only spike).
3. **Pengelompokan:** chunk dikelompokkan per `txid`. Transaksi dengan chunk tidak lengkap atau CRC gagal = tidak valid, dilewati, dan dicatat di log publik renderer.
4. **Duplikat:** kunci unik = `txid`. Isi identik di transaksi berbeda dihitung sebagai dua kontribusi (sesuai kenyataan di chain).
5. **Tubuh God:** `G_n = F(G_{n-1}, A_n, I_n)`. `A_n` = fitur audio hasil decode (energi, pitch rata-rata, durasi); `I_n` = `contrib_id`; tanpa `Math.random()` atau sumber acak lain.
6. **Audio bit-exact:** Codec2 didekode ke PCM 8 kHz dengan decoder yang sama (versi dikunci), lalu **dimixing offline** dengan aritmetika integer menjadi satu buffer. WebAudio hanya memutar buffer itu, bukan ikut mencampur, karena mixing realtime antar-browser tidak dijamin identik.
7. **Hash render:** renderer mencetak `SHA-256(PCM final ‖ state God final ‖ as_of_height)`. Dua laptop yang mencetak hash yang sama = bukti karya identik. Ini dipakai di demo.
8. **Filter konten:** renderer boleh **melewatkan** kontribusi yang ditandai (daftar `txid` terbuka di repo), tapi tidak pernah mengubah urutan atau isi kontribusi lain. Data aslinya tetap di chain dan tercatat sebagai "disembunyikan" di log publik.

---

## 7. Model privasi (jujur)

**Tiga lapis, dikatakan terang-terangan di UI dan README:**
- **Privat:** hubungan antara identitas pengirim dan kontribusinya. Sistem tidak pernah menyimpan atau menampilkan peta itu.
- **Publik:** isi rahasia (dalam suara hantu/TTS), bagi siapa pun yang memegang viewing key paduan suara, selamanya. Viewing key yang sudah dibagikan tidak bisa ditarik.
- **Tidak dijamin:** bahwa tidak ada orang yang mengenali suaramu, gaya bicaramu, atau isi rahasiamu.

**Korelasi waktu.** Di ruangan demo, semua orang tahu siapa yang baru saja bicara ke mic. Itu konteks panggung, bukan model pemakaian nyata. Di aplikasi publik, pengiriman diberi jeda acak (misal 1–30 menit) agar waktu masuk tidak menunjuk ke orang tertentu.

| Pihak | Bisa lihat | Tidak bisa lihat |
|---|---|---|
| Publik / block explorer | Bahwa ada transaksi shielded | Pengirim, penerima, nominal, isi |
| Pemegang viewing key publik (semua pendengar) | Isi rahasia (sudah disamarkan) + nominal tetap | Pengirim |
| Operator / konduktor | Sama dengan pendengar | Pengirim |
| Server lightwalletd | IP & txid yang diambil renderer | Isi. Mitigasi: mode Tor bawaan devtool |
| Siapa pun yang mengenal suaramu | Mungkin mengenali kalau mask terlalu ringan | — mitigasi: preset mask agresif, opsi teks→TTS |
| Isi rahasia itu sendiri | Rahasia yang menyebut nama/tempat bisa membuka identitas | — mitigasi: peringatan di UI sebelum kirim |

**Konten di chain tidak bisa dihapus.** Renderer menyaring secara lokal (tanpa cloud AI) dan bisa melewatkan kontribusi yang ditandai, tapi data tetap ada di chain. Ini ditulis terang-terangan di README.

**Klaim yang boleh:** "Transaksinya tidak mengungkap siapa kamu, dan suaramu disamarkan."
**Klaim yang dilarang:** "100% anonim."

---

## 8. Demo 3 menit

| Waktu | Yang terjadi | Kalimat |
|---|---|---|
| 0:00–0:20 | Layar gelap, satu dengung. Makhluk hampir tak berbentuk | "Dewa ini terbuat dari rahasia yang belum pernah diucapkan siapa pun." |
| 0:20–0:45 | Juri mengetik (atau membisikkan) sebuah rahasia. Rahasia itu diucapkan ulang oleh suara hantu lokal. Transaksi dikirim, txid muncul | "Rahasiamu sekarang ada di dalam amplop tertutup, tanpa namamu." |
| 0:45–1:05 | Buka block explorer: hanya noise | "Coba cari rahasiamu di sini." |
| 1:05–1:40 | Rahasia-rahasia sebelumnya bernyanyi. Makhluk bernapas | — |
| 1:40–2:05 | ±60 detik kemudian, **bisikan juri masuk ke paduan suara**. Makhluk menumbuhkan bagian baru | "Itu kamu. Dan cuma kamu yang tahu." |
| 2:05–2:30 | Laptop kedua, hanya punya viewing key publik, memutar karya yang sama. **Kedua layar mencetak hash render yang sama** | "Tanpa server. Blockchain adalah partiturnya." |
| 2:30–2:50 | Suara "dewa" palsu disuntik dari dompet luar → ditolak: NOT THE GOD | "Bahkan dewanya tidak bisa dipalsukan." |
| 2:50–3:00 | Makhluk berdiri penuh, paduan suara bergema | "Kamu mendengar semuanya. Kamu tidak akan pernah tahu siapa yang mengucapkannya." |

**Aturan demo:** minimal satu kontribusi benar-benar dikirim live. Kontribusi yang disiapkan sebelumnya disebut apa adanya, jangan disamarkan sebagai transaksi baru.

---

## 9. Scope MVP

**Vertical slice wajib (harus jalan sebelum hari 5)**
1. Kiosk pengirim: **teks → TTS lokal** (mode utama) atau suara asli → mask lokal (mode kedua) → Codec2 → kirim (devtool `pay`). Rekaman mentah tidak pernah disimpan.
2. Satu kontribusi masuk lewat transaksi shielded nyata.
3. Renderer view-only membaca dan merekonstruksi audio dari chain.
4. Komposisi berubah dan God bereaksi.
5. Laptop kedua merekonstruksi karya identik dari viewing key publik, dengan hash render yang sama.
6. README: model privasi 3 lapis, batasan, cara menjalankan.

**Milestone terpisah (masing-masing boleh gagal tanpa membunuh demo)**
- M1: Suara konduktor vs palsu (S13 sudah terbukti; tinggal integrasi).
- M2: Kirim dari HP lewat QR (G1).
- M3: Codec2 di browser (G2).
- M4: Halaman publik "dengarkan dewa" dengan viewing key tertanam.

**Dipotong:** AI generatif, akun, leaderboard, NFT, upload file bebas, 3D, streaming real-time.

---

## 10. Rencana 9 hari (±100 jam tim)

| Hari | Fokus | Output |
|---|---|---|
| 1 (20 Okt) | Spike G1–G5 | Keputusan HP vs kiosk, browser vs lokal |
| 2 | Protokol v2: encoder/decoder + CRC + tes unit | `choir-protocol` lulus round-trip |
| 3 | Renderer view-only + antrean kontribusi | 3 kontribusi testnet terbaca otomatis |
| 4 | Komposer + audio engine | Paduan suara berbunyi dari data chain |
| 5 | Makhluk 2D + integrasi audio→visual | Dewa tumbuh per kontribusi |
| 6 | Kiosk pengirim + voice mask + suara konduktor (S13) | Alur end-to-end live |
| 7 | Review privasi, uji gagal, kolam note, freeze fitur | Demo bisa diulang 5× tanpa campur tangan |
| 8 | Video demo + polish visual & suara | Video final |
| 9 (28 Okt) | README, diagram, submission | Repo publik + submit |

---

## 11. Pembagian kerja

- **A: Zcash.** Kiosk pengirim, renderer view-only, protokol, kolam note, deteksi konduktor.
- **B: Audio & visual.** Voice mask, Codec2, komposer, WebAudio, makhluk 2D.
- **C: Produk & demo.** UI, uji privasi, README, video, naskah panggung.

---

## 12. Untuk penyelenggara (zkSNARKs)

- Prompt Wildcard: *"anything that makes a shielded transaction worth making."* Setiap rahasia adalah alasan emosional untuk membuat transaksi shielded.
- Estetika mereka ("APPARITIONS", "SIGNAL_FORMING", "unstoppable_") adalah dunia Ghost Choir.
- **Roadmap:** satu paduan suara untuk 10.000 shielded identity. Setiap holder punya satu suara di dewa komunitas mereka. Ini menjawab kritik "identitas tanpa utilitas". Verifikasi kepemilikan NFT belum bisa on-chain, jadi bagian ini ditulis sebagai roadmap.

---

## 13. Risiko & mitigasi

| Risiko | Mitigasi |
|---|---|
| Dianggap "cuma simpan audio di chain" | Inti pitch-nya: viewing key publik + karya identik tanpa server + rahasia tak terlacak + dewa yang tak bisa dipalsukan |
| Wallet HP tidak mendukung memo biner | Fallback memo teks base64 atau kiosk (G1) |
| Konfirmasi lambat saat demo | Kontribusi disiapkan sebelumnya + kolam note + status jujur |
| Suara dikenali | Mask agresif, opsi teks→TTS lokal |
| Konten berbahaya permanen di chain | Filter lokal di renderer, kebijakan konten, nominal tetap sebagai anti-spam |
| Codec2 tidak jalan di browser | Decode di renderer lokal |

---

## 14. Prior art & diferensiasi

| Proyek | Apa | Beda dengan Ghost Choir |
|---|---|---|
| PostSecret (sejak 2004) | Rahasia anonim di kartu pos fisik | Kurator tetap tahu cap pos dan memegang semuanya; kita tanpa kurator tepercaya |
| Shielded Wall, Zcash Notes, zmsg | Pesan/catatan teks di memo | Teks, dibaca satu pihak; kita audio + viewing key publik + karya kolektif deterministik |
| Kanvas piksel on-chain (BasePaint, dll.) | Karya kolektif publik | Semua kontributor terlihat; kita tidak |

**Klaim kebaruan kita:** karya suara kolektif yang dirender identik oleh siapa pun dari viewing key publik, dari kontribusi yang pengirimnya tidak bisa dilacak, dengan suara pencipta yang tidak bisa dipalsukan.

---

## 15. Keputusan tim yang dibutuhkan

1. Setuju menggabungkan Choir + God jadi satu karya?
2. Setuju mempublikasikan viewing key paduan suara (mengubah checklist v1)?
3. Testnet (devtool patch) atau mainnet kecil untuk demo?
4. Siapa pegang A / B / C?
5. Nama final: "Ghost Choir", "God Made of Secrets", atau gabungan?
