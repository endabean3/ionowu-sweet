# Strategi Migrasi Basis Data

> **Status:** 🟡 Draft · **Prioritas:** 🔴 **P0**
> **Dokumen Terkait:** [DATA-MODEL.md](./DATA-MODEL.md), [50-operations/DEPLOYMENT.md](../50-operations/DEPLOYMENT.md)

---

## 1. Kenapa P0

Belum ada tooling, urutan, maupun aturan migrasi. Deploy pertama yang mengubah skema akan
dijalankan secara manual — dan pada sistem POS, itu berarti **mematikan kasir yang sedang
melayani antrean**.

Ada kendala yang membuat ini lebih ketat dari aplikasi web biasa: **perangkat kasir menyimpan
salinan katalog secara lokal dan bisa offline berhari-hari.** Skema server yang berubah harus
tetap kompatibel dengan versi PWA yang belum diperbarui.

---

## 2. Tooling

**✅ Ditetapkan: `goose`** (21 Agustus 2026).

| Kandidat | Penilaian |
|---|---|
| **goose** | ✅ SQL murni, biner Go tunggal, sejalan dengan `pos-engine` |
| golang-migrate | ✅ Setara; goose sedikit lebih sederhana |
| Atlas | Kuat, tetapi berlebihan untuk tahap ini |
| ORM auto-migrate | ❌ **Jangan** — perubahan skema tak terkendali di basis data keuangan |

Alasan memilih SQL murni: setiap perubahan skema dapat dibaca, ditinjau, dan diuji seperti
kode biasa. Migrasi yang dihasilkan ORM menyembunyikan operasi berbahaya di balik abstraksi.

✅ **Migrasi awal sudah ditulis** — lihat [`migrations/`](./migrations/):

```
30-data/migrations/
├── 00001_foundation.sql            tenants · outlets · users · sesi
├── 00002_platform_principals.sql   platform admin · break-glass · izin
├── 00003_catalog.sql               DECIMAL + UOM + item_type + BOM
├── 00004_crm.sql                   pelanggan · consent · segmen
├── 00005_shifts_and_sales.sql      shift · kas · transaksi
├── 00006_stock_ledger.sql          stock_events · opname · transfer
├── 00007_sync_and_infra.sql        idempotensi · webhook · outbox · audit
├── 00008_analytics.sql             ringkasan BI · prediksi
└── 00009_sop.sql                   template & eksekusi SOP
```

**47 tabel · 57 indeks · validasi dependensi FK lulus.**

> Karena tabelnya masih kosong, skema awal langsung memakai bentuk yang benar —
> `DECIMAL(14,3)` + `uom` + `item_type` sejak baris pertama, bukan `INT` lalu di-`ALTER`.
> Inilah alasan perbaikan ini **jauh lebih murah dikerjakan sekarang**.

---

## 3. Aturan Wajib

1. **Migrasi hanya maju.** Tidak ada `down` di produksi — rollback dilakukan dengan migrasi
   baru yang memperbaiki, bukan membalik. Membalik migrasi yang sudah menyentuh data
   transaksi berisiko menghapus penjualan.
2. **Setiap migrasi harus aman dijalankan dua kali** (`IF NOT EXISTS`).
3. **Berkas yang sudah dirilis tidak pernah diubah.** Perbaiki dengan berkas baru.
4. **Skema dan kode dirilis terpisah.** Lihat §4.
5. **Tanpa `DROP COLUMN` / `DROP TABLE` di rilis yang sama** dengan kode yang berhenti
   memakainya. Beri jeda minimal satu rilis.
6. **Migrasi berjalan sebelum kode baru start**, sebagai langkah terpisah.

---

## 4. Perubahan Kompatibel Mundur (*Expand–Contract*)

Ini adalah aturan yang mencegah waktu henti. Contoh mengganti nama kolom:

```
❌ SALAH — satu langkah
   ALTER TABLE ... RENAME COLUMN a TO b;
   → kode lama langsung rusak, kasir yang belum reload gagal bertransaksi

✅ BENAR — tiga rilis
   Rilis 1 (EXPAND)   tambah kolom b, tulis ke a DAN b
   Rilis 2 (MIGRATE)  isi mundur b, pindahkan pembacaan ke b
   Rilis 3 (CONTRACT) hentikan penulisan ke a, hapus a
```

| Operasi | Aman? | Catatan |
|---|:---:|---|
| `ADD COLUMN` nullable | ✅ | |
| `ADD COLUMN` + `DEFAULT` | ✅ | Postgres 11+ tidak menulis ulang tabel |
| `ADD COLUMN NOT NULL` tanpa default | ❌ | Gagal bila tabel berisi |
| `CREATE INDEX` | ❌ | Mengunci tabel — **wajib `CONCURRENTLY`** |
| `CREATE INDEX CONCURRENTLY` | ✅ | Tidak boleh di dalam blok transaksi |
| `ALTER COLUMN TYPE` | ❌ | Menulis ulang tabel; pakai expand–contract |
| `DROP COLUMN` | ⚠️ | Hanya setelah kode berhenti memakainya |
| `ADD FOREIGN KEY` | ⚠️ | Pakai `NOT VALID` lalu `VALIDATE CONSTRAINT` |

> **`CREATE INDEX` tanpa `CONCURRENTLY` adalah kesalahan paling mahal di daftar ini.**
> Pada `sales_transactions` yang besar, ia mengunci tabel selama pembuatan indeks —
> artinya setiap kasir di seluruh tenant berhenti bisa bertransaksi.

---

## 5. Migrasi Data Besar

Untuk pengisian mundur pada tabel transaksional, jangan pernah satu `UPDATE` besar:

```sql
-- ❌ mengunci tabel, memblokir seluruh kasir
UPDATE sales_transactions SET new_col = ... ;

-- ✅ bertahap, dengan jeda
UPDATE sales_transactions SET new_col = ...
WHERE id IN (SELECT id FROM sales_transactions
             WHERE new_col IS NULL LIMIT 1000);
```

Jalankan di luar jam sibuk toko (usulan: 02.00–05.00 WIB), sejalan dengan jendela worker di
[INTELLIGENCE-WORKER.md](../10-architecture/INTELLIGENCE-WORKER.md) §6.

---

## 6. Migrasi Sisi Klien (IndexedDB)

Sering terlupakan: **Dexie juga punya versi skema**
([FDR.md](../10-architecture/FDR.md) §3A).

```typescript
this.version(2).stores({ ... }).upgrade(tx => { /* ... */ });
```

Aturan yang berlaku:

* Migrasi klien **wajib mempertahankan transaksi yang belum tersinkron**. Kehilangan antrean
  saat upgrade berarti kehilangan penjualan yang sudah terjadi.
* Perangkat bisa melompati beberapa versi (offline 2 minggu) — jalur upgrade harus berurutan.
* Migrasi klien harus berjalan **sebelum** antrean sinkronisasi diproses.
* Bila migrasi klien gagal, jangan hapus basis data. Blokir dan minta bantuan.

---

## 7. Urutan Deploy

```
1. Backup DB · verifikasi berhasil
2. Jalankan migrasi (expand)          ← kode lama masih jalan
3. Verifikasi skema
4. Deploy kode baru                    ← Dokploy
5. Pantau error & latensi
6. Rilis berikutnya: contract
```

**Bila langkah 2 gagal:** hentikan. Kode lama masih berjalan dengan skema lama —
kasir tidak terganggu. Ini alasan migrasi harus terpisah dari deploy kode.

---

## 8. Yang Masih Harus Ditetapkan

- [ ] Migrasi dijalankan otomatis oleh Dokploy, atau manual dengan persetujuan?
- [ ] Siapa yang berwenang menyetujui migrasi skema? (usulan: harus ada peninjau kedua)
- [ ] Cara menguji migrasi terhadap salinan data produksi sebelum dirilis
- [ ] Jendela migrasi yang disepakati (**jangan** 11.00–13.00 & 17.00–20.00 WIB)
