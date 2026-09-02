# Arsitektur Analitik & Business Intelligence

> **Status:** 🟡 Draft · **Prioritas:** 🟠 P1
> **Dasar keputusan:** [ADR-0006](./adr/0006-crm-bi-and-python-service.md)
> **Urutan baca:** dokumen **ke-8** dari 10-architecture

---

## 1. Masalah Inti

BI menuntut kueri yang **berlawanan sifat** dengan kasir:

| | Jalur kasir (OLTP) | Jalur BI (OLAP) |
|---|---|---|
| Bentuk kueri | Satu baris, indeks presisi | Agregasi jutaan baris |
| Latensi | **< 5 ms** | Detik sampai menit boleh |
| Frekuensi | Ratusan per menit | Beberapa per jam |
| Toleransi kegagalan | 🔴 Nol | 🟢 Tinggi |

Menjalankan keduanya di tabel yang sama berarti satu kueri laporan berat dapat menahan
koneksi, mengisi cache, dan membuat checkout melewati anggaran `<5ms` — **untuk seluruh
tenant sekaligus**, bukan hanya tenant yang membuka laporan.

> Ini bukan risiko teoretis. Ia adalah cara paling umum sistem POS menjadi lambat setelah
> fitur laporan ditambahkan.

---

## 2. Prinsip

| # | Prinsip |
|---|---|
| 1 | **Kueri BI tidak pernah menyentuh jalur checkout.** Tanpa pengecualian. |
| 2 | **Kegagalan BI tidak boleh terasa oleh kasir.** |
| 3 | **Data BI boleh basi.** Pemilik butuh "kemarin", bukan "milidetik lalu". |
| 4 | **Mulai sederhana.** 20.000 transaksi/hari bukan big data — jangan bangun gudang data. |

---

## 3. Jalur Bertahap

```
TAHAP 1 (Fase 1)  Tabel ringkasan + materialized view
   │              Di-refresh worker Python tiap malam
   │              ✅ Cukup s/d ~100 outlet
   ▼
TAHAP 2           Replika baca PostgreSQL
   │              Dilakukan saat kueri BI mulai mengganggu checkout
   ▼
TAHAP 3           DuckDB embedded di worker
   │              Analitik kolumnar tanpa layanan baru
   ▼
TAHAP 4           OLAP terpisah (ClickHouse)
                  ⚠️ Hanya bila benar-benar terbukti perlu
```

**Tahap 1 kemungkinan besar sudah cukup untuk 12 bulan ke depan.** Beban tulis pada target
100 outlet hanyalah ~2 transaksi/detik
([SCALABILITY-RELIABILITY](./SCALABILITY-RELIABILITY.md) §1) — agregasi semalam atas data
sekecil itu selesai dalam hitungan detik.

### Kenapa DuckDB sebelum ClickHouse

DuckDB berjalan **di dalam proses worker Python** — tanpa layanan baru, tanpa port, tanpa
kontainer tambahan, tanpa backup terpisah. Ia dapat membaca langsung dari Postgres dan
melakukan agregasi kolumnar. Untuk skala ini, ia memberi 90% manfaat ClickHouse dengan
mendekati nol biaya operasional.

---

## 4. Tabel Ringkasan (Tahap 1)

Diperbarui oleh worker Python setiap malam, pada jendela 02.00–05.00 WIB — di luar jam
operasional toko.

```sql
CREATE TABLE daily_outlet_summary (
    id VARCHAR(26) PRIMARY KEY,
    tenant_id VARCHAR(26) NOT NULL,
    outlet_id VARCHAR(26) NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    business_date DATE NOT NULL,          -- memakai batas tutup buku, bukan tengah malam
    transaction_count INT NOT NULL,
    gross_sales DECIMAL(14,2) NOT NULL,
    discount_total DECIMAL(14,2) NOT NULL,
    net_sales DECIMAL(14,2) NOT NULL,
    cogs_total DECIMAL(14,2) NOT NULL,    -- hanya untuk Owner (SECURITY §3)
    gross_profit DECIMAL(14,2) NOT NULL,
    payment_breakdown JSONB NOT NULL,     -- {cash: x, qris: y, ...}
    offline_transaction_count INT NOT NULL,
    unique_customer_count INT,            -- CRM
    computed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX idx_daily_summary
    ON daily_outlet_summary(tenant_id, outlet_id, business_date);

CREATE TABLE product_performance_summary (
    id VARCHAR(26) PRIMARY KEY,
    tenant_id VARCHAR(26) NOT NULL,
    outlet_id VARCHAR(26) NOT NULL,
    variant_id VARCHAR(26) NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
    period_start DATE NOT NULL,
    period_type VARCHAR(10) NOT NULL,     -- daily, weekly, monthly
    quantity_sold DECIMAL(14,3) NOT NULL,   -- desimal: 12,5 kg tepung terjual
    revenue DECIMAL(14,2) NOT NULL,
    gross_profit DECIMAL(14,2) NOT NULL,
    rank_in_outlet INT
);
CREATE INDEX idx_product_perf
    ON product_performance_summary(tenant_id, outlet_id, period_start, period_type);
```

> **`business_date` bukan `DATE(created_at)`.** Ia memakai batas jam tutup buku per outlet
> ([MULTI-OUTLET](../00-product/MULTI-OUTLET.md) §5) — kafe yang tutup pukul 01.00 harus
> mencatat penjualannya di hari kemarin, bukan hari ini. Salah di sini membuat setiap laporan
> keliru pada jam-jam paling ramai.

Perhitungan ulang wajib **idempoten**: menjalankan ulang untuk tanggal yang sama harus
menghasilkan angka yang sama, karena transaksi offline bisa tiba terlambat dan memaksa
perhitungan ulang hari-hari sebelumnya.

---

## 5. Isolasi Sumber Daya

Ini yang membuat prinsip #2 nyata:

| Batas | Nilai |
|---|---|
| Pool koneksi worker | **Terpisah, maks 2** |
| Statement timeout kueri BI | 30 detik |
| Jendela eksekusi | 02.00–05.00 WIB |
| Prioritas I/O | Terendah |

> Batas pool adalah yang paling penting dan paling mudah terlewat: worker yang menghabiskan
> pool koneksi Postgres akan membuat **checkout kasir gagal**, meskipun `pos-engine` sendiri
> sehat sepenuhnya.

---

## 6. Siapa Boleh Melihat Apa

Matriks RBAC di [SECURITY.md](../40-security/SECURITY.md) §3 berlaku penuh di BI —
dan justru di sinilah ia paling mudah bocor, karena laporan gemar menggabungkan data.

| Data | Owner | Manager | Cashier |
|---|:-:|:-:|:-:|
| Omzet seluruh outlet | ✅ | ❌ | ❌ |
| Omzet outlet sendiri | ✅ | ✅ | ❌ |
| **HPP & laba** | ✅ | ❌ | ❌ |
| Peringkat produk | ✅ | ✅ (outletnya) | ❌ |
| Data pelanggan (CRM) | ✅ | ✅ (outletnya) | ⚠️ Terbatas — lihat §7 |
| Kinerja per kasir | ✅ | ✅ | ❌ |

> **`cogs_total` dan `gross_profit` di tabel ringkasan wajib difilter di lapisan kueri.**
> Menyimpannya satu tabel dengan omzet itu praktis, tetapi berarti satu endpoint yang lupa
> memfilter kolom akan membocorkan margin usaha kepada manager — data yang eksplisit
> dilarang mereka lihat.

---

## 7. Fitur AI (Python)

| Fitur | Fase | Metode |
|---|---|---|
| Prediksi restock | 1 | Rata-rata bergerak → musiman |
| **Segmentasi pelanggan** | 1 | RFM (Recency, Frequency, Monetary) |
| **Prediksi churn pelanggan** | 2 | Klasifikasi |
| Analisis keranjang | 2 | Association rules |
| Prediksi omzet | 2 | Deret waktu |
| Deteksi anomali (anti-fraud) | 2 | Pola void & selisih kas janggal |

**RFM lebih dulu, bukan machine learning.** Ia hanya membutuhkan SQL, dapat dijelaskan
kepada pemilik toko dengan kalimat biasa, dan bekerja sejak minggu pertama. Model yang
tidak bisa dijelaskan tidak akan dipercaya — sama seperti aturan pada prediksi restock
([INTELLIGENCE-WORKER](./INTELLIGENCE-WORKER.md) §2 prinsip 4).

Aturan *cold start* juga berlaku: **jangan tampilkan segmentasi sebelum ada cukup data.**
Toko baru dengan 12 pelanggan tidak butuh segmen.
