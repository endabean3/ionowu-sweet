# Metrik Keberhasilan & North Star

> **Status:** 🟡 Draft — angka target masih usulan, perlu divalidasi
> **Urutan baca:** dokumen **ke-5**. Berikutnya: [ANALYTICS-EVENTS.md](./ANALYTICS-EVENTS.md)

---

## 1. North Star Metric

> **Transaksi tercatat per outlet aktif per hari**

Alasan metrik ini dipilih:

* **Mengukur nilai yang diterima, bukan aktivitas kami.** Outlet yang mencatat 150 transaksi
  sehari benar-benar menjalankan usahanya di sini — bukan sekadar mencoba.
* **Tidak bisa dicurangi lewat pendaftaran.** Menambah tenant tidak menaikkan angka ini.
* **Menghubungkan ketiga persona.** Sari memasukkannya, Budi merekonsiliasinya, Hendra memantaunya.
* **Runtuh bila produk gagal.** Kasir yang *lag*, layar melelahkan, atau sinkronisasi rusak
  langsung menurunkannya.

**Yang membuat metrik ini tetap jujur:** hanya hitung transaksi yang **berhasil tersinkron dan
terekonsiliasi**. Transaksi yang tersangkut di antrean lokal selamanya tidak boleh dihitung —
itu justru gejala kegagalan.

---

## 2. Pohon KPI

```
                 Transaksi tercatat / outlet aktif / hari
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        ▼                         ▼                         ▼
   OUTLET AKTIF            TRANSAKSI/OUTLET          KUALITAS DATA
        │                         │                         │
   ├ tenant baru            ├ transaksi/shift         ├ % sinkron sukses
   ├ tingkat aktivasi       ├ shift/hari              ├ selisih kas dpt dijelaskan
   ├ retensi bulanan        ├ item/transaksi          ├ % transaksi offline
   └ churn                  └ nilai transaksi rata²   └ rasio void & refund
```

---

## 3. Metrik per Tahap Siklus Hidup

### A. Aktivasi — tahap paling rapuh

| Metrik | Definisi | Target usulan |
|---|---|---|
| **Time-to-First-Transaction** | Daftar → transaksi sungguhan pertama | Median <30 menit |
| Tingkat penyelesaian katalog | % tenant dengan ≥10 varian dalam 24 jam | >70% |
| Aktivasi shift pertama | % tenant yang menutup shift pertamanya | >60% |
| **Drop-off input katalog** | % yang berhenti di tahap input produk | <20% |

> Ini adalah **risiko A4** di [VISION-SCOPE.md](./VISION-SCOPE.md) §7 dalam bentuk terukur.
> Bila hanya satu bagian dari dokumen ini yang dipantau, pantaulah bagian ini.

### B. Keterikatan

| Metrik | Target usulan |
|---|---|
| Hari aktif per minggu per outlet | ≥5 |
| Transaksi per shift | Naik dari waktu ke waktu (tanda kepercayaan tumbuh) |
| Rasio pemakaian pintasan keyboard | Naik (membuktikan asumsi A5) |
| Frekuensi buka dasbor pemilik | ≥3×/minggu |

### C. Retensi & Pendapatan

| Metrik | Target usulan |
|---|---|
| Retensi outlet bulanan | >95% |
| Konversi free → premium | >15% |
| Outlet per tenant | Naik (bukti nilai multi-outlet) |

### D. Metrik Pembuktian Pembeda

Metrik yang membuktikan janji unik produk ini benar-benar terpakai:

| Metrik | Kenapa penting |
|---|---|
| **% outlet yang pernah bertransaksi offline** | Membuktikan offline-first bukan sekadar klaim pemasaran |
| **Durasi offline terpanjang yang berhasil dipulihkan** | Membuktikan ketahanan yang sesungguhnya |
| **Rasio rekomendasi restock yang dijalankan** | Membuktikan "actionable", bukan sekadar laporan |
| **Selisih kas yang terjelaskan** | Membuktikan janji audit trail |

---

## 4. Metrik Penjaga (*Guardrail*)

Angka yang **tidak boleh memburuk** demi mengejar pertumbuhan:

| Penjaga | Ambang | Bila dilanggar |
|---|---|---|
| Latensi UI kasir (INP) | <50ms p75 | Hentikan fitur baru, perbaiki performa |
| Latensi API checkout | <5ms p99 | Sama |
| Kegagalan sinkronisasi | <0.1% batch | Insiden — ini menyangkut uang |
| Selisih kas tak terjelaskan | 0 kasus | Insiden keamanan/audit |
| **Kebocoran data antar-tenant** | **0, selamanya** | Insiden kritis, hentikan semua rilis |
| Rasio void per shift | Tidak naik | Bisa berarti UI membingungkan **atau** ada fraud |

> Perhatikan bahwa penjaga ini sama dengan NFR di [PRD](./PRD-01-POS-INTI.md) §4 — bedanya,
> di sini ia diukur **di produksi pada pengguna nyata**, bukan di *benchmark*.
> Alat ukurnya harus dibangun; lihat [50-operations/OBSERVABILITY.md](../50-operations/OBSERVABILITY.md).

---

## 5. Definisi yang Harus Disepakati Lebih Dulu

Metrik gagal bukan karena salah hitung, melainkan karena definisinya berbeda antar-orang:

| Istilah | Definisi yang diusulkan |
|---|---|
| **Outlet aktif** | Punya ≥1 transaksi tersinkron dalam 7 hari terakhir |
| **Tenant aktif** | Punya ≥1 outlet aktif |
| **Transaksi** | Penjualan berstatus `paid` & tersinkron. Void tidak dihitung; refund dihitung sebagai peristiwa terpisah |
| **Churn** | Tidak ada transaksi selama 30 hari berturut-turut, **atau** berhenti berlangganan |
| **Sesi offline** | Rentang waktu dengan ≥1 transaksi dibuat saat `syncStatus = pending` |

---

## 6. Yang **Tidak** Kami Ukur (dan Alasannya)

| Metrik populer | Kenapa diabaikan |
|---|---|
| Jumlah pendaftaran | Bisa naik tanpa ada nilai apa pun yang tersampaikan |
| Waktu yang dihabiskan di aplikasi | Bagi kasir, **lebih sedikit lebih baik** |
| Jumlah fitur yang dirilis | Mengukur kesibukan kami, bukan hasil bagi pengguna |
| Jumlah tampilan halaman dasbor | Hendra ingin 10 detik lalu selesai, bukan berlama-lama |
