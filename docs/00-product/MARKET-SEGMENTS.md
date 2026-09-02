# Segmen UMKM — Katalog & Arketipe Operasional

> **Status:** 🟡 Draft · **Urutan baca:** dokumen **ke-12** dari 00-product
> **Tujuan:** memetakan jenis usaha bukan sebagai daftar nama, melainkan sebagai
> **arketipe operasional** — karena yang menentukan kebutuhan sistem adalah *cara jualannya*,
> bukan *apa yang dijual*.

---

## 1. Pelanggan yang Sudah Pasti

| Usaha | Bidang | Arketipe |
|---|---|---|
| **Warung Wangi** | Parfum refill | **B — Retail Curah/Takar** |
| **Media Boga** | Toko kelontong fokus bahan kue | **B — Retail Curah/Timbang** |

> **Keduanya arketipe yang sama.** Ini kabar bagus untuk fokus — tetapi juga berarti
> arketipe B **wajib** didukung sempurna sebelum apa pun yang lain. Lihat peringatan di §4.

---

## 2. Enam Arketipe Operasional

Dua usaha bisa terlihat sangat berbeda tetapi butuh sistem yang sama; dua usaha yang mirip
bisa butuh sistem yang sangat berbeda. Yang membedakan ada di lima hal:

**satuan jual · bentuk stok · ada tidaknya olahan · kadaluarsa · siapa pelanggannya**

| | Arketipe | Ciri utama |
|:-:|---|---|
| **A** | Retail Satuan | Jual per pcs, stok bulat |
| **B** | **Retail Curah / Timbang / Takar** | Jual per berat/volume, **butuh konversi satuan** |
| **C** | F&B Olahan | Ada resep; bahan baku ≠ barang jual |
| **D** | Jasa Berbasis Waktu | **Tidak ada stok** — yang dijual durasi/slot |
| **E** | Jasa Berbasis Pekerjaan | Antrean, status pengerjaan, ambil-antar |
| **F** | Hybrid | Barang + jasa dalam satu struk |

---

## 3. Katalog Jenis Usaha

### A — Retail Satuan

Toko baju & fashion · konter pulsa & aksesoris HP · toko sepatu/tas · toko ATK ·
toko mainan · toko elektronik kecil · optik (bingkai) · toko perhiasan imitasi ·
pet shop (produk)

*Paling sederhana. Sistem sekarang sudah mendukung penuh.*

### B — Retail Curah / Timbang / Takar ⭐

**Parfum refill** ✅ *Warung Wangi* · **toko bahan kue** ✅ *Media Boga* ·
toko sembako & kelontong · toko sayur & buah · toko beras · toko bumbu & rempah ·
depot air minum isi ulang · toko pakan ternak · pertamini / bensin eceran ·
toko plastik & kemasan

**Yang dibutuhkan:**
- Stok **desimal** (0,5 kg · 750 ml)
- **Konversi satuan** — beli karung 25 kg, jual per 100 gram
- **Repack** — satu barang beli menjadi banyak barang jual
- Harga bertingkat (eceran vs grosir)
- Kadaluarsa (bahan kue, pakan)

> **Parfum refill sedikit lebih rumit lagi:** satu botol terjual = bibit parfum (ml) +
> botol (pcs) + alkohol (ml). Itu **resep sederhana**, bukan sekadar konversi satuan —
> jadi Warung Wangi sebenarnya berada di antara arketipe B dan C.

### C — F&B Olahan

Warung kopi / kedai kopi · **warung risol & gorengan** · warteg / warung makan ·
bakery & toko kue · kedai boba & minuman · ayam geprek · martabak · bakso & soto ·
es krim & dessert · katering

**Yang dibutuhkan:**
- **Resep / BOM** — 1 kopi susu = 18 g biji + 150 ml susu + 1 cup + 1 tutup
- Stok bahan baku berkurang otomatis saat menjual barang jadi
- Varian & topping (less sugar, ukuran, extra shot)
- Produksi harian (risol dibuat pagi, sisa dicatat)
- **Pencatatan susut/waste** — gorengan tidak habis, roti kedaluwarsa

> Ini segmen **terbesar** di Indonesia, dan yang paling terasa manfaat HPP-nya. Tanpa BOM,
> pemilik warung kopi tidak akan pernah tahu untung sesungguhnya per gelas.

### D — Jasa Berbasis Waktu

**Rental PS** · warnet & game center · studio musik · lapangan futsal/badminton ·
karaoke keluarga · rental mobil/motor · co-working & ruang meeting · kolam renang

**Yang dibutuhkan:**
- **Tidak ada stok sama sekali** — yang dijual adalah *slot waktu*
- Timer berjalan, tarif per jam, perpanjangan
- Ketersediaan unit (PS #1 dipakai, PS #2 kosong)
- Booking & deposit
- Paket (3 jam lebih murah)

> ⚠️ **Arketipe ini paling jauh dari inti sistem sekarang.** Bukan soal fitur tambahan —
> seluruh model datanya berbeda. Lihat §4.

### E — Jasa Berbasis Pekerjaan

Laundry kiloan · barbershop & salon · servis HP · bengkel motor · cuci mobil ·
fotokopi & percetakan · jasa jahit & permak · servis elektronik · klinik kecantikan

**Yang dibutuhkan:**
- **Order pekerjaan** dengan status: diterima → dikerjakan → selesai → diambil
- Nomor antrean / nota pengambilan
- Penugasan ke teknisi/kapster + komisi
- Bayar sebagian di muka
- **Notifikasi pelanggan** saat selesai ← CRM sangat berguna di sini

### F — Hybrid

Bengkel motor (sparepart + jasa) · salon (produk + treatment) · servis HP (sparepart + jasa) ·
percetakan (bahan + jasa) · pet shop + grooming · optik (kacamata + periksa mata)

Butuh gabungan A/B + E dalam satu struk: barang berstok dan jasa tanpa stok dijual bersamaan.

---

## 4. 🔴 Temuan: Dua Pelanggan Fix Belum Bisa Dilayani

Skema saat ini **tidak bisa menjalankan Warung Wangi maupun Media Boga.**

| Kolom | Sekarang | Masalah |
|---|---|---|
| `variants.stock_quantity` | `INT` | Tidak bisa 0,5 kg atau 750 ml |
| `sales_items.quantity` | `INT` | Tidak bisa jual 250 gram |
| `stock_events.quantity_delta` | `INT` | Ledger stok ikut bulat |
| Satuan (UOM) | **tidak ada kolom sama sekali** | Sistem tidak tahu bedanya pcs, gram, ml |
| Konversi satuan | tidak ada | Beli karung 25 kg → jual per 100 g |

### Perbaikan yang dibutuhkan

```sql
-- Stok & kuantitas menjadi desimal
ALTER TABLE variants        ALTER COLUMN stock_quantity TYPE DECIMAL(14,3);
ALTER TABLE sales_items     ALTER COLUMN quantity       TYPE DECIMAL(14,3);
ALTER TABLE stock_events    ALTER COLUMN quantity_delta TYPE DECIMAL(14,3);

-- Satuan & konversi
ALTER TABLE variants ADD COLUMN uom VARCHAR(10) NOT NULL DEFAULT 'pcs';  -- pcs, g, kg, ml, l
ALTER TABLE variants ADD COLUMN uom_precision SMALLINT DEFAULT 0;        -- angka di belakang koma

CREATE TABLE uom_conversions (
    id VARCHAR(26) PRIMARY KEY,
    tenant_id VARCHAR(26) NOT NULL,
    variant_id VARCHAR(26) NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
    from_uom VARCHAR(10) NOT NULL,      -- 'karung'
    to_uom VARCHAR(10) NOT NULL,        -- 'g'
    factor DECIMAL(14,4) NOT NULL       -- 25000
);
```

> **`DECIMAL`, bukan `FLOAT`.** Alasannya sama seperti uang: penjumlahan pecahan biner
> menimbulkan galat yang menumpuk, dan stok yang meleset akan terlihat saat opname tanpa
> ada yang bisa menjelaskan sebabnya.

> **Ini perubahan tipe kolom pada tabel transaksional** — wajib memakai pola expand–contract
> ([MIGRATIONS](../30-data/MIGRATIONS.md) §4). Karena itu **jauh lebih murah dikerjakan
> sekarang**, saat tabelnya masih kosong, daripada setelah ada data produksi.

---

## 4b. Prinsip: Universal dari Sisi Rancangan, Fokus dari Sisi Pemasaran

Keputusan 22 Agustus 2026: **aplikasi harus bisa dipakai seluruh kategori UMKM.**

Ini tidak bertentangan dengan fokus — asalkan dipisahkan dengan benar:

| | Universal | Fokus |
|---|---|---|
| **Model data** | ✅ Wajib mencakup 6 arketipe **sejak awal** | — |
| **Urutan fitur** | — | ✅ Boleh bertahap |
| **Pemasaran & onboarding** | — | ✅ Mulai dari arketipe B & C |

**Alasannya:** mengubah model data setelah ada data produksi itu mahal dan berisiko
([MIGRATIONS](../30-data/MIGRATIONS.md) §4). Masalah kolom `stock_quantity` bertipe bilangan bulat di §4 adalah
contohnya — untungnya tertangkap **sebelum** ada data, sehingga cukup diperbaiki di skema
awal tanpa `ALTER`. Menambah fitur belakangan itu murah; mengubah model data tidak.

### Primitif universal yang wajib ada sejak awal

Satu kolom ini membuat keenam arketipe muat tanpa migrasi di kemudian hari:

```sql
ALTER TABLE variants ADD COLUMN item_type VARCHAR(20) NOT NULL DEFAULT 'stock';
-- stock       : barang berstok        (arketipe A, B)
-- composite   : punya resep/BOM        (arketipe C, parfum refill)
-- service     : jasa, tanpa stok       (arketipe E, F)
-- time_based  : dijual per satuan waktu (arketipe D)
```

Bersama `DECIMAL` + `uom` + konversi satuan (§4), inilah fondasi yang membuat aplikasi
benar-benar universal.

**Kategori usaha menjadi konfigurasi, bukan cabang kode.** Prinsip yang sama dengan model
izin di [RBAC-MODEL](../40-security/RBAC-MODEL.md) §7: satu mesin, banyak preset.
Bila kategori diterjemahkan menjadi `if (kategori == 'warung_kopi')` di dalam kode,
setiap kategori baru akan menuntut rilis baru — dan itu tidak akan pernah selesai.

---

## 5. Rekomendasi Fokus

| Arketipe | Prioritas | Alasan |
|---|:-:|---|
| **B — Curah/Timbang** | 🔴 **Fase 0** | **Kedua pelanggan fix ada di sini.** Tanpa ini, tidak ada pelanggan sama sekali. |
| **A — Retail Satuan** | 🟢 Fase 0 | Sudah didukung; gratis |
| **C — F&B Olahan** | 🟠 **Fase 1** | Segmen terbesar di Indonesia; butuh BOM |
| **F — Hybrid** | 🟡 Fase 2 | Setelah A/B/C stabil |
| **E — Jasa Pekerjaan** | 🟡 Fase 3 | Butuh modul order pekerjaan |
| **D — Jasa Waktu** | ⚪ Fitur ditunda | **Model datanya tetap disiapkan sejak awal** (§4b) — yang ditunda hanya UI & fiturnya |

### ⚠️ Soal rental PS dan sejenisnya

Arketipe D memang usaha nyata dan banyak. Tetapi **model datanya berlawanan dengan inti
sistem ini**: tidak ada stok, tidak ada katalog barang, yang dijual adalah waktu yang
berjalan. Ia butuh timer, ketersediaan unit, dan booking — praktis produk tersendiri.

**Rekomendasi: jangan dikerjakan sebelum arketipe B dan C benar-benar matang.** Mengejarnya
lebih awal akan memecah fokus persis pada saat produk paling butuh terbukti di satu segmen.

> Ini penerapan aturan di [ERP-MODULE-MAP](./ERP-MODULE-MAP.md) §2: **jangan bangun modul
> sebelum ada minimal 5 tenant aktif yang memintanya.**

### Konsekuensi ke BOM

Arketipe C butuh resep/BOM — dan Warung Wangi (bibit + botol + alkohol) sebenarnya juga.

✅ **Sudah diselesaikan:** BOM ringan dinaikkan dari Fase 4 ke **Fase 1**
([ERP-MODULE-MAP](./ERP-MODULE-MAP.md) §3). Versi ringan saja — resep datar satu tingkat,
tanpa produksi bertingkat. Tabelnya sudah ada di skema: `bom_components`
([migrations/00003](../30-data/migrations/)).

Manufacturing penuh (produksi bertingkat, perencanaan kapasitas) tetap di Fase 4 bersyarat.

---

## 6. Dampak ke Onboarding

[ONBOARDING-ACTIVATION](./ONBOARDING-ACTIVATION.md) §4 sudah menyebut "template per jenis
usaha". Katalog ini adalah isinya:

| Template | Berisi |
|---|---|
| Parfum refill | Satuan ml, ukuran botol 30/50/100, kategori aroma |
| Toko bahan kue | Satuan g/kg, konversi karung→kg, kategori (tepung, gula, topping) |
| Warung kopi | Menu dasar + resep sederhana, varian ukuran & tingkat gula |
| Toko kelontong | Kategori sembako, satuan campuran |

Pertanyaan jenis usaha diajukan **saat pendaftaran**, lalu katalog awal dan satuan langsung
terisi. Ini menyerang langsung hambatan terbesar aktivasi: waktu daftar → transaksi pertama.

---

## 7. Yang Masih Harus Diriset

- [ ] Wawancara Warung Wangi & Media Boga — **validasi arketipe B sebelum menulis kode**
- [ ] Berapa SKU rata-rata per arketipe? (menentukan batas paket Free)
- [ ] Apakah pemilik toko bahan kue benar-benar melakukan repack, atau beli sudah terkemas?
- [ ] Ketelitian timbangan yang dipakai (mempengaruhi `uom_precision`)
- [ ] Apakah timbangan digital perlu terhubung ke sistem? → [HARDWARE-SUPPORT](../60-quality/HARDWARE-SUPPORT.md)
