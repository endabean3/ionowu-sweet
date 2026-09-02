# Observabilitas & SLO

> **Status:** 🟡 Draft · **Prioritas:** 🟠 P1
> **Dokumen Terkait:** [SCALABILITY-RELIABILITY.md](../10-architecture/SCALABILITY-RELIABILITY.md) §6

---

## 1. Masalahnya

[PRD](../00-product/PRD-01-POS-INTI.md) §4 menjanjikan `<5ms` API dan `<50ms` UI, dengan
metode verifikasi "benchmark k6". **Benchmark mengukur laboratorium, bukan toko.**

Tanpa pengukuran produksi, kita tidak akan tahu sistem melambat sampai ada pemilik yang
mengeluh — dan pada saat itu, kasir sudah berhari-hari bekerja dengan sistem yang lambat.

---

## 2. Service Level Objectives

| SLO | Target | Jendela | Bila dilanggar |
|---|---|---|---|
| **Ketersediaan checkout** | 99,5% | 30 hari | Hentikan fitur baru |
| **Latensi checkout p99** | <5 ms | 7 hari | Investigasi performa |
| **Latensi checkout p99,9** | <50 ms | 7 hari | |
| **Keberhasilan sinkronisasi** | >99,9% batch | 7 hari | 🔴 Insiden — ini uang |
| **Kebocoran antar-tenant** | 0 | selamanya | 🔴 Insiden kritis, hentikan rilis |
| INP UI kasir p75 | <50 ms | 28 hari | Perbaiki performa klien |

**Error budget:** 99,5% selama 30 hari ≈ **3,6 jam** waktu henti. Bila terpakai habis,
seluruh kapasitas tim beralih ke keandalan sampai jendela berikutnya.

> Ketersediaan 99,5% terdengar rendah untuk sistem keuangan, dan memang disengaja: offline-first
> berarti VPS mati **tidak** menghentikan penjualan. Yang benar-benar tidak boleh gagal adalah
> **sinkronisasi** — karena di situlah uang bisa hilang dari catatan.

---

## 3. Metrik Wajib

### Jalur uang

| Metrik | Jenis | Alarm |
|---|---|---|
| `checkout_duration_ms` | histogram | p99 >5ms selama 15 menit |
| `sync_batch_success_total` / `_failed_total` | counter | rasio gagal >0,1% |
| `sync_queue_depth` | gauge (per perangkat) | >100 |
| `transaction_total_mismatch_total` | counter | **>0 → alarm segera** |
| `stock_negative_events_total` | counter | lonjakan mendadak |
| `webhook_signature_invalid_total` | counter | **>0 → alarm keamanan** |

### Kesehatan klien — jarang dipantau, paling menentukan

| Metrik | Alarm |
|---|---|
| `indexeddb_usage_pct` | >70% |
| `device_offline_duration_minutes` | >1440 (1 hari) |
| `oldest_unsynced_transaction_age_hours` | >24 |
| `persistent_storage_granted` | false → **investigasi** |

> Bagian ini yang paling sering terlewat. Server bisa tampak sehat sempurna sementara sebuah
> perangkat kasir mendekati IndexedDB penuh — satu-satunya jalur menuju "toko tidak bisa
> berjualan" ([OFFLINE-SYNC-SPEC.md](../30-data/OFFLINE-SYNC-SPEC.md) §4).
> **Telemetri klien harus ikut dikirim bersama antrean sinkronisasi.**

### Sistem

`http_requests_total`, `db_connection_pool_used` (alarm >80% — worker bisa menguras pool),
`redis_hit_ratio`, `event_consumer_lag_seconds` (>60), `dead_letter_queue_depth` (**>0**).

---

## 4. Log Terstruktur

Format JSON dengan bidang wajib:

```json
{
  "timestamp":"2026-08-21T04:12:33Z", "level":"info",
  "request_id":"req_01JM...", "tenant_id":"01J...", "outlet_id":"01J...",
  "service":"pos-engine", "duration_ms":3.2, "status":200
}
```

Yang **dilarang** muncul di log — `password`, `pin_code`, token, header Authorization, data
kartu ([SECURITY.md](../40-security/SECURITY.md) §7). Ini harus diuji, bukan diandalkan pada
kehati-hatian: tambahkan pemeriksaan otomatis yang menggagalkan CI bila pola rahasia muncul
di log pengujian.

---

## 5. Alarm

| Tingkat | Contoh | Respons |
|---|---|---|
| 🔴 **Kritis** | Sync gagal >1%, dugaan kebocoran tenant, DB mati | Segera, bangunkan orang |
| 🟠 **Peringatan** | p99 >5ms, antrean mati >0, IndexedDB >70% | Jam kerja |
| 🟡 **Info** | Deploy, migrasi selesai | Tidak ada |

**Aturan:** setiap alarm kritis wajib punya runbook di [runbooks/](./runbooks/). Alarm tanpa
prosedur hanya menciptakan kepanikan pada pukul dua pagi.

---

## 6. Tooling

> ⚠️ **Direvisi 21 Agustus 2026.** Bagian ini semula merekomendasikan tumpukan self-hosted.
> Setelah VPS ditetapkan (Hostinger, satu instans), rekomendasi itu tidak bertahan terhadap
> anggaran memori `<2 GB` — dan terhadap prinsip yang kami tulis sendiri: **pemantau yang
> ikut mati bersama VPS tidak berguna.** Lihat
> [ADR-0005](../10-architecture/adr/0005-telemetry-external-data-internal.md).

| Kebutuhan | Keputusan |
|---|---|
| Metrik & log | **Grafana Cloud (free tier)** — eksternal |
| Error tracking | **Sentry SaaS (free tier)** — Sentry self-hosted butuh sumber daya melebihi seluruh stack aplikasi |
| Uptime eksternal | **Uptime Kuma di host terpisah** / UptimeRobot |
| Analytics produk | **Tabel PostgreSQL sendiri** — tetap internal |

**Data transaksi tetap 100% di VPS.** Yang keluar hanyalah `request_id`, `tenant_id`, status,
dan durasi — dijamin oleh Zero-Sensitive-Logging ([SECURITY](../40-security/SECURITY.md) §7).
Bila aturan itu dilanggar, keputusan ini ikut gugur.

**Anggaran sumber daya:** tumpukan pemantauan tidak boleh mengganggu kasir. Beri batas memori
tegas; bila VPS mulai sesak, **pemantauan dikorbankan lebih dulu, bukan checkout**
([SCALABILITY-RELIABILITY.md](../10-architecture/SCALABILITY-RELIABILITY.md) §4).

---

## 7. Dasbor Minimum

1. **Kesehatan kasir** — latensi checkout, tingkat error, transaksi/menit
2. **Kesehatan sinkronisasi** — keberhasilan batch, kedalaman antrean, perangkat tertinggal
3. **Kesehatan armada perangkat** — pemakaian IndexedDB, status offline per outlet
4. **Sistem** — CPU, memori, koneksi DB, Redis
