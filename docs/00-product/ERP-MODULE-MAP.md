# Peta Modul — Dari POS ke Mini ERP

> **Status:** 🟡 Draft · **Urutan baca:** dokumen **ke-11** dari 00-product
> **Konteks:** arah produk dinyatakan pemilik pada 21 Agustus 2026 — *"mirip mini ERP, biar
> langsung berdampak besar bagi UMKM agar tau arah bisnis ke perusahaan besar."*

---

## 1. Yang Sudah Kita Punya vs Yang Dibutuhkan ERP

| Modul ERP | Status | Ada di |
|---|:-:|---|
| **Sales / POS** | ✅ Kuat | PRD FR-20…FR-32 |
| **Inventory** | ✅ Ada | Stock ledger, opname, transfer |
| **CRM** | 🟡 Fase 1 | [ADR-0006](../10-architecture/adr/0006-crm-bi-and-python-service.md) |
| **Business Intelligence** | 🟡 Fase 1 | [ANALYTICS-BI](../10-architecture/ANALYTICS-BI.md) |
| **Purchasing / Procurement** | ❌ | Baru sebatas pesan via WA (FR-50) |
| **Finance / Accounting** | ❌ | Ada di Non-Goals |
| **HR / Kepegawaian** | ❌ | Ada di Non-Goals |
| **Manufacturing / BOM** | ❌ | Belum pernah dibahas |

Jadi "mini ERP" berarti menambah **empat modul**, dan dua di antaranya saat ini ada di
daftar Non-Goals ([VISION-SCOPE](./VISION-SCOPE.md) §6).

---

## 2. ⚠️ Peringatan Jujur

> **ERP adalah kategori produk yang berbeda, bukan POS dengan fitur tambahan.**

Yang berubah begitu kita menyebut diri ERP:

| | POS | ERP |
|---|---|---|
| Pesaing | Moka, Qasir, Pawoon | **Accurate, Jurnal, Majoo, Zahir** |
| Siklus penjualan | Hari | Minggu sampai bulan |
| Alasan pelanggan pergi | "Kasirnya lambat" | "Datanya nggak cocok sama pembukuan" |
| Risiko terbesar | Sistem lambat | **Ruang lingkup melar dan tidak pernah selesai** |

**Cara ERP UMKM gagal hampir selalu sama:** membangun semua modul sekaligus, tidak ada satu pun
yang benar-benar bagus, lalu kalah dari produk yang mengerjakan satu hal dengan sangat baik.

**Cara yang berhasil — dan ini yang kita pakai:** mulai dari satu modul yang dipakai setiap
hari (POS), lalu **tambahkan modul hanya saat pelanggan yang sudah ada menariknya**. Square dan
Toast tumbuh begini. Itu bukan kompromi; itu urutan yang benar.

> Aturan yang saya sarankan: **jangan bangun modul sebelum ada minimal 5 tenant aktif yang
> memintanya dengan kata-kata mereka sendiri.** Permintaan pasar adalah izin, bukan asumsi kita.

---

## 3. Urutan yang Disarankan

Diurutkan berdasarkan **dampak terhadap "UMKM naik kelas" dibagi biaya membangunnya.**

### 🥇 Prioritas 1 — Purchasing (Fase 2)

**Kenapa lebih dulu:** kita **sudah** punya bahan mentahnya — prediksi restock, data
distributor, riwayat stok. Ini bukan modul baru dari nol, melainkan **menyempurnakan FR-50**
dari "kirim pesan WA" menjadi alur pesanan yang tercatat.

Isi: PO, konfirmasi distributor, penerimaan barang, harga beli per pemasok, riwayat harga.

Dampak naik kelas: memisahkan **siapa memesan** dari **siapa menerima** — kontrol anti-fraud
yang menjadi wajib begitu pemilik tidak lagi ikut menerima barang sendiri.

### 🥈 Prioritas 2 — Finance ringan (Fase 2–3)

**Bukan akuntansi penuh.** Yang benar-benar dibutuhkan UMKM:

- Laba rugi sederhana (sudah bisa dari data kita)
- Arus kas
- Utang ke pemasok / piutang pelanggan
- **Ekspor ke Accurate/Jurnal** — bukan menggantikannya

> **Jangan bangun buku besar (*general ledger*).** Itu produk tersendiri, sangat diatur, dan
> sudah dikuasai pemain yang jauh lebih berpengalaman. Peran `external_accountant`
> ([RBAC-MODEL](../40-security/RBAC-MODEL.md) §6) memberi 80% manfaatnya dengan 5% usahanya.

### 🥉 Prioritas 3 — HR ringan (Fase 3)

Jadwal shift, absensi lewat login kasir, kinerja per kasir. Sebagian besar datanya **sudah
kita rekam** lewat shift — tinggal disajikan.

Yang **tidak** dibangun: payroll. Itu menyentuh pajak dan BPJS — wilayah kepatuhan tersendiri.

### 4️⃣ BOM Ringan — dinaikkan ke Fase 1

> ⚠️ **Direvisi 22 Agustus 2026.** Semula ditaruh di Fase 4 bersyarat. Naik ke **Fase 1**
> setelah [MARKET-SEGMENTS](./MARKET-SEGMENTS.md) menunjukkan dua hal:
>
> * **Warung Wangi** (parfum refill) sudah membutuhkannya — 1 botol = bibit (ml) + botol (pcs) + alkohol (ml)
> * **Arketipe C** (warung kopi, risol) adalah segmen terbesar di Indonesia dan tidak bisa
>   menghitung HPP tanpa resep

**BOM ringan (Fase 1):** resep datar, satu tingkat, tanpa produksi bertingkat.
Sudah tersedia di skema — tabel `bom_components`
([migrations/00003](../30-data/migrations/)).

**Manufacturing penuh (Fase 4, bersyarat):** produksi bertingkat, perencanaan kapasitas,
work order produksi. Hanya bila ada permintaan nyata dari tenant berbayar.

---

## 4. Yang Tetap di Non-Goals

Meski menjadi mini ERP, ini tetap **tidak** dibangun:

| Tidak dibangun | Alasan |
|---|---|
| **Buku besar & akuntansi penuh** | Produk tersendiri; ekspor jauh lebih bijak daripada bersaing |
| **Payroll** | Pajak & BPJS — kepatuhan tersendiri |
| **E-faktur pajak & nasihat pajak** | Legalitas usaha adalah tanggung jawab owner — lihat [COMPLIANCE-ID](../40-security/COMPLIANCE-ID.md) §1c. Kita sediakan data & ekspor. |
| **Marketplace pemasok** | Butuh sisi penawaran yang tidak kami miliki |
| **Manajemen aset & depresiasi** | Terlalu jauh dari inti |

---

## 5. Konsekuensi yang Belum Diselesaikan

Perubahan arah ini menyentuh tiga hal yang perlu ditinjau ulang:

1. **North Star kemungkinan salah.** Sekarang: *transaksi tercatat per outlet per hari* —
   mengukur **pemakaian**, bukan **pertumbuhan pelanggan kita**. Bila tujuannya membantu UMKM
   naik kelas, yang layak diukur adalah pertumbuhan **mereka**: omzet naik, outlet bertambah,
   pelanggan kembali. → [SUCCESS-METRICS](./SUCCESS-METRICS.md)

2. **Lanskap kompetitif berubah.** [COMPETITIVE-LANDSCAPE](./COMPETITIVE-LANDSCAPE.md) masih
   membandingkan dengan POS. Kini pesaingnya juga Accurate, Jurnal, dan Majoo.

3. **Paket harga perlu jenjang baru.** Modul ERP tidak muat di struktur
   Free/Premium/Multi-Outlet sekarang. → [PRICING-PACKAGING](./PRICING-PACKAGING.md)

---

## 6. Fitur yang Paling Mewujudkan Visi "Tahu Harus Ngapain"

Semua modul di atas menghasilkan **data**. Tetapi visi yang dinyatakan pemilik adalah
membantu owner **tahu arah bisnis dan harus berbuat apa** — dan itu bukan data, melainkan
**SOP yang diturunkan dari data**.

Alasan UMKM gagal naik kelas biasanya bukan kekurangan pelanggan, melainkan **operasional yang
hanya ada di kepala pemilik**. Begitu buka cabang kedua, kualitasnya jatuh.

Sistem ini sudah merekam bahan mentahnya: pola shift, pergerakan stok, rekonsiliasi kas,
perilaku kasir, ritme pelanggan. Dari situ ia bisa:

| Langkah | Contoh |
|---|---|
| **Menemukan pola** | "Outlet A selisih kasnya nol, Outlet B rata-rata Rp 15.000. Bedanya: A menghitung laci tiap ganti shift." |
| **Mengubahnya jadi SOP** | Checklist buka/tutup toko, ambang stok, alur persetujuan |
| **Menegakkannya** | SOP muncul sebagai langkah di aplikasi, bukan dokumen yang tak pernah dibaca |

> Ini **bukan prediksi**, melainkan **kodifikasi praktik terbaik yang sudah terbukti di dalam
> usaha itu sendiri.** Jauh lebih bisa kami janjikan daripada akurasi prediksi — dan justru
> lebih bernilai, karena inilah yang membuat pengetahuan berpindah dari kepala pemilik menjadi
> proses yang bisa diulang oleh siapa pun.

**Rekomendasi: jadikan modul SOP sebagai pembeda utama**, bukan sekadar pelengkap ERP.
Spesifikasinya kini ada di **[SOP-MODULE.md](./SOP-MODULE.md)** — SOP per kategori usaha,
dengan tiga lapis: template bawaan → penegakan di aplikasi → penemuan dari data.
Modul purchasing dan finance bisa dibeli di tempat lain. Yang tidak bisa dibeli adalah
sistem yang mengajari usaha menjalankan dirinya sendiri.

✅ Spesifikasi sudah ditulis: [SOP-MODULE.md](./SOP-MODULE.md). Masuk Fase 1 (lapis 1–2).
