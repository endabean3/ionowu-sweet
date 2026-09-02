# Tech Stack & Register Keputusan Tooling

> **Status:** ✅ **Disetujui 21 Agustus 2026** · **Versi:** 1.0
> **Urutan baca:** dokumen **ke-7** dari 10-architecture
> **Tujuan:** satu halaman untuk tahu **tool apa yang dipakai** dan **kenapa**.

---

## 1. Cara Membaca Dokumen Ini

| | Arti |
|:-:|---|
| ✅ | **Ditetapkan** — disetujui 21 Agustus 2026 |
| 🔵 | **Arah disetujui, vendor menunggu penawaran** — hanya QRIS & WhatsApp (§9) |

Seluruh keputusan teknis di dokumen ini **sudah disetujui**. Yang tersisa hanya dua kontrak
komersial di §9.

Setiap rekomendasi di bawah menyertakan alasan. Bila alasannya tidak lagi berlaku,
keputusannya boleh berubah — itulah gunanya menuliskan alasan.

---

## 2. Fondasi — Sudah Ditetapkan

| Kategori | Pilihan | Sumber |
|---|---|---|
| Core POS | **Go** | [ADR-0001](./adr/0001-hybrid-go-ts-docker-architecture.md) |
| BFF & Web | **TypeScript / Next.js 15** | [FDR](./FDR.md) §1 |
| Worker analitik | **Python 3.12** — restock, CRM, BI | [ADR-0006](./adr/0006-crm-bi-and-python-service.md) · tooling di §10 |
| Basis data | **PostgreSQL 16** | [DATA-MODEL](../30-data/DATA-MODEL.md) |
| Cache & kunci | **Redis 7** | [REDIS-STRATEGY](./REDIS-STRATEGY.md) |
| Kontainer | **Docker** | [DOCKER](../50-operations/DOCKER.md) |
| Reverse proxy | **Traefik** | [ADR-0003](./adr/0003-dokploy-self-hosted-paas.md) |
| Platform deploy | **Dokploy** | [ADR-0003](./adr/0003-dokploy-self-hosted-paas.md) |
| **Penyedia VPS** | ✅ **Hostinger (KVM VPS)** | Keputusan 21 Agustus 2026 |

### Catatan Hostinger

| Hal | Ketentuan |
|---|---|
| **Region** | Pilih lokasi terdekat dengan Indonesia — **Singapura** bila tersedia. Latensi kasir langsung terpengaruh. |
| **RAM minimum** | **4 GB**; **8 GB** disarankan. Budget runtime `<2 GB` ([PERFORMANCE-BUDGET](../60-quality/PERFORMANCE-BUDGET.md) §6) + OS + Dokploy + Traefik + ruang lonjakan. |
| **OS** | Ubuntu LTS |
| **Backup bawaan Hostinger** | ⚠️ **Jangan diandalkan sebagai satu-satunya backup.** Ia berada di infrastruktur yang sama dengan VPS. Tetap wajib backup ke penyimpanan pihak lain — lihat §8. |
| **Firewall** | Firewall panel Hostinger **tidak menggantikan** UFW, dan tidak melindungi dari jebakan Docker↔UFW ([NETWORK-HARDENING](../50-operations/NETWORK-HARDENING.md) §3). Pasang keduanya. |

> **Yang perlu diverifikasi di akun Anda:** ketersediaan region Singapura, RAM plan yang
> aktif, dan apakah snapshot/backup termasuk dalam paket.

---

## 3. Backend Go — Rekomendasi

Prinsip pemilihan: **sedikit dependensi, SQL yang terlihat, tanpa refleksi di jalur uang.**

> **Versi dipin di `.devcontainer/Dockerfile`** (22 Agu 2026) — seluruh toolchain berjalan
> di dalam Dev Container, image yang sama dipakai CI:
> `Go 1.26` · `Node 24 LTS` · `pnpm 11.22.0` · `Python 3.12` · `goose v3.27.3` ·
> `sqlc v1.31.1` · `golangci-lint v2.12.2`
>
> Catatan: **hanya Node.js yang punya LTS resmi.** Go didukung 2 rilis terakhir, Python
> 5 tahun per versi, PostgreSQL 5 tahun per mayor. Prinsip yang berlaku: *versi stabil
> yang masih dalam masa dukungan*, bukan "harus LTS".

| Kategori | Rekomendasi | Status | Alasan |
|---|---|:-:|---|
| HTTP router | **`chi`** | ✅ | Kompatibel `net/http`, sangat tipis, mendukung rantai middleware yang dibutuhkan `TenantMiddleware` ([SECURITY](../40-security/SECURITY.md) §2A) |
| Driver DB | **`pgx/v5`** | ✅ | Driver Postgres tercepat di Go, protokol biner |
| Akses kueri | **`sqlc`** | ✅ | SQL tetap terbaca & dapat ditinjau. Konfigurasi + 23 kueri: [30-data/sqlc.yaml](../../30-data/sqlc.yaml) |
| Migrasi | **`goose`** | ✅ | SQL murni, biner tunggal ([MIGRATIONS](../30-data/MIGRATIONS.md) §2) |
| Klien Redis | **`redis/go-redis/v9`** | ✅ | Paling umum, mendukung Streams |
| JWT | **`golang-jwt/jwt/v5`** | ✅ | Mendukung EdDSA (Ed25519) sesuai [SECURITY](../40-security/SECURITY.md) §4B |
| Argon2id | **`golang.org/x/crypto/argon2`** | ✅ | Pustaka resmi Go, tanpa pihak ketiga |
| ULID | **`oklog/ulid/v2`** | ✅ | |
| Validasi | **`go-playground/validator/v10`** | ✅ | |
| Logging | **`log/slog`** (bawaan) | ✅ | JSON terstruktur sesuai [OBSERVABILITY](../50-operations/OBSERVABILITY.md) §4, tanpa dependensi |
| Metrik | **`prometheus/client_golang`** | ✅ | |
| Uji | **`testify`** + **`testcontainers-go`** | ✅ | Postgres & Redis sungguhan saat uji |
| Linter | **`golangci-lint`** | ✅ | |

> **Kenapa `sqlc` dan bukan ORM:** aturan emas `WHERE tenant_id = $1`
> ([SECURITY](../40-security/SECURITY.md) §2B) hanya bisa ditegakkan bila SQL-nya terlihat
> saat code review. ORM menyembunyikan kueri yang dihasilkannya — dan kebocoran antar-tenant
> adalah kegagalan paling fatal di sistem ini. `sqlc` juga menghilangkan refleksi runtime,
> yang membantu memenuhi anggaran `<5ms`.

---

## 4. Frontend & PWA — Rekomendasi

### Sudah ditetapkan

Next.js 15 · Tailwind · `framer-motion` · `vaul` · `sonner` · `cmdk` · `lucide-react` · `dexie`
— sumber: [fondasi-UI-v0.1.md](../70-design-system/fondasi-UI-v0.1.md) §8.

### Tambahan yang direkomendasikan

| Kategori | Rekomendasi | Status | Alasan |
|---|---|:-:|---|
| Manajer paket | **`pnpm`** | ✅ | Hemat disk (penting saat build), `node_modules` ketat mencegah dependensi hantu |
| Validasi | **`zod`** | ✅ | Skema sekaligus tipe TypeScript |
| Linter + formatter | **Biome** | ✅ | Satu tool menggantikan ESLint + Prettier; jauh lebih cepat, konfigurasi lebih sedikit untuk tim kecil |
| Uji unit | **Vitest** | ✅ | |
| E2E | **Playwright** | ✅ | `context.setOffline(true)` — **satu-satunya cara menguji pembeda utama produk** |
| **Service Worker** | **Serwist** *(penerus `next-pwa`, berbasis Workbox)* | ✅ | Lihat §5 |

---

## 5. Keputusan: Service Worker & Pembagian Peran Sinkronisasi

Ini celah paling serius di audit sebelumnya. Rekomendasinya terdiri dari dua bagian yang
harus dibaca bersama.

### A. Pustaka

**Serwist** — penerus `next-pwa` yang masih dipelihara, dibangun di atas Workbox, terintegrasi
dengan Next.js. Bila status pemeliharaannya berubah saat implementasi, jatuhkan ke
**Workbox langsung** dengan SW yang ditulis sendiri; strateginya tetap sama.

### B. Strategi caching per jenis aset

| Aset | Strategi | Alasan |
|---|---|---|
| App shell (HTML/JS/CSS) | **Precache** saat instalasi | Kasir harus bisa langsung offline setelah instal |
| Katalog produk | **IndexedDB (Dexie)**, bukan cache SW | Butuh kueri, bukan sekadar penyimpanan berkas |
| Gambar produk | `StaleWhileRevalidate`, batas kuota | Boleh dibuang saat tekanan penyimpanan |
| Font Google | `CacheFirst`, jangka panjang | |
| Panggilan API | **Jangan di-cache SW** | Ditangani TanStack Query & antrean sinkronisasi |

### C. ⚠️ Batas yang tidak boleh dilanggar

> **Antrean transaksi TIDAK berada di Service Worker, dan TIDAK di TanStack Query.**
> Ia adalah implementasi sendiri di atas Dexie, sesuai
> [OFFLINE-SYNC-SPEC](../30-data/OFFLINE-SYNC-SPEC.md).

| Komponen | Boleh menangani | **Tidak boleh** |
|---|---|---|
| Service Worker | Aset statis, app shell | Transaksi |
| TanStack Query | Cache **baca**: katalog, laporan, dasbor | **Antrean tulis transaksi** |
| Antrean sendiri (Dexie) | **Seluruh tulis transaksi** | — |

Alasannya: antrean transaksi butuh jaminan yang tidak diberikan pustaka mana pun —
urutan FIFO ketat, idempotensi berbasis ULID, batch maksimal 50, dan antrean mati yang
dapat diaudit. **Uang tidak boleh bergantung pada kebijakan retry pustaka pihak ketiga.**

### D. Background Sync API — jangan diandalkan

Menarik, tetapi dukungannya tidak merata (tidak ada di Safari). Karena kita menetapkan
Android sebagai platform kasir resmi ([HARDWARE-SUPPORT](../60-quality/HARDWARE-SUPPORT.md) §5),
ia **boleh dipakai sebagai percepatan** — tetapi aplikasi wajib tetap mampu mengosongkan
antrean sendiri saat terbuka. Jangan menjadikannya satu-satunya pemicu sinkronisasi.

---

## 6. CI, Registry & Lokasi Build

| Kategori | Rekomendasi | Status |
|---|---|:-:|
| Platform CI | **GitHub Actions** | ✅ |
| Registry image | **GitHub Container Registry (`ghcr.io`)** | ✅ |
| **Lokasi build** | **Di CI, bukan di VPS** | ✅ |

### Kenapa build dipindahkan dari VPS

[ADR-0003](./adr/0003-dokploy-self-hosted-paas.md) menerima build di VPS sebagai biaya, dengan
catatan akan ditinjau bila mengganggu produksi. Dengan Hostinger sebagai VPS tunggal yang
melayani seluruh tenant, saya sarankan **tidak menunggu gangguan itu terjadi**:

* Build Next.js dapat menghabiskan memori **saat kasir sedang bertransaksi**
* Image lama menumpuk dan memakan disk — penyebab paling umum di
  [runbook database-full](../50-operations/runbooks/database-full.md) §2
* Rollback saat ini berarti **build ulang dari commit lama**, yang tidak dijamin menghasilkan
  image identik. Dengan registry, rollback cukup menarik tag lama — jauh lebih aman
  ([DEPLOYMENT](../50-operations/DEPLOYMENT.md) §5)

Alurnya menjadi: `push → GitHub Actions build & uji → push image ke ghcr.io → Dokploy tarik image`.

Dicatat sebagai [ADR-0004](./adr/0004-ci-build-and-registry.md).

---

## 7. Observabilitas — Rekomendasi yang Merevisi Posisi Sebelumnya

[OBSERVABILITY](../50-operations/OBSERVABILITY.md) §6 semula menyarankan tumpukan
**self-hosted** agar sejalan dengan Dokploy. **Saya merevisi rekomendasi itu**, dengan dua alasan:

1. **Anggaran memori tidak cukup.** Prometheus + Grafana + Loki + Sentry self-hosted
   menghabiskan ratusan MB sampai beberapa GB — di VPS yang sama dengan kasir. Sentry
   self-hosted saja butuh sumber daya melebihi seluruh stack aplikasi kita.
2. **Pemantau yang ikut mati tidak berguna.** Ini sudah saya tulis sendiri untuk uptime,
   tetapi berlaku untuk metrik dan log juga: saat VPS bermasalah, justru itulah saat kita
   paling butuh datanya.

| Kategori | Rekomendasi | Status |
|---|---|:-:|
| Metrik & log | **Grafana Cloud (free tier)** | ✅ |
| Error tracking | **Sentry SaaS (free tier)** | ✅ |
| Uptime eksternal | **Uptime Kuma** di host terpisah, atau UptimeRobot free | ✅ |
| **Analytics produk** | **Tabel PostgreSQL sendiri** | ✅ |

### Kenapa analytics disimpan sendiri, bukan PostHog/Umami

Hitung volumenya: 100 outlet × 200 transaksi/hari ≈ **20.000 event/hari**. Itu sangat kecil
untuk Postgres. Kita **sudah** punya infrastruktur event (outbox + Streams), sudah punya
aturan `tenant_id`, dan taksonomi event di
[ANALYTICS-EVENTS](../00-product/ANALYTICS-EVENTS.md) butuh properti khusus yang tidak
dilayani dengan baik oleh alat analitik web. Menambah PostHog berarti menambah ClickHouse
dan satu layanan lagi untuk dirawat — tanpa manfaat pada skala ini.

Visualisasinya cukup dengan SQL, atau **Metabase** bila nanti dibutuhkan.

> **Soal privasi:** mengirim metrik dan log ke layanan eksternal dapat diterima **karena
> aturan Zero-Sensitive-Logging** ([SECURITY](../40-security/SECURITY.md) §7) sudah melarang
> data pribadi dan transaksi masuk ke log. Yang keluar hanyalah `request_id`, `tenant_id`,
> status, dan durasi. **Data transaksi tetap 100% di VPS sendiri.** Bila aturan §7 dilanggar,
> rekomendasi ini ikut gugur.

Dicatat sebagai [ADR-0005](./adr/0005-telemetry-external-data-internal.md).

---

## 8. Penyimpanan Backup

| Kategori | Rekomendasi | Status | Alasan |
|---|---|:-:|---|
| Object storage | **Cloudflare R2** | ✅ | Tanpa biaya egress — penting karena **biaya keluar adalah yang menghalangi orang menguji restore** |
| Alternatif | Backblaze B2 | ✅ | Bila R2 tidak cocok |

**Syarat mutlak:** penyedia harus **berbeda dari Hostinger**. Backup yang berada di
infrastruktur yang sama dengan VPS tidak melindungi dari kehilangan akun atau kegagalan
tingkat penyedia ([BACKUP-DR](../50-operations/BACKUP-DR.md) §3).

---

## 9. Integrasi Pihak Ketiga

| Kategori | Rekomendasi | Status | Catatan |
|---|---|:-:|---|
| **Gateway QRIS** | **Midtrans** sebagai kandidat utama, Xendit sebagai pembanding | 🔵 | Keputusan **komersial** — biaya per transaksi & jadwal settlement wajib diambil dari penawaran resmi, bukan asumsi. Lihat [INTEGRATION-QRIS](../20-api/INTEGRATION-QRIS.md) §2 |
| **WhatsApp** | **WhatsApp Business Platform resmi** (Cloud API / lewat BSP) | 🔵 | Lihat peringatan di bawah |

> ### ⚠️ Jangan memakai pustaka WhatsApp tidak resmi
>
> Pustaka tidak resmi (yang mengendalikan WhatsApp Web) lebih murah dan lebih cepat dipasang,
> tetapi berisiko **pemblokiran nomor**. Bila nomor gateway diblokir, FR-50 dan FR-51 mati
> untuk **seluruh tenant sekaligus** — dan pemulihannya tidak berada di tangan kita.
>
> API resmi berbiaya per percakapan dan pesan yang dimulai bisnis membutuhkan template
> yang disetujui. Keduanya menambah biaya dan proses, tetapi menghilangkan risiko kegagalan
> menyeluruh yang tidak dapat kita kendalikan.

**Model sub-merchant** tetap direkomendasikan untuk QRIS — bukan agregator — agar uang
pelanggan tidak mengalir melalui rekening kita
([INTEGRATION-QRIS](../20-api/INTEGRATION-QRIS.md) §2).

---

## 10. Layanan Python — Aktif, dengan Tooling Ditetapkan

> **Direvisi 21 Agustus 2026.** Bagian ini semula merekomendasikan **menunda** layanan Python
> ke Fase 2. Rekomendasi itu **dibatalkan** oleh
> [ADR-0006](./adr/0006-crm-bi-and-python-service.md): dasarnya gugur begitu **CRM dan
> Business Intelligence** masuk ruang lingkup produk.

Layanan Python kini menopang tiga hal, bukan satu:
prediksi restock · **segmentasi pelanggan (CRM)** · **agregasi BI**.

### Tooling Python

| Kategori | Pilihan | Alasan |
|---|---|---|
| Versi | **Python 3.12** | |
| Manajer paket | **`uv`** | Jauh lebih cepat dari pip/poetry; lockfile deterministik |
| Akses DB | **`psycopg3`** + SQLAlchemy **Core** | Core, bukan ORM — SQL tetap terlihat, sejalan dengan alasan memilih `sqlc` di §3 |
| Analitik | **`pandas`** | Ekosistem scikit-learn berbasis pandas |
| Analitik kolumnar | **`duckdb`** | Agregasi BI tanpa layanan baru ([ANALYTICS-BI](./ANALYTICS-BI.md) §3) |
| ML | **`scikit-learn`** | Segmentasi, churn, association rules |
| Penjadwalan | **APScheduler** | Dalam proses; jendela 02.00–05.00 WIB |
| Konsumsi event | **`redis-py`** | Redis Streams |
| Validasi | **`pydantic` v2** | |
| Linter + formatter | **`ruff`** | Satu tool menggantikan flake8 + isort + black |
| Uji | **`pytest`** | |

> **Tanpa FastAPI untuk saat ini.** Layanan ini adalah *worker terjadwal*, bukan API. Ia
> membaca dari Postgres, menulis hasil ke tabelnya sendiri, dan menerbitkan event.
> Menambahkan server HTTP berarti menambahkan port, health check, dan rute yang harus
> diamankan — tanpa kebutuhan nyata. Tambahkan bila kelak dibutuhkan inferensi sinkron.

### Dampak ke Ukuran Server

Anggaran memori bertambah, dan ini **mengubah rekomendasi plan VPS**:

```
Sebelumnya          ≈ 2,0 GB   → 4 GB cukup
+ intelligence-worker  512 MB
+ ruang kerja pandas/duckdb   ~ 512 MB saat agregasi malam
────────────────────────────
Sekarang            ≈ 3,0 GB   → 4 GB SANGAT KETAT · 8 GB disarankan
```

> **Rekomendasi berubah dari "4 GB cukup" menjadi "8 GB minimum".** Agregasi BI memuat data
> ke memori; pada 4 GB, job malam berisiko meng-OOM — dan bila itu terjadi, ia dapat menyeret
> `pos-engine` ikut mati. Batas memori per kontainer wajib dipasang
> ([ANALYTICS-BI](./ANALYTICS-BI.md) §5).

---

## 11. Status Persetujuan

### ✅ Disetujui 21 Agustus 2026

| # | Keputusan | Tindak lanjut |
|---|---|---|
| 1 | Stack backend Go (§3) | Mulai implementasi |
| 2 | Serwist + batas peran sinkronisasi (§5) | **P0** — menopang janji offline |
| 3 | GitHub Actions + ghcr.io, build di CI (§6) | [ADR-0004](./adr/0004-ci-build-and-registry.md) — Diterima |
| 4 | Telemetri eksternal, data internal (§7) | [ADR-0005](./adr/0005-telemetry-external-data-internal.md) — Diterima |
| 5 | Cloudflare R2 untuk backup (§8) | Buat bucket, uji restore |
| 6 | ~~Tunda layanan Python~~ → **dibatalkan** oleh [ADR-0006](./adr/0006-crm-bi-and-python-service.md) | Python aktif Fase 1; tooling di §10 |
| 7 | **Arah** integrasi: QRIS sub-merchant, WhatsApp API resmi (§9) | Vendor final menunggu penawaran |

### 🔵 Menunggu Penawaran Komersial

| Kebutuhan | Arah yang disetujui | Yang masih dibutuhkan |
|---|---|---|
| Gateway QRIS | Model **sub-merchant**, bukan agregator. Midtrans dievaluasi lebih dulu. | Biaya per transaksi, jadwal settlement, syarat onboarding merchant |
| WhatsApp | **API resmi** (Cloud API / BSP). Pustaka tidak resmi ditolak. | Pilihan BSP, biaya per percakapan, persetujuan template |

Keduanya memblokir FR-23, FR-50, dan FR-51 — tetapi **tidak memblokir Fase 0**
([ROADMAP](../00-product/ROADMAP.md) §3), yang hanya membutuhkan pembayaran tunai.

---

## 12. Aturan

1. **Setiap tool baru dicatat di sini** beserta status dan alasannya.
2. **Pemilihan yang sulit dibalik butuh ADR** — basis data, gateway pembayaran, platform deploy.
3. **Status 🟢 belum berarti disetujui.** Naikkan ke ✅ setelah ada persetujuan eksplisit.
4. **Jangan menambah tool tanpa menghapus yang fungsinya tumpang tindih.** §5 adalah contoh
   biaya yang ditimbulkan tumpang tindih yang tidak disadari.
