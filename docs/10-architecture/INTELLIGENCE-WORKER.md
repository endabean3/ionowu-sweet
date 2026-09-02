# Intelligence Worker — Spesifikasi Layanan Python

> **Status:** ✅ **AKTIF — dibangun mulai Fase 1** ([ADR-0006](./adr/0006-crm-bi-and-python-service.md))
> **Prioritas:** 🟠 P1

> ### Perubahan 21 Agustus 2026
>
> Penundaan ke Fase 2 **dibatalkan**. Dasarnya gugur begitu **CRM dan Business Intelligence
> masuk ruang lingkup produk**: penundaan itu benar hanya bila satu-satunya kebutuhan Python
> adalah prediksi restock V0/V1, yang memang hanya rata-rata bergerak.
>
> Ruang lingkup layanan ini kini mencakup **tiga hal**, bukan satu:
> 1. Prediksi restock (§3A)
> 2. **Segmentasi & prediksi churn pelanggan** (CRM)
> 3. **Agregasi Business Intelligence** — lihat [ANALYTICS-BI.md](./ANALYTICS-BI.md)
> **Urutan baca:** dokumen **ke-5**

---

## 1. Komponen yang Ada di Diagram tapi Tidak Ada di Mana-mana

`intelligence-worker` digambar sebagai komponen penuh di [FDR.md](./FDR.md) §1 dan disebut
di [ADR-0001](./adr/0001-hybrid-go-ts-docker-architecture.md), tetapi:

* ❌ Tidak pernah didefinisikan di `docker-compose.prod.yml`
  ([50-operations/DOCKER.md](../50-operations/DOCKER.md) §6, temuan #7)
* ❌ Tidak punya tabel penyangga di [30-data/DATA-MODEL.md](../30-data/DATA-MODEL.md)
* ❌ Tidak punya endpoint di [20-api/openapi.yaml](../20-api/openapi.yaml)
* ❌ Tidak punya batas memori di [50-operations/INFRASTRUCTURE.md](../50-operations/INFRASTRUCTURE.md) §4

Namun ia menopang janji utama produk — *"1-Tap Actionable Intelligence"*
([PRD](../00-product/PRD-01-POS-INTI.md) §1) dan FR-50.

---

## 2. Prinsip yang Mengikat

| # | Prinsip | Konsekuensi |
|---|---|---|
| 1 | **Kematiannya tidak boleh terasa** | Worker mati = tidak ada rekomendasi baru. Kasir tidak terpengaruh sama sekali. |
| 2 | **Hanya membaca data transaksi** | Menulis hanya ke tabelnya sendiri ([SERVICE-BOUNDARIES.md](./SERVICE-BOUNDARIES.md) §4 aturan 3) |
| 3 | **Salah tebak harus murah** | Rekomendasi yang keliru boleh diabaikan pemilik dalam satu ketukan |
| 4 | **Wajib bisa dijelaskan** | "Beli 20 L susu" tanpa alasan tidak akan pernah dipercaya |
| 5 | **Mulai dari aturan, bukan model** | Heuristik sederhana dulu; ML hanya bila terbukti kalah |

> **Prinsip 5 adalah yang paling menghemat waktu.** Rata-rata bergerak sederhana kemungkinan
> besar sudah cukup untuk sebagian besar toko. Membangun pipeline ML sebelum membuktikan
> heuristik gagal adalah cara paling umum menghabiskan satu kuartal tanpa hasil.

---

## 3. Fitur

### A. Prediksi Restock (FR-50) — Fase 2

**Pertanyaan yang dijawab:** *"Apa yang akan habis, dan kapan?"*

Pendekatan bertahap:

| Tahap | Metode | Prasyarat data |
|---|---|---|
| **V0** | Rata-rata konsumsi 7 hari → hari tersisa | 2 minggu |
| **V1** | + pola hari dalam minggu (akhir pekan lebih ramai) | 8 minggu |
| **V2** | + tren & musiman (Ramadan, libur sekolah) | 6 bulan |
| **V3** | Model ML per varian | 12 bulan |

**Keluaran wajib menyertakan alasan:**

> "Susu UHT: sisa 8 L. Rata-rata 6 L/hari, akhir pekan 9 L/hari.
> Diperkirakan habis **Sabtu**. Saran pesan: **40 L**."

Angka mentah tanpa kalimat penjelas akan diabaikan — itu mengubah fitur ini kembali menjadi
laporan, persis yang ingin dihindari [VISION-SCOPE.md](../00-product/VISION-SCOPE.md) §5 prinsip #4.

### B. Segmentasi Pelanggan (CRM) — Fase 1

**Pertanyaan yang dijawab:** *"Siapa pelanggan terbaik saya, dan siapa yang mulai menghilang?"*

Metode: **RFM** (Recency, Frequency, Monetary) — bukan machine learning.

| Segmen | Arti | Aksi yang disarankan |
|---|---|---|
| `champion` | Sering, baru, nilai tinggi | Apresiasi |
| `loyal` | Rutin | Pertahankan |
| `at_risk` | Dulu rutin, mulai jarang | **Hubungi via WA** |
| `hibernating` | Lama tidak datang | Promo balik |
| `new` | Baru pertama | Sambut |

> **RFM dipilih lebih dulu daripada ML karena bisa dijelaskan.** "Budi biasanya belanja
> tiap minggu, tapi sudah 3 minggu tidak datang" dapat dipahami pemilik toko dan langsung
> dipercaya. Skor model yang tidak bisa dijelaskan akan diabaikan — sama seperti prinsip #4 di §2.

Hasil ditulis ke `customer_segments` ([DATA-MODEL](../30-data/DATA-MODEL.md) §5C).
Aturan *cold start* berlaku: **jangan tampilkan segmen pada toko dengan <30 pelanggan.**

### C. Agregasi BI — Fase 1

Mengisi `daily_outlet_summary` dan `product_performance_summary` setiap malam.
Rincian: [ANALYTICS-BI.md](./ANALYTICS-BI.md) §4.

### D. Analisis Keranjang — Fase 2+

*"Apa yang sering dibeli bersamaan?"* → saran bundling. Nilainya lebih rendah dari restock;
kerjakan hanya setelah A terbukti dipakai.

---

## 4. Masalah Cold Start

Toko baru **tidak punya riwayat**. Ini bukan kasus tepi — setiap tenant melewatinya, dan
justru pada saat mereka paling menilai apakah produk ini berguna.

| Umur data | Perilaku |
|---|---|
| < 2 minggu | **Jangan tampilkan prediksi sama sekali.** Tampilkan `min_stock_alert` manual. |
| 2–8 minggu | Prediksi V0, ditandai "akurasi masih terbatas" |
| > 8 minggu | Prediksi penuh |

> Menampilkan tebakan buruk lebih merusak daripada tidak menampilkan apa pun. Kepercayaan
> pada fitur rekomendasi hilang pada saran salah pertama, dan hampir tidak pernah kembali.

---

## 5. Bentuk Teknis

```
Postgres (baca) ──► Worker Python ──► prediksi disimpan
       ▲                  │
       │                  └──► event restock.predicted ──► TS ──► WA (FR-50)
       │
   dipicu terjadwal (harian, dini hari), BUKAN per transaksi
```

**Pemicu terjadwal, bukan per event.** Menghitung ulang prediksi setiap transaksi berarti
worker sibuk terus-menerus tanpa manfaat — prediksi restock hanya berguna sekali sehari.
Jadwal dini hari juga menjauhkan beban komputasi dari jam sibuk toko, hal yang penting
karena semuanya berbagi satu VPS ([INFRASTRUCTURE.md](../50-operations/INFRASTRUCTURE.md)).

```sql
CREATE TABLE restock_predictions (
    id VARCHAR(26) PRIMARY KEY,
    tenant_id VARCHAR(26) NOT NULL,
    outlet_id VARCHAR(26) NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    variant_id VARCHAR(26) NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
    predicted_stockout_date DATE,
    recommended_qty INT,
    confidence VARCHAR(10),        -- low, medium, high
    method VARCHAR(20),            -- v0_moving_avg, v1_weekday, ...
    reasoning TEXT,                -- kalimat penjelas untuk pengguna
    computed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX idx_prediction_current
    ON restock_predictions(tenant_id, outlet_id, variant_id, computed_at DESC);

CREATE TABLE prediction_outcomes (      -- untuk mengukur akurasi
    id VARCHAR(26) PRIMARY KEY,
    prediction_id VARCHAR(26) NOT NULL REFERENCES restock_predictions(id),
    actual_stockout_date DATE,
    was_followed BOOLEAN,               -- apakah pemilik menjalankannya
    error_days INT
);
```

> `prediction_outcomes` adalah satu-satunya cara mengetahui apakah fitur ini benar-benar
> bekerja. Tanpanya, model bisa memburuk selama berbulan-bulan tanpa ada yang tahu.
> Ia juga memasok metrik "rasio rekomendasi yang dijalankan" di
> [00-product/SUCCESS-METRICS.md](../00-product/SUCCESS-METRICS.md) §3D.

---

## 6. Batas Sumber Daya

Ini yang membuat prinsip #1 nyata, bukan sekadar niat baik:

| Batas | Nilai | Alasan |
|---|---|---|
| Memori | 512 MB | scikit-learn boros; **wajib ada batas** agar tidak meng-OOM pos-engine |
| CPU | 0.5 core | Jangan berebut CPU dengan kasir |
| Jendela eksekusi | 02.00–05.00 WIB | Di luar jam operasional toko |
| Batas waktu per tenant | 60 detik | Satu tenant besar tidak boleh memblokir yang lain |
| Koneksi DB | Pool terpisah, maks 2 | Jangan menghabiskan pool milik pos-engine |

> Baris terakhir mudah terlewat dan berakibat fatal: worker yang menghabiskan pool koneksi
> Postgres akan membuat **checkout kasir gagal**, meskipun `pos-engine` sendiri sehat
> sepenuhnya. Prinsip "kematiannya tidak boleh terasa" hanya berlaku bila batas ini dipasang.

---

## 7. Keputusan Terbuka

1. **Apakah worker dibutuhkan di Fase 1?** FR-51 (ringkasan WA harian) tidak butuh ML sama
   sekali — TypeScript bisa mengerjakannya. Worker Python mungkin baru perlu ada di Fase 2.
2. **Bahasa.** Bila V0/V1 hanya rata-rata bergerak, Go atau TypeScript bisa mengerjakannya
   dan menghapus satu bahasa dari stack. Python baru benar-benar dibutuhkan di V3.
3. **Bagaimana model divalidasi** sebelum rekomendasinya ditampilkan ke pemilik?
4. **Uji A/B rekomendasi manual lebih dulu** — asumsi A3 di
   [VISION-SCOPE.md](../00-product/VISION-SCOPE.md) §7 belum terbukti. Bila pemilik tidak
   menjalankan rekomendasi yang dibuat manusia, mereka juga tidak akan menjalankan yang
   dibuat mesin, dan seluruh layanan ini kehilangan alasan keberadaannya.

> **Keputusan #1 dan #2 layak diambil lebih dulu.** Keduanya bisa menghapus satu layanan
> dan satu bahasa dari arsitektur — penyederhanaan terbesar yang masih tersedia bagi sistem ini.
