# Modul SOP — Standar Operasional per Kategori Usaha

> **Status:** 🟡 Draft · **Urutan baca:** dokumen **ke-13** dari 00-product
> **Posisi:** **pembeda utama produk**, bukan pelengkap ERP
> ([ERP-MODULE-MAP](./ERP-MODULE-MAP.md) §6)

---

## 1. Masalah yang Diselesaikan

UMKM gagal naik kelas biasanya **bukan** karena kekurangan pelanggan, melainkan karena
**operasionalnya hanya ada di kepala pemilik.** Begitu buka cabang kedua atau merekrut orang
baru, kualitasnya jatuh — tidak ada yang tahu "cara kita melakukannya" selain si pemilik.

SOP tertulis di Word yang disimpan di folder tidak menyelesaikan ini. Yang menyelesaikan:
**SOP yang muncul sebagai langkah di dalam aplikasi, pada saat pekerjaannya dilakukan.**

| Pendekatan | Hasilnya |
|---|---|
| ❌ Dokumen SOP terpisah | Dibaca sekali saat training, lalu tidak pernah lagi |
| ✅ **SOP sebagai langkah di aplikasi** | Dijalankan setiap hari, tercatat, bisa diaudit |

---

## 2. Tiga Lapis Modul Ini

```
LAPIS 1  TEMPLATE     SOP bawaan per kategori usaha
             ↓        tenant tinggal pakai, tidak mulai dari nol
LAPIS 2  PENEGAKAN    SOP jadi checklist di aplikasi
             ↓        buka toko, tutup shift, terima barang
LAPIS 3  PENEMUAN     Sistem menemukan SOP dari data tenant sendiri
                      "Outlet A selisih kasnya nol, ini bedanya…"
```

Lapis 1 dan 2 dibangun lebih dulu. **Lapis 3 adalah yang benar-benar membedakan produk ini** —
tetapi ia butuh data beberapa bulan, jadi tidak bisa jadi yang pertama.

---

## 3. SOP Bawaan per Arketipe

Mengikuti enam arketipe di [MARKET-SEGMENTS](./MARKET-SEGMENTS.md) §2 — karena SOP mengikuti
**cara kerja**, bukan nama usaha.

### A — Retail Satuan

| SOP | Pemicu | Langkah kunci |
|---|---|---|
| Buka toko | Awal shift | Cek kebersihan display · hitung kas awal · cek stok pajangan |
| Restock rak | Alert stok | Ambil dari gudang · catat transfer · rapikan display |
| Tutup toko | Akhir shift | Hitung kas · Z-Report · kunci laci |

### B — Curah / Timbang / Takar ⭐ *(Warung Wangi, Media Boga)*

| SOP | Pemicu | Langkah kunci |
|---|---|---|
| **Kalibrasi timbangan** | Harian, sebelum buka | Uji dengan beban standar · catat hasil |
| Terima barang curah | Barang datang | Timbang ulang vs surat jalan · **catat selisih** · cek kemasan bocor |
| **Repack** | Stok eceran menipis | Ambil dari karung/drum · timbang · catat susut |
| Cek kadaluarsa | Mingguan | FIFO · pisahkan yang mendekati kedaluwarsa |
| Kebersihan alat takar | Ganti aroma/bahan | Bilas corong · lap timbangan |

> **Kalibrasi timbangan dan pencatatan susut adalah dua SOP yang paling berdampak di arketipe
> ini.** Selisih stok pada usaha curah hampir selalu berasal dari salah satunya — dan tanpa
> SOP, pemilik akan menyalahkan karyawan padahal penyebabnya timbangan yang meleset.

### C — F&B Olahan

| SOP | Pemicu | Langkah kunci |
|---|---|---|
| Cek bahan baku | Pagi | Cek stok bahan · cek kesegaran · cek suhu kulkas |
| Produksi harian | Pagi | Buat sesuai perkiraan · catat hasil produksi |
| **Catat susut** | Akhir hari | Hitung sisa · catat terbuang · **hitung kerugian** |
| Kebersihan | Akhir shift | Cuci alat · buang sampah · matikan kompor |
| Standar penyajian | Tiap pesanan | Takaran sesuai resep · cek suhu sajian |

### D — Jasa Berbasis Waktu

| SOP | Pemicu | Langkah kunci |
|---|---|---|
| Cek unit sebelum sewa | Pelanggan datang | Uji nyala · cek stik/perangkat · **foto kondisi** |
| Serah terima | Selesai sewa | Cek kerusakan · reset perangkat · bersihkan |
| Perawatan berkala | Mingguan | Bersihkan kipas · cek update · cek kabel |

### E — Jasa Berbasis Pekerjaan

| SOP | Pemicu | Langkah kunci |
|---|---|---|
| **Terima order** | Pelanggan datang | **Foto kondisi awal** · catat keluhan · beri nomor nota |
| Update progres | Saat dikerjakan | Ubah status · catat penggantian part |
| **Serah terima** | Selesai | Foto hasil · pelanggan cek · tanda tangan · **notifikasi WA** |

> **Foto kondisi awal adalah SOP paling bernilai di arketipe ini.** Ia menyelesaikan sengketa
> "lecetnya sudah ada dari awal" yang menjadi sumber konflik nomor satu di bengkel, laundry,
> dan servis HP.

### F — Hybrid

Gabungan A/B + E, dengan tambahan: pemisahan struk barang & jasa, dan perhitungan komisi teknisi.

---

## 4. SOP Lintas Kategori

Berlaku untuk semua, karena menyangkut uang:

| SOP | Kenapa universal |
|---|---|
| **Buka & tutup shift** | Menyangkut kas — sudah ada di FR-30…FR-32 |
| **Rekonsiliasi selisih kas** | Selisih wajib dijelaskan, bukan dibiarkan |
| **Persetujuan void & diskon** | Kontrol anti-fraud ([SECURITY](../40-security/SECURITY.md) §3) |
| **Stock opname berkala** | Menjaga stok sistem = stok fisik |
| Serah terima antar-shift | Mencegah tanggung jawab kabur |

---

## 5. Bentuk Teknis

```sql
CREATE TABLE sop_templates (
    id VARCHAR(26) PRIMARY KEY,
    tenant_id VARCHAR(26) REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = bawaan sistem
    archetype VARCHAR(20),               -- retail_unit, bulk, fnb, time_service, job_service, hybrid
    code VARCHAR(50) NOT NULL,
    name VARCHAR(200) NOT NULL,
    trigger_type VARCHAR(30) NOT NULL,   -- shift_open, shift_close, stock_alert, schedule, manual
    schedule_cron VARCHAR(50),
    required_role VARCHAR(20),
    is_blocking BOOLEAN DEFAULT FALSE,   -- apakah menghalangi aksi bila belum selesai
    steps JSONB NOT NULL,                -- [{text, requires_photo, requires_input, input_type}]
    is_system BOOLEAN DEFAULT FALSE
);

CREATE TABLE sop_executions (
    id VARCHAR(26) PRIMARY KEY,
    tenant_id VARCHAR(26) NOT NULL,
    outlet_id VARCHAR(26) NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    sop_template_id VARCHAR(26) NOT NULL REFERENCES sop_templates(id),
    shift_id VARCHAR(26) REFERENCES shifts(id),
    actor_user_id VARCHAR(26) NOT NULL REFERENCES users(id),
    status VARCHAR(20) NOT NULL,         -- pending, in_progress, completed, skipped
    skip_reason TEXT,
    results JSONB,                       -- jawaban per langkah
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX idx_sop_exec ON sop_executions(tenant_id, outlet_id, completed_at DESC);
```

### Dua aturan yang menentukan berhasil-tidaknya modul ini

**1. `is_blocking` harus dipakai sangat hemat.**
SOP yang menghalangi kasir saat antrean mengular akan **dimatikan tenant pada hari kedua**.
Yang layak memblokir hanya: input saldo awal shift dan hitung kas saat tutup — keduanya
sudah wajib. Sisanya sebaiknya mengingatkan, bukan menghalangi.

**2. `skipped` adalah status yang sah, dan harus dicatat.**
Melarang melewati langkah membuat karyawan mengisi asal-asalan supaya bisa lanjut — dan data
palsu lebih buruk daripada data kosong. Biarkan dilewati dengan alasan; pola melewati
justru menjadi informasi berharga bagi pemilik.

### Wajib jalan offline

SOP dieksekusi di lantai toko, sering tanpa sinyal. Template disimpan di IndexedDB, hasil
eksekusi masuk **antrean sinkronisasi yang sama** dengan transaksi
([OFFLINE-SYNC-SPEC](../30-data/OFFLINE-SYNC-SPEC.md)).

> ⚠️ **Foto adalah masalah tersendiri.** SOP arketipe D dan E memerlukan foto, dan foto
> berukuran besar akan **memakan kuota IndexedDB yang sama** dengan antrean transaksi —
> satu-satunya jalur menuju "kasir tidak bisa berjualan". Aturan wajib: kompres agresif
> (maks ~200 KB), dan bila penyimpanan tertekan, **buang foto sebelum transaksi.**

---

## 6. Lapis 3 — SOP yang Ditemukan dari Data

Ini yang tidak bisa ditiru pesaing, karena butuh data operasional yang hanya kita miliki.

| Sistem menemukan | Usulan SOP |
|---|---|
| Outlet A selisih kas nol, B rata-rata Rp 15.000 | "Hitung laci tiap ganti shift, seperti Outlet A" |
| Kehabisan susu tiap Sabtu | "Restock susu setiap Kamis" |
| Void tinggi pada satu kasir | "Tinjau pelatihan kasir tersebut" |
| Susut gorengan 30% tiap Senin | "Kurangi produksi Senin sebanyak 25%" |
| Pelanggan tidak kembali setelah kunjungan pertama | "Sapa pelanggan baru di kunjungan kedua" |

**Bingkainya penting:** ini **bukan prediksi**, melainkan **kodifikasi praktik yang sudah
terbukti di dalam usaha itu sendiri**. Karena itu ia bisa dijelaskan, dan karena bisa
dijelaskan, ia dipercaya — beda dengan skor model yang tidak bisa dijelaskan
([INTELLIGENCE-WORKER](../10-architecture/INTELLIGENCE-WORKER.md) §2 prinsip 4).

Usulan SOP **selalu perlu persetujuan pemilik** sebelum aktif. Sistem mengusulkan;
pemilik memutuskan.

---

## 7. Pentahapan

| Fase | Isi |
|---|---|
| **1** | Lapis 1–2: template per arketipe + checklist buka/tutup shift |
| **2** | SOP kustom per tenant · SOP dengan foto (arketipe D & E) |
| **3** | **Lapis 3** — penemuan SOP dari data (butuh ≥3 bulan data) |
| **3** | Skor kepatuhan SOP per outlet · perbandingan antar-cabang |

---

## 8. Ukuran Keberhasilan

| Metrik | Arti |
|---|---|
| Tingkat penyelesaian SOP per outlet | Apakah benar-benar dipakai |
| **Selisih kas sebelum vs sesudah SOP aktif** | Bukti dampak paling langsung |
| Rasio SOP dilewati | Bila tinggi → SOP-nya tidak realistis, bukan orangnya malas |
| Usulan SOP Lapis 3 yang diterima pemilik | Bukti fitur penemuan benar-benar berguna |
| **Waktu latih karyawan baru** | Tujuan akhirnya: pengetahuan pindah dari kepala pemilik ke sistem |
