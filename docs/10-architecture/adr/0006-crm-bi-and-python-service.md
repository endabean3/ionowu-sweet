# ADR-0006: CRM & Business Intelligence Masuk Ruang Lingkup — Layanan Python Diaktifkan

| Metadata | Nilai |
|---|---|
| **Status** | **Diterima** (21 Agustus 2026) |
| **Menggantikan** | [TECH-STACK](../TECH-STACK.md) §10 keputusan "tunda layanan Python ke Fase 2" |
| **Mengubah** | [VISION-SCOPE](../../00-product/VISION-SCOPE.md) §6 Non-Goals — CRM dikeluarkan |
| **Dokumen Acuan** | [ANALYTICS-BI.md](../ANALYTICS-BI.md), [INTELLIGENCE-WORKER.md](../INTELLIGENCE-WORKER.md) |

## Konteks

Pada 21 Agustus 2026 pemilik produk menyatakan bahwa produk ini **juga mengusung konsep CRM
dan Business Intelligence**, dan membutuhkan Python untuk kemampuan AI-nya.

Ini mengubah dua keputusan yang sebelumnya diambil atas dasar informasi yang belum lengkap:

1. **Layanan Python ditunda ke Fase 2.** Keputusan itu benar *bila* satu-satunya kebutuhan
   Python adalah prediksi restock V0/V1 — yang memang hanya rata-rata bergerak. Dengan CRM
   dan BI masuk, dasar penundaan itu gugur.
2. **CRM ada di Non-Goals.** [VISION-SCOPE](../../00-product/VISION-SCOPE.md) §6 menulis
   "Loyalitas & CRM pelanggan penuh — ditunda ke v2; jangan mengaburkan fokus MVP", dengan
   aturan bahwa memindahkannya keluar membutuhkan ADR. Inilah ADR-nya.

### Yang berubah secara mendasar

Sampai hari ini sistem ini **tidak menyimpan satu pun data pribadi pelanggan.**
`sales_transactions` tidak punya `customer_id`; `payments` hanya menyimpan `reference_id`
dari gateway. CRM mengubah itu secara fundamental — dan konsekuensinya jauh melampaui
penambahan tabel.

## Alternatif yang Dipertimbangkan

| Opsi | Kelebihan | Kekurangan | Alasan |
|---|---|---|---|
| Tetap tunda Python, CRM/BI di TypeScript | Stack lebih sederhana | Ekosistem ML/analitik Python tidak tergantikan; memaksa TS untuk ML adalah kerja melawan arus | Ditolak |
| **Aktifkan layanan Python, CRM & BI masuk ruang lingkup** | Ekosistem AI/analitik matang; batas layanan tetap jelas | +512 MB RAM; menambah bahasa ketiga; **membawa PII pelanggan ke dalam sistem** | **Dipilih** |
| Layanan AI terpisah di penyedia lain | Tidak membebani VPS | Data transaksi keluar dari VPS — bertentangan dengan [ADR-0005](./0005-telemetry-external-data-internal.md) | Ditolak |

## Keputusan

1. **Layanan Python (`intelligence-worker`) dibangun mulai Fase 1**, bukan Fase 2.
2. **CRM keluar dari Non-Goals.** Yang tetap di Non-Goals: program loyalitas berpoin penuh
   dan kampanye pemasaran massal — keduanya produk tersendiri.
3. **Business Intelligence memakai jalur analitik terpisah** dari jalur transaksi
   ([ANALYTICS-BI.md](../ANALYTICS-BI.md)).
4. **Entitas pelanggan ditambahkan ke skema** beserta pencatatan persetujuan (*consent*).

## Konsekuensi

**Positif:**
- Ekosistem AI/ML Python tersedia untuk CRM (segmentasi, prediksi churn) dan BI
- Batas layanan tetap bersih: Python hanya membaca, menulis ke tabelnya sendiri
  ([SERVICE-BOUNDARIES](../SERVICE-BOUNDARIES.md) §4 aturan 3)
- Nilai produk naik: dari "kasir yang tahan offline" menjadi "kasir yang mengenal pelanggannya"

**Negatif / biaya yang kami terima:**

- **🔴 Sistem kini menyimpan PII pelanggan.** Ini konsekuensi terbesar, bukan penambahan
  tabel biasa:
  - Kewajiban UU PDP menjadi nyata, bukan lagi teoretis
    ([COMPLIANCE-ID](../../40-security/COMPLIANCE-ID.md))
  - Aturan retensi & penghapusan harus benar-benar diterapkan
    ([RETENTION](../../30-data/RETENTION.md))
  - Persetujuan pelanggan harus dicatat, bukan diasumsikan
- **🔴 PII ikut tersimpan di perangkat kasir.** Katalog pelanggan akan berada di IndexedDB
  agar kasir bisa melayani saat offline. Artinya **perangkat kasir yang hilang kini membawa
  data pribadi pelanggan** — ancaman yang sebelumnya tidak ada
  ([THREAT-MODEL](../../40-security/THREAT-MODEL.md)).
- **Anggaran memori naik ~512 MB.** Rekomendasi VPS berubah dari "4 GB cukup" menjadi
  **8 GB minimum** ([INFRASTRUCTURE](../../50-operations/INFRASTRUCTURE.md) §4).
- **Kueri BI berpotensi mengganggu checkout** bila menyentuh tabel transaksi secara langsung —
  ditangani di [ANALYTICS-BI.md](../ANALYTICS-BI.md).
- Bahasa ketiga kembali aktif: tiga toolchain, tiga cara uji.

**Yang akan kami tinjau ulang bila:**
- Beban BI mulai memengaruhi latensi checkout → percepat langkah replika baca
- Kewajiban PDP ternyata lebih berat dari perkiraan → persempit data pelanggan yang disimpan
- Model AI tidak pernah dipakai pemilik → evaluasi ulang seperti asumsi A3
  ([VISION-SCOPE](../../00-product/VISION-SCOPE.md) §7)
