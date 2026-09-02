# Persona & Jobs-to-be-Done

> **Status:** 🟡 Draft — persona berasal dari asumsi, **belum** dari wawancara pengguna
> **Urutan baca:** dokumen **ke-2**. Sebelumnya: [VISION-SCOPE.md](./VISION-SCOPE.md) · Berikutnya: [PRD-01-POS-INTI.md](./PRD-01-POS-INTI.md)

---

## 1. Peringatan Kejujuran

Tiga persona di bawah memperluas tabel di [PRD-01](./PRD-01-POS-INTI.md) §2. Semuanya masih
**hipotesis**. Sebelum MVP dikunci, minimal **10 wawancara** harus dilakukan untuk
mengonfirmasi atau membantahnya. Persona yang tidak divalidasi adalah cara paling rapi
untuk membangun produk yang salah dengan penuh percaya diri.

---

## 2. Sari — Kasir / Barista

| | |
|---|---|
| **Umur / konteks** | 19–26, sering karyawan pertama, tingkat keluar-masuk tinggi |
| **Perangkat** | Android RAM 3GB atau tablet murah bersama |
| **Frekuensi** | 6–8 jam/hari, 200–400 transaksi saat sibuk |
| **Kemampuan teknis** | Mahir media sosial, belum tentu mahir aplikasi bisnis |

**Job:** *Ketika antrean mengular saat jam makan siang, saya ingin memproses pesanan tanpa
berpikir, agar antrean tidak makin panjang dan saya tidak dimarahi.*

| Yang menyakitkan hari ini | Yang harus dilakukan produk |
|---|---|
| Sistem *lag* saat antrean panjang | Latensi UI <50ms (PRD §4) |
| Layar putih menyilaukan bikin mata pedih | Palet Oat Milk, kontras ≥7:1 |
| Salah input → disalahkan saat tutup shift | Umpan balik audio/visual jelas tiap aksi |
| Internet mati → panik, tidak tahu harus apa | Offline berjalan senyap, tanpa dialog error |
| Karyawan baru butuh berhari-hari belajar | Cukup mahir dalam satu shift |

**Ukuran keberhasilan:** waktu rata-rata per transaksi, jumlah void per shift, dan
**apakah Sari bisa dilatih dalam satu shift**.

> **Konsekuensi desain yang sering terlewat:** tingkat keluar-masuk kasir tinggi. Produk harus
> optimal untuk **hari pertama**, bukan untuk pengguna mahir. Setiap pintasan keyboard
> (FR-21) wajib punya padanan yang bisa disentuh dan terlihat.

---

## 3. Budi — Manager Toko

| | |
|---|---|
| **Umur / konteks** | 25–40, sering kerabat pemilik, memegang operasional harian |
| **Perangkat** | Ponsel pribadi + tablet kasir |
| **Frekuensi** | Buka/tutup toko, cek stok, tangani masalah |

**Job:** *Ketika shift ditutup dan uang di laci tidak cocok, saya ingin tahu persis di mana
selisihnya, agar saya tidak harus menuduh siapa pun tanpa bukti.*

| Yang menyakitkan hari ini | Yang harus dilakukan produk |
|---|---|
| Selisih kas tanpa penjelasan | Rincian variance + jejak audit (SECURITY §6) |
| Bahan habis mendadak saat jam sibuk | Alert stok berbasis warna (FR-14) |
| Tidak tahu kasir mana yang bermasalah | Laporan per shift per kasir |
| Stock opname makan waktu berjam-jam | Alur opname terpandu (`/stock/opname`) |
| Harus di tempat untuk tahu keadaan | Ringkasan shift ke WhatsApp (FR-51) |

**Ukuran keberhasilan:** waktu tutup shift, besaran variance rata-rata, dan berapa kali
kejadian kehabisan stok per minggu.

> **Ketegangan yang harus diputuskan:** [PRD](./PRD-01-POS-INTI.md) FR-03 memberi Budi akses
> "laporan shift", sementara [SECURITY.md](../40-security/SECURITY.md) §3 melarangnya melihat
> omzet & laba. Batas yang diusulkan: **Budi boleh melihat omzet cabangnya, tidak boleh
> melihat HPP dan laba.** Ini harus dikunci sebelum implementasi RBAC dimulai.

---

## 4. Hendra — Pemilik UMKM

| | |
|---|---|
| **Umur / konteks** | 30–50, memiliki 1–5 outlet, kerap punya usaha lain |
| **Perangkat** | Ponsel, hampir tidak pernah membuka laptop |
| **Frekuensi** | Mengecek beberapa kali sehari, dalam durasi sangat singkat |

**Job:** *Ketika saya mengecek ponsel di sela kegiatan lain, saya ingin tahu dalam 10 detik
apakah hari ini normal, agar saya bisa berhenti mencemaskan toko.*

| Yang menyakitkan hari ini | Yang harus dilakukan produk |
|---|---|
| Tidak tahu keadaan toko tanpa datang | Dasbor real-time di ponsel |
| Rekap multi-outlet manual di Excel | Tampilan konsolidasi ([MULTI-OUTLET.md](./MULTI-OUTLET.md)) |
| Tahu barang habis setelah terlambat | Prediksi restock + 1 tombol pesan WA (FR-50) |
| Curiga ada kebocoran, tak bisa buktikan | Audit trail yang tak bisa diubah |
| POS lain terlalu mahal untuk beberapa cabang | Paket bertingkat ([PRICING-PACKAGING.md](./PRICING-PACKAGING.md)) |

**Ukuran keberhasilan:** frekuensi buka aplikasi per minggu, dan **rasio rekomendasi restock
yang benar-benar dijalankan** — inilah metrik yang membuktikan janji "1-Tap Actionable
Intelligence" di PRD §1 bukan sekadar slogan.

> **Hendra adalah pembeli, Sari adalah pengguna.** Keduanya harus puas: Hendra membayar,
> tetapi Sari-lah yang bisa menggagalkan adopsi dari dalam.

---

## 4b. Persona Baru (ADR-0007)

Ditambahkan seiring perluasan peran. Semuanya **belum divalidasi** — sama seperti tiga persona
di atas, dan sama-sama butuh wawancara.

### 📦 Gudang — staf penerimaan & stok

**Job:** *Ketika barang datang dari distributor, saya ingin mencatatnya cepat dan benar,
agar stok di sistem cocok dengan yang ada di rak.*

Kebutuhan: terima barang, opname, transfer antar-outlet, catat barang rusak.
**Tidak butuh** akses kasir maupun laci kas.

> Konflik yang belum selesai: penerimaan barang menyentuh harga beli, sementara HPP adalah
> hak Owner. Usulan penyelesaian ada di [RBAC-MODEL](../40-security/RBAC-MODEL.md) §2.

### 🛍️ SPG — staf lantai penjualan

**Job:** *Ketika pelanggan bertanya di depan rak, saya ingin langsung tahu stok dan harganya,
dan bisa menyiapkan pesanannya tanpa harus ke meja kasir.*

Kebutuhan: cek stok & harga, daftarkan pelanggan, **buat pesanan tertahan** yang diselesaikan
kasir. **Tidak menyentuh uang sama sekali** — pemisahan ini penting untuk anti-fraud.

### 🛠️ Super Admin — tim kami sendiri

**Job:** *Ketika tenant melapor masalah, saya ingin bisa melihat keadaannya — tanpa membuat
tenant merasa datanya bisa dibuka kapan saja diam-diam.*

Kebutuhan utamanya bukan akses, melainkan **akses yang dapat dipertanggungjawabkan**.
Karena itu break-glass beralasan dan pemberitahuan ke tenant bukan penghambat — ia justru
yang membuat peran ini dapat diterima.

---

## 5. Anti-Persona (Sengaja Tidak Kami Layani)

| Bukan untuk | Alasan |
|---|---|
| Jaringan ritel >20 outlet | Butuh ERP, kontrak enterprise, dan SLA yang tidak kami sanggupi |
| Restoran *full-service* | Butuh manajemen meja & KDS — lihat Non-Goals di [VISION-SCOPE.md](./VISION-SCOPE.md) §6 |
| Pedagang kaki lima tanpa katalog tetap | Biaya input katalog melebihi manfaatnya |
| Usaha yang butuh e-faktur pajak penuh | Ranah kepatuhan berbeda; lihat gap Compliance di [DOCS-MAP.md](../DOCS-MAP.md) |

---

## 6. Sehari dalam Kehidupan (Kafe, Hari Sibuk)

Dipakai untuk menguji apakah alur produk masuk akal secara berurutan, bukan per fitur:

```
07.30  Budi buka toko → buka shift, input saldo awal laci        FR-30
08.00  Sari mulai; internet lambat tapi masih hidup
11.30  Jam sibuk: 40 transaksi/jam, QRIS & tunai bercampur       FR-20…FR-25
12.10  ⚡ Internet mati total
       → transaksi tetap jalan, struk tetap tercetak             FR-41
       → Sari tidak menyadari ada yang berbeda      ← ujian sesungguhnya
13.40  Internet pulih → antrean tersinkron di latar belakang     FR-42
14.00  Susu tinggal 2 liter → alert stok                         FR-14
14.05  Hendra terima notifikasi, 1 tap kirim WA ke pemasok       FR-50
15.00  Ganti shift: Sari tutup, kasir lain buka dengan PIN       FR-02, FR-32
21.00  Budi tutup shift → hitung kas, cetak Z-Report             FR-32
21.05  Hendra terima ringkasan omzet harian via WA               FR-51
```

**Momen paling menentukan adalah pukul 12.10.** Bila mode offline terasa mulus di sana,
produk ini menepati janji intinya. Bila muncul satu saja dialog error, seluruh pembeda
produk runtuh.
