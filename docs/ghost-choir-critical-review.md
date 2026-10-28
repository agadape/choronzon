# Critical Review: Ghost Choir — A God Made of Secrets
### Dijalankan atas `ghost-choir-refined.md` v3, 20 Okt 2026

Peran yang dipakai: strategist hackathon, product thinker, privacy engineer, analis revenue. Instruksi: jangan membela ide. Dokumen ini memisahkan **fakta** (terbukti di spike atau sumber), **asumsi**, dan **opini strategis**.

---

## 1. Executive verdict

**Potential wildcard fit, but needs repositioning. Keputusan: KEEP + REFINE, bukan pivot.**

Alasan singkat:
- Secara pengalaman, ini memang karya seni partisipatif dan ritual sosial, bukan demo teknis berkedok seni. Sudah ada bukti permintaan untuk bentuk ini (PostSecret, 2004–sekarang; aplikasi Secret 2014–2015).
- Tapi argumen "kenapa transaksi shielded layak dibuat" di v3 masih **bermanfaat untuk verifikator**, bukan untuk peserta. Peserta tidak merasakan bedanya kalau rahasianya masuk ke database atau ke chain. Itu celah terbesar di hadapan juri.
- Ada satu mekanik yang belum dipakai dan hanya mungkin di Zcash: **balasan anonim dua arah** lewat alamat sekali-pakai di dalam memo. Dengan itu, transaksi shielded punya konsekuensi yang dirasakan peserta, dan proyek punya alasan untuk dibuka lagi hari Senin.
- Revenue tidak boleh jadi prioritas 9 hari ini. Jalur yang kredibel adalah komisi instalasi dan hibah ekosistem, bukan SaaS.

---

## 2. Apakah ini benar-benar memenuhi track WILDCARD?

**Pertanyaan: seni/game/sosial, atau demo teknis dengan antarmuka seni?**
Seni dan sosial. Mekanik intinya (melepaskan rahasia, rahasia jadi bagian tubuh kolektif) berdiri sendiri sebagai pengalaman. Blockchain tidak terlihat oleh peserta. Itu tanda yang sehat, bukan kelemahan.

**Pertanyaan: kalau Zcash diganti database, API terpusat, atau layanan upload anonim, apa yang hilang?**
Jawaban jujur, dipisah per pihak:

| Yang hilang | Siapa yang merasakan | Seberapa kuat |
|---|---|---|
| Operator **secara kriptografis** tidak bisa tahu pengirim (bukan janji kebijakan "kami tidak menyimpan log") | Peserta, tapi hanya kalau diberi tahu dan mempercayainya | Sedang. PostSecret pun "cukup anonim" bagi jutaan orang tanpa kriptografi |
| Korpus karya permanen, tidak bisa dihapus/diubah operator, bisa diverifikasi siapa pun lewat viewing key | Penonton, kurator, juri | Kuat secara konsep, lemah secara emosi |
| Suara konduktor tidak bisa dipalsukan | Penonton | Kecil; ini fitur demo, bukan alasan hidup proyek |
| Tidak perlu akun, email, nomor HP | Peserta | Sedang; layanan Tor-form juga bisa |

Kesimpulannya: **versi v3 belum memberi peserta satu pun konsekuensi yang hanya mungkin karena Zcash.** Semua keunggulan Zcash di v3 adalah keunggulan untuk orang yang *menonton*, bukan yang *mengaku*.

**Pertanyaan: apakah privasi mekanik fundamental, atau cuma fitur di pitch?**
Setengah-setengah. Privasi pengirim adalah prasyarat (tanpa itu tidak ada yang berani mengaku), tapi bukan *mekanik*. Mekanik adalah sesuatu yang terjadi *karena* properti itu. Di v3 tidak ada.

**Pertanyaan: apakah transaksinya menghasilkan aksi/konsekuensi/transformasi?**
Transformasi: ya (suara masuk ke paduan, God tumbuh). Interaksi: tidak. Setelah mengirim, peserta selesai. Tidak ada alasan kembali.

**Pertanyaan: menarik untuk orang yang tidak peduli blockchain?**
Ya, dengan syarat suaranya enak didengar. PostSecret membuktikan daya tarik pengakuan anonim: dipamerkan sampai ke Smithsonian National Postal Museum dan galeri-galeri. Risiko: kalau TTS terdengar murahan, pengalaman runtuh.

**Pertanyaan: juri ingat privasinya, atau cuma presentasinya?**
Dengan v3: presentasinya. Momen "hash identik di dua laptop" bagus untuk kredibilitas teknis, tapi bukan momen privasi yang terasa. Momen privasi yang terasa harus ada di sisi peserta.

**Pertanyaan: menggabungkan Choir + God memperkuat atau memperumit?**
Memperkuat *metafora* ("dewa yang terbuat dari rahasia" lebih mudah diingat daripada "paduan suara anonim"), tapi **berisiko memperumit build.** God harus dibatasi jadi visualizer deterministik sederhana (maksimal ±15% jam tim). Kalau God makan lebih dari itu, pisahkan lagi.

**Verdict bagian ini: Potential wildcard fit, needs repositioning.** Pindahkan alasan "worth making" dari penonton ke peserta.

---

## 3. Apa yang membuat transaksi shielded layak dibuat di sini?

### 3a. Yang sudah ada di v3 (sah, tapi untuk penonton)
1. Pengirim tidak bisa ditautkan ke rahasianya, bahkan oleh operator. Terbukti di spike S4/S5: wallet penerima dan view-only hanya melihat nominal + memo, tanpa pengirim.
2. Korpus tidak bisa dihapus/diubah; siapa pun merender ulang karya identik (S12c + spesifikasi §6a).
3. Suara konduktor tidak bisa dipalsukan (S13).

### 3b. Yang hilang: konsekuensi untuk peserta. Usulan: **"Whisper Back"**
Mekaniknya:
- Saat mengirim rahasia, kiosk/wallet menyertakan satu **alamat diversified sekali-pakai** milik pengirim di memo terakhir (~140 byte; masih muat).
- Alamat diversified Zcash tidak bisa ditautkan ke alamat lain dari wallet yang sama. Jadi alamat itu publik (lewat viewing key paduan suara) tanpa membuka siapa pemiliknya.
- Siapa pun yang mendengar rahasia itu bisa menekan "whisper back": wallet-nya mengirim memo shielded langsung ke alamat tersebut. Balasan **tidak** lewat dompet paduan suara, jadi tidak terbaca oleh viewing key publik.
- Pengirim rahasia melihat balasan di wallet-nya sendiri (Zashi/Zodl menampilkan memo). Ia tidak tahu siapa yang membalas. Pembalas tidak tahu siapa yang mengaku. Operator tidak melihat apa pun.

Kenapa ini mengubah verdict:
- Ini **hanya mungkin dengan memo shielded + alamat diversified**. Database tidak bisa memberi dua orang asing saluran privat tanpa operator yang memegang keduanya.
- Transaksi shielded kedua (balasan) punya alasan emosional: menghibur orang asing.
- Proyek punya "hari Senin": orang kembali untuk mengecek apakah ada yang membalas.
- Biaya build kecil: satu field di memo, satu tombol yang membuat URI ZIP-321.

Risiko mekanik ini: alamat balasan publik bisa menerima memo kasar. Mitigasi: kiosk membuat alamat "kotak surat" terpisah dari dana utama; UI menandai balasan sebagai "dari orang asing"; dan ini harus ditulis jujur. Lihat anti-pattern di §4.

### 3c. Alternatif ritual (tanpa kode tambahan): **reveal viewing key di akhir**
Selama sesi (misal 30 menit), viewing key dirahasiakan. Penonton hanya melihat jumlah rahasia bertambah. Di akhir, konduktor **mempublikasikan viewing key**: sejak detik itu, siapa pun selamanya bisa mendengar semuanya, dan tidak bisa ditarik lagi. Ini mengubah sifat "viewing key tidak bisa dicabut" dari risiko menjadi klimaks dramatis. Catatan: selama sesi, operator harus dipercaya tidak membocorkan lebih awal. Nyatakan itu.

---

## 4. Analisis revenue

**Prinsip:** jangan paksakan SaaS. Ini karya seni partisipatif. Pemisahan waktu:

### 4a. Selama hackathon
Nol. Satu-satunya "revenue" adalah hadiah ($15K track + kemungkinan grand prize $20K). Dibayar dalam ZEC ke alamat shielded. Itu saja.

### 4b. Pasca-hackathon yang kredibel (butuh validasi, belum terbukti)

| Model | Siapa bayar | Bayar untuk apa | Kenapa tidak pakai yang gratis | Cara menjangkau | Biaya/beban | Mengganggu privasi? | Bisa diuji tim 2–3 orang? |
|---|---|---|---|---|---|---|---|
| **Komisi instalasi event** | Penyelenggara festival seni digital, konferensi crypto (Zcon, Devcon art track), museum | Instalasi interaktif yang hidup selama event; karya akhir sebagai artefak | Tidak ada versi gratis yang datang dengan tim, hardware, dan kurasi | Zcon7 (27–29 Okt 2026) berlangsung saat deadline; hubungi panitia untuk 2027. PostSecret sudah dipamerkan di museum; format ini terbukti bisa masuk institusi | Hardware kiosk, perjalanan, moderasi konten live | Tidak, selama kiosk ephemeral | Ya, 1–2 gig per tahun realistis |
| **Hibah / komisi ekosistem** | Zcash Community Grants (ada program retroaktif per kuartal), zkSNARKs (treasury 1.000 NFT untuk hibah/artis per laporan auction) | Karya publik yang menaikkan penggunaan shielded dan memberi utilitas komunitas | Mereka membayar untuk hal yang mereka ingin ada | Proposal setelah hackathon; zkSNARKs punya motif kuat (kritik "tanpa utilitas") | Laporan, milestone | Tidak | Ya; ini jalur paling realistis |
| **Edisi karya** | Kolektor | Rekaman/cetakan komposisi final per "season" (bukan NFT per rahasia; peta kepemilikan justru dihindari) | Keunikan: tiap season tidak bisa diulang | Komunitas Zcash, Zilkroad | Produksi kecil | Tidak, karya kolektif tanpa pengirim | Ya, tapi permintaan belum terbukti |
| **Artist toolkit** (protokol + renderer open-source untuk seniman lain) | Kemungkinan besar tidak ada yang bayar; hibah lagi | — | — | — | — | — | Sebagai reputasi, bukan revenue |
| **Fee per rahasia** | Peserta | — | Tidak masuk akal; nominal harus tetap dan kecil demi privasi dan anti-spam | — | — | **Ya**, kalau nominal bervariasi | Tidak direkomendasikan |

### 4c. Spekulatif jangka panjang
"Confession as a service" untuk komunitas (gereja, kampus, perusahaan) yang mau ruang pengakuan anonim yang bisa diaudit tanpa membuka pengirim. Menarik, tapi tidak boleh dijanjikan sekarang. Dan anti-pattern di bawah berlaku.

### 4d. Anti-pattern yang harus disebut di pitch
Aplikasi **Secret** (2014) mengumpulkan ±$35 juta, lalu tutup April 2015 karena menjadi sarang perundungan. Pelajarannya: anonimitas + sosial tanpa gesekan = racun. Ghost Choir punya dua rem bawaan: setiap rahasia berbiaya (transaksi), dan tidak ada feed/target (rahasia melebur jadi paduan suara, bukan postingan tentang orang lain). Tetap harus ada aturan konten dan filter renderer.

**Kesimpulan revenue:** jangan jadikan prioritas. Langkah yang tepat setelah submission: satu proposal hibah ZCG/zkSNARKs untuk "Season 1 untuk holder", dan satu email ke panitia Zcon untuk instalasi 2027.

---

## 5. Alternatif strategis

| # | Arah | Inti perubahan |
|---|---|---|
| A | **Keep v3 apa adanya** | Paduan suara + God, viewing key publik, konduktor |
| B | **v3 + Whisper Back** (§3b) | Rahasia bisa dibalas anonim dua arah; satu field memo + satu tombol |
| C | **Séance: performa live dengan reveal** (§3c) | Sesi 30 menit, viewing key dipublikasikan di akhir sebagai klimaks; cocok untuk instalasi |
| D | **Game konsekuensi: "The God answers"** | Setiap N rahasia, konduktor (suara dewa, terautentikasi) membalas salah satu rahasia secara publik; peserta tidak tahu rahasia siapa yang dipilih. Risiko: terasa dibuat-buat, dan butuh manusia di balik dewa |
| E | **Pivot: BLACKBOX** (perekam saksi yang tidak bisa disita; audio dialirkan ke memo, dibaca pengawal via viewing key) | Usefulness tertinggi, seni terendah; menjawab track lewat "hardware/social" tapi bukan art |

Arah yang **tidak** direkomendasikan: insentif finansial per rahasia, token, atau NFT per kontribusi. Semuanya melawan prinsip "nominal tidak bercerita" dan prompt review ini sendiri.

---

## 6. Scorecard komparatif (1–10)

| Dimensi | A: v3 | B: +Whisper Back | C: Séance | D: God answers | E: BLACKBOX |
|---|---|---|---|---|---|
| Wildcard fit | 7 | **9** | 8 | 7 | 5 |
| Shielded tx esensial | 6 | **9** | 7 | 7 | 8 |
| Demo live | 8 | 8 | **9** | 7 | 9 |
| Daya tarik pengguna | 7 | **8** | 7 | 6 | 6 |
| Revenue | 4 | 5 | **6** | 4 | 6 |
| Risiko privasi (10 = paling aman) | 6 | 5 | 6 | 6 | 5 |
| Feasibility 100 jam | **8** | 7 | 8 | 5 | 6 |
| **Total** | 46 | **51** | 51 | 42 | 45 |

Penjelasan skor kunci:
- **B menang di "esensial"** karena balasan anonim dua arah tanpa operator adalah hal yang database tidak bisa lakukan; A kalah di sini karena keunggulan Zcash-nya hanya untuk penonton.
- **C menang di demo** karena reveal viewing key adalah klimaks yang terasa, tapi C tanpa B tetap tidak memberi peserta alasan kembali.
- **B lebih berisiko privasi** daripada A: alamat balasan publik bisa disalahgunakan. Masih di atas ambang asal dinyatakan jujur.
- **D** butuh manusia di balik dewa secara terus-menerus dan terasa diskenariokan. Skor feasibility rendah bukan karena kode, tapi karena desain belum matang.
- **E** kuat sebagai produk, lemah sebagai Wildcard. Kalau tim ingin menang lewat "usefulness", ini pilihan; tapi tim sudah memilih arah seni.

**Rekomendasi: B, dengan C sebagai format demo.** Keduanya kompatibel: Whisper Back adalah mekanik, Séance adalah dramaturgi.

---

## 7. Positioning dan pitch yang direkomendasikan

**Positioning (satu kalimat):**
> Ghost Choir adalah tempat melepaskan sebuah rahasia tanpa menempelkan namamu padanya. Rahasiamu menjadi suara di dalam dewa kolektif, dan orang asing bisa membalasnya tanpa kalian berdua pernah saling tahu.

**Tiga klaim yang boleh diucapkan (semuanya terbukti atau dapat dibuktikan):**
1. "Kami, operator, **tidak bisa** tahu siapa yang mengirim. Bukan tidak mau. Tidak bisa." (S4/S5)
2. "Siapa pun dengan kunci ini bisa merender ulang seluruh karya dan mendapat hash yang sama. Kami tidak bisa menghapus atau mengubah satu rahasia pun." (§6a, G6)
3. "Balasan ke rahasiamu datang langsung ke wallet-mu. Tidak lewat kami. Tidak lewat siapa pun." (Whisper Back; perlu satu spike)

**Tiga hal yang wajib diucapkan sendiri sebelum juri menanyakannya:**
1. Isi rahasia publik bagi pemegang viewing key, selamanya. Yang privat adalah hubunganmu dengan rahasia itu.
2. Suara dan isi bisa mengungkap identitas. Karena itu mode utama adalah teks → suara hantu.
3. **Wallet pengirim menyimpan memo yang ia kirim.** Siapa pun yang memegang perangkat atau seed-mu bisa menautkanmu ke rahasiamu. Kiosk memakai wallet ephemeral; pengguna HP diperingatkan.

Poin 3 belum ada di v3 dan harus ditambahkan. Terverifikasi di spike: tabel `sent_notes` di database wallet menyimpan memo keluar.

---

## 8. Minimum viable demo untuk 9 hari

Urutan prioritas, bukan daftar fitur:

1. **Hari 1–2:** gate spike (`0xFF`, kolam note, determinisme/hash, TTS lokal) + **spike Whisper Back**: alamat diversified di memo, balasan diterima di wallet pengirim. Kalau Whisper Back gagal dalam 4 jam, jatuhkan ke arah A+C.
2. **Hari 3–4:** renderer view-only + komposer offline + hash render. Dua proses, satu hash.
3. **Hari 5:** God 2D minimal (tiga parameter visual dari fitur audio). Batasi 12 jam total.
4. **Hari 6:** kiosk pengirim ephemeral (teks → TTS → Codec2 → kirim) + tombol Whisper Back di renderer.
5. **Hari 7:** latihan Séance 5× penuh, termasuk reveal viewing key dan satu transaksi live. Freeze.
6. **Hari 8–9:** video, README (model privasi 3 lapis + poin "wallet-mu mengingat"), submission.

Yang dibuang kalau waktu habis, berurutan: Codec2 di browser → QR dari HP → suara konduktor → God (ganti visualizer sederhana).

**Risiko tunggal terbesar yang bisa membuat juri mengabaikan proyek:** juri menyimpulkan *"ini audio visualizer dengan penyimpanan on-chain, dan kalian justru mempublikasikan memonya; kenapa Zcash?"* Jawaban harus siap dalam 15 detik dan menunjuk ke tiga klaim di §7. Kalau Whisper Back jalan, pertanyaan itu terjawab sebelum ditanya.

---

## 9. Asumsi yang harus divalidasi + pertanyaan ke calon pengguna

| Asumsi | Cara validasi murah (≤1 hari) |
|---|---|
| Orang mau mengetik rahasia sungguhan di kiosk/halaman publik | Uji dengan 10 orang (bukan anggota tim) memakai kiosk testnet; hitung berapa yang mengirim rahasia nyata vs lelucon |
| Suara hantu/TTS terasa "melepaskan", bukan mengejek | Perdengarkan 3 preset ke 10 orang yang sama; tanya satu kata yang muncul |
| Permanensi (tidak bisa dihapus) tidak membuat orang mundur | Tanyakan setelah mereka tahu: "masih mau kirim?" |
| Balasan anonim diinginkan, bukan ditakuti | Tanyakan: "mau orang asing bisa membalas rahasiamu?" |
| zkSNARKs mau mengomisi "Season untuk holder" | Satu email ke bladet928@gmail.com setelah submission |
| Festival/konferensi mau instalasi | Satu email ke panitia Zcon untuk 2027 |

Pertanyaan ke pengguna (pakai apa adanya):
1. "Apa yang membuatmu merasa aman mengirim rahasia ini?"
2. "Kalau kamu tahu siapa pun bisa mendengarnya selamanya, apa yang berubah?"
3. "Kalau ada yang membalas, kamu ingin tahu siapa, atau justru tidak?"
4. "Apa yang membuatmu kembali besok?"

---

## 10. Rekomendasi akhir

**REFINE. Tidak pivot, tidak abandon.**

- Pertahankan gabungan Choir + God, dengan God dibatasi ketat.
- Tambahkan **Whisper Back** sebagai mekanik yang membuat transaksi shielded layak dibuat *oleh peserta*, bukan hanya diverifikasi penonton.
- Pakai **Séance** (reveal viewing key) sebagai format demo dan instalasi.
- Tambahkan klaim jujur yang hilang: wallet pengirim mengingat memo keluar.
- Revenue: hibah dan komisi instalasi setelah hackathon. Jangan bangun apa pun untuk revenue dalam 9 hari ini.

Kalau Whisper Back gagal di spike hari 1, proyek tetap layak dikirim sebagai A+C, tapi dengan verdict yang lebih rendah: wildcard fit 7–8, bukan 9.

---

### Sumber
- PostSecret di Smithsonian National Postal Museum: https://dashboard.si.edu/es/newsdesk/releases/national-postal-museum-sharing-secrets-around-world
- Pameran PostSecret di galeri (SC4A): https://sc4a.org/event/postsecret/exhibit/
- Secret app tutup (PCWorld, Apr 2015): https://www.pcworld.com/article/427217/secret-an-app-for-anonymous-posts-shuts-down.html
- Investor Secret dapat uang kembali (Marketplace): https://marketplace.org/2015/04/30/investors-secret-get-some-money-back
- ZCG Retroactive Grants Q2 2026: https://forum.zcashcommunity.com/t/coinholder-directed-retroactive-grants-program-q2-2026-now-accepting-proposals/55328
- zkSNARKs treasury 1.000 NFT untuk hibah/artis: https://airdropalert.com/blogs/zksnarks-nft-zcash-blind-auction/
- Zcon7, 27–29 Okt 2026, Cancún: https://zechub.substack.com/p/zcash-shielded-news-vol4-0a5
- ZIP-302 (memo `0xFF`): https://zips.z.cash/zip-0302
- Bukti spike S4/S5/S12/S13: `research/SPIKE_LOG.md`
