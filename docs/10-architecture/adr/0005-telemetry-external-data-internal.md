# ADR-0005: Telemetri di Layanan Eksternal, Data Transaksi Tetap di VPS Sendiri

| Metadata | Nilai |
|---|---|
| **Status** | **Diterima** (21 Agustus 2026) |
| **Tanggal** | 2026-08-21 |
| **Merevisi** | [OBSERVABILITY.md](../../50-operations/OBSERVABILITY.md) §6 (semula menyarankan self-hosted) |
| **Dokumen Acuan** | [TECH-STACK.md](../TECH-STACK.md) §7 |

## Konteks

[OBSERVABILITY](../../50-operations/OBSERVABILITY.md) §6 semula merekomendasikan tumpukan
pemantauan **self-hosted** (Prometheus, Grafana, Loki, Sentry) agar sejalan dengan posisi
Dokploy self-hosted di [ADR-0003](./0003-dokploy-self-hosted-paas.md).

Setelah VPS ditetapkan (Hostinger, satu instans, RAM 4–8 GB), rekomendasi itu tidak lagi
bertahan terhadap dua kenyataan:

1. **Anggaran memori.** [PERFORMANCE-BUDGET](../../60-quality/PERFORMANCE-BUDGET.md) §6
   menetapkan total runtime `<2 GB`. Sentry self-hosted sendirian membutuhkan sumber daya
   melebihi seluruh stack aplikasi. Menambahkan tumpukan pemantauan penuh berarti bersaing
   memori dengan `pos-engine` — melanggar prinsip "checkout adalah yang terakhir dikorbankan"
   ([SCALABILITY-RELIABILITY](../SCALABILITY-RELIABILITY.md) §4).
2. **Pemantau yang ikut mati tidak berguna.** Prinsip ini sudah kami tulis untuk uptime,
   tetapi berlaku sama untuk metrik dan log: saat VPS bermasalah, justru saat itulah datanya
   paling dibutuhkan.

## Alternatif yang Dipertimbangkan

| Opsi | Kelebihan | Kekurangan | Alasan |
|---|---|---|---|
| Self-hosted penuh | Data tidak keluar | Bersaing memori dengan kasir; ikut mati bersama VPS | Ditolak |
| **Telemetri eksternal, data internal** | Nol beban VPS; bertahan saat VPS mati; free tier memadai | Telemetri keluar ke pihak ketiga | **Dipilih** |
| Tanpa pemantauan | Paling murah | Target NFR tidak pernah terbukti; kegagalan diketahui dari keluhan pemilik | Ditolak |

## Keputusan

| Kebutuhan | Layanan |
|---|---|
| Metrik & log | Grafana Cloud (free tier) |
| Error tracking | Sentry SaaS (free tier) |
| Uptime | Uptime Kuma di host terpisah / UptimeRobot |
| **Analytics produk** | **Tabel PostgreSQL sendiri** — tetap internal |
| **Seluruh data transaksi** | **Tetap 100% di VPS sendiri** |

## Kenapa Ini Tidak Melanggar Prinsip Privasi

Keputusan ini bergantung sepenuhnya pada satu aturan yang sudah berlaku:
**Zero-Sensitive-Logging** ([SECURITY](../../40-security/SECURITY.md) §7) melarang password,
PIN, token, dan data pelanggan masuk ke log.

Artinya yang keluar hanyalah `request_id`, `tenant_id`, `outlet_id`, kode status, dan durasi
— metadata operasional, bukan data usaha pelanggan. Catatan transaksi, katalog, harga, dan
identitas pengguna **tidak pernah** meninggalkan VPS.

> **Ketergantungan ini harus dipahami:** bila aturan §7 dilanggar — misalnya seseorang
> menambahkan `log.Info(user)` — maka data pribadi akan mengalir ke pihak ketiga, dan ADR ini
> ikut gugur. Karena itu gerbang CI "tidak ada rahasia di log uji"
> ([TESTING-STRATEGY](../../60-quality/TESTING-STRATEGY.md) §6) bukan sekadar kerapian,
> melainkan **penopang keputusan ini**.

## Konsekuensi

**Positif:**
- Nol beban memori di VPS produksi
- Pemantauan tetap hidup saat VPS mati — justru saat paling dibutuhkan
- Free tier memadai pada skala yang direncanakan
- Analytics produk tetap internal, memakai infrastruktur event yang sudah ada

**Negatif / biaya yang kami terima:**
- Metadata operasional berada di pihak ketiga
- Batas free tier perlu dipantau; pertumbuhan bisa memunculkan biaya
- Bergantung pada disiplin Zero-Sensitive-Logging yang harus ditegakkan otomatis

**Yang akan kami tinjau ulang bila:**
- Biaya melampaui nilai VPS kedua → self-host di host terpisah, **bukan** di VPS produksi
- Kewajiban kepatuhan melarang metadata keluar ([COMPLIANCE-ID](../../40-security/COMPLIANCE-ID.md))
