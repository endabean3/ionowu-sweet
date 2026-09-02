# Multi-Outlet — Spesifikasi Mendalam

> **Status:** 🟡 Draft
> **Prioritas:** 🟡 P2 (Fase 2) — **tetapi keputusan datanya harus diambil di Fase 0**
> **Urutan baca:** dokumen **ke-9**

---

## 1. Kenapa Dibahas Sekarang Padahal Fase 2

[PRD-01](./PRD-01-POS-INTI.md) FR-04 hanya menyatakan satu kalimat:

> "Satu akun organisasi dapat mengelola banyak cabang toko dengan stok terpisah."

Satu kalimat itu menyembunyikan puluhan keputusan. Yang menjadikannya mendesak:
**skema database sudah memiliki `outlet_id` di mana-mana**. Bila asumsi multi-outlet salah
sejak awal, memperbaikinya di Fase 2 berarti migrasi setiap tabel transaksional.

Membangun fiturnya boleh ditunda. **Memutuskan bentuk datanya tidak boleh.**

---

## 2. Apa yang Dibagi vs Dipisah

Ini adalah inti dari seluruh dokumen ini:

| Entitas | Cakupan | Alasan |
|---|---|---|
| Tenant, langganan | Tenant | Satu hubungan komersial |
| Pengguna & peran | Tenant, **ditugaskan ke outlet** | Kasir bisa dipindah antar-cabang |
| **Kategori** | Tenant | Struktur menu seragam di seluruh cabang |
| **Produk** | Tenant | "Es Kopi Susu" adalah barang yang sama di mana pun |
| **Varian (SKU, barcode)** | Tenant | Barcode wajib berarti sama di semua cabang |
| **Harga** | ⚠️ **Tenant + override per outlet** | Cabang mal berbiaya sewa lebih tinggi |
| **Stok** | **Outlet** | Barang berada di lokasi fisik tertentu |
| Transaksi, shift, kas | Outlet | Terikat pada laci dan kasir tertentu |
| Audit log | Outlet, dilihat per tenant | Investigasi butuh keduanya |

### Keputusan yang paling menentukan: harga

```
products / variants  →  harga dasar (tingkat tenant)
        │
        └── outlet_price_overrides (opsional, tingkat outlet)
```

```sql
CREATE TABLE outlet_price_overrides (
    id VARCHAR(26) PRIMARY KEY,
    tenant_id VARCHAR(26) NOT NULL,
    outlet_id VARCHAR(26) NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    variant_id VARCHAR(26) NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
    price DECIMAL(14, 2) NOT NULL,
    effective_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX idx_price_override ON outlet_price_overrides(tenant_id, outlet_id, variant_id);
```

**Kenapa override, bukan harga penuh per outlet:** sebagian besar cabang memakai harga yang
sama. Menyimpan baris harga untuk setiap kombinasi outlet × varian berarti ribuan baris
duplikat yang harus dijaga tetap sinkron — dan setiap perubahan harga menjadi operasi massal
yang rawan gagal separuh jalan.

> **Dampak ke sisi kasir:** PWA harus mengunduh harga yang **sudah terselesaikan** untuk
> outletnya, bukan harga dasar plus daftar override. Menyelesaikan override di sisi klien
> saat offline adalah sumber bug harga yang tidak akan pernah tuntas.

---

## 3. Penugasan Pengguna ke Outlet

Skema `users` saat ini di [FDR.md](../10-architecture/FDR.md) §2 hanya punya `tenant_id`
dan `role` — **tidak ada kaitan ke outlet sama sekali**. Artinya setiap kasir secara teknis
dapat mengakses seluruh cabang. Ini bertentangan dengan matriks RBAC di
[SECURITY.md](../40-security/SECURITY.md) §3 yang menyebut Manager hanya berwenang atas
"cabangnya saja".

```sql
CREATE TABLE user_outlet_assignments (
    id VARCHAR(26) PRIMARY KEY,
    tenant_id VARCHAR(26) NOT NULL,
    user_id VARCHAR(26) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    outlet_id VARCHAR(26) NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX idx_user_outlet ON user_outlet_assignments(tenant_id, user_id, outlet_id);
```

Aturan yang berlaku:

| Peran | Cakupan |
|---|---|
| Owner | Seluruh outlet, otomatis |
| Manager | Hanya outlet yang ditugaskan |
| Cashier | Hanya outlet yang ditugaskan; bisa lebih dari satu (karyawan pengganti) |

> **Ini adalah celah keamanan, bukan fitur Fase 2.** Sebaiknya diperbaiki di Fase 0
> meskipun UI multi-outlet belum dibangun sama sekali.

---

## 4. Transfer Stok Antar-Outlet

```
Outlet A                              Outlet B
   │                                     │
   ├─ transfer_requested                 │
   ├─ stok "dalam perjalanan" ───────────┤
   │  (keluar dari A, belum masuk B)     │
   │                                     ├─ transfer_received
   │                                     └─ stok masuk ke B
```

Aturan yang mencegah stok menguap atau berlipat:

1. Stok yang sedang berjalan **tidak dihitung** di kedua outlet — ia berada di status ketiga.
2. Penerimaan harus dikonfirmasi; jumlah yang diterima boleh berbeda dari yang dikirim.
3. Selisihnya menjadi peristiwa `waste`/`loss` yang wajib diberi alasan.
4. Setiap langkah menulis baris di `stock_events`
   ([30-data/DATA-MODEL.md](../30-data/DATA-MODEL.md) §3C) memakai `transfer_in`/`transfer_out`.

**Kasus tepi offline:** Outlet A mengirim saat offline, Outlet B menerima saat online.
Ledger harus tetap konsisten setelah A tersinkron — termasuk bila urutan kedatangannya terbalik.

---

## 5. Pelaporan Konsolidasi

| Laporan | Cakupan |
|---|---|
| Omzet gabungan | Seluruh outlet, dapat dipilah |
| Perbandingan antar-outlet | Peringkat cabang |
| Stok gabungan | "Di mana barang ini masih ada?" |
| Kinerja per kasir | Lintas outlet bila kasir dipindah |

Dua hal yang wajib diperhatikan:

* **Zona waktu.** Indonesia punya WIB/WITA/WIT. "Penjualan hari ini" untuk tenant lintas zona
  waktu bermakna ganda. Usulan: `outlets` mendapat kolom `timezone`, laporan konsolidasi
  memakai zona waktu tenant, dan laporan per outlet memakai zona waktu lokalnya.
* **Batas waktu tutup buku.** Tenant kafe kerap tutup lewat tengah malam. "Hari penjualan"
  harus dapat diatur (mis. mulai pukul 04.00), bukan selalu tengah malam.

Keduanya juga memengaruhi laporan outlet tunggal — jadi harus diputuskan sebelum laporan
pertama ditulis, bukan di Fase 2.

---

## 6. Ringkasan Keputusan yang Diperlukan Sekarang

| Keputusan | Kapan | Kenapa |
|---|---|---|
| Harga = dasar + override | **Fase 0** | Mengubahnya berarti migrasi seluruh data harga |
| `user_outlet_assignments` | **Fase 0** | Celah keamanan RBAC |
| `outlets.timezone` | **Fase 0** | Memengaruhi setiap kueri laporan |
| Batas jam tutup buku | **Fase 0** | Sama |
| Barcode unik per tenant (bukan per outlet) | **Fase 0** | Sudah tersirat di indeks unik FDR §2 |
| Alur transfer stok | Fase 2 | Fitur mandiri, dapat ditambahkan belakangan |
| UI konsolidasi | Fase 2 | Murni tampilan |
