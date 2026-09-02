# Changelog Dokumentasi

Perubahan struktural pada dokumentasi. Bukan changelog produk.

---

## [1.3.0] — 2026-08-22

### Ditambahkan
* **`CLAUDE.md`** — konteks proyek yang **ikut berpindah bersama repositori**.
  Berbeda dari memori lokal Claude (`~/.claude/projects/.../memory/`) yang terikat pada
  mesin & akun, berkas ini ter-commit ke git sehingga tetap berlaku di perangkat atau
  akun mana pun.

  Isinya bukan ringkasan dokumentasi, melainkan: sumber kebenaran saat dokumen bertentangan ·
  **12 keputusan yang jangan ditawarkan ulang** · **10 hal yang sudah ditolak** ·
  **8 invarian yang tidak boleh dilanggar** · kondisi terkini · cara kerja di repo ini.

---

## [1.2.0] — 2026-08-22

### Audit menyeluruh — nol error
86 dokumen divalidasi terhadap 8 kelas kesalahan: link relatif · referensi §seksi ·
penanda basi · file yatim · kontradiksi antar-dokumen · heading duplikat · tabel rusak ·
blok kode tak tertutup. **Hasil: 0.**

### Diperbaiki
* **9 penanda basi** — dokumen menyebut berkas "belum ditulis" padahal sudah ada
* **7 kontradiksi nyata:**
  * `DOCKER.md` & `REPOSITORY.md` masih menyatakan layanan Python ditunda (dibatalkan ADR-0006)
  * **BOM di Fase 4 vs Fase 1** — diselesaikan: BOM ringan naik ke **Fase 1**
    (Warung Wangi & arketipe C membutuhkannya), manufaktur penuh tetap Fase 4 bersyarat
  * `DOKPLOY.md` masih menyebut lokasi build sebagai keputusan terbuka (ditutup ADR-0004)
  * runbook `database-full` masih menyebut build di VPS sebagai penyebab image menumpuk
  * **`ANALYTICS-BI` menulis `quantity_sold INT`** sementara migrasi memakai `DECIMAL(14,3)`
  * Blok SQL lama di `DATA-MODEL.md` kini ditandai `⚠️ BENTUK LAMA`
* Tabel memori di `PERFORMANCE-BUDGET` — jumlah kolom tidak konsisten
* `CHANGELOG` & `CONTRIBUTING` sebelumnya tidak tertaut dari mana pun

### Ditambahkan
* **`15-development/DEV-VS-PROD.md`** — batas tegas dev / staging / produksi:
  tabel perbedaan baris-per-baris, **5 kebiasaan dev yang berbahaya di produksi**,
  daftar hal yang justru **wajib sama**, dan perjalanan satu perubahan dari laptop ke produksi

---

## [1.1.0] — 2026-08-22

### sqlc & kueri jalur checkout
* `30-data/sqlc.yaml` — konfigurasi pgx/v5, override `numeric` → `decimal.Decimal`
* `30-data/queries/` — **23 kueri** (catalog 6 · shift 5 · checkout 12), 7 ditandai `HOT PATH`

### 🔒 Aturan emas kini ditegakkan otomatis
`sqlc vet` menolak kueri yang tidak memfilter `tenant_id`, memakai `SELECT *`, atau
`DELETE` pada tabel keuangan. SECURITY §2B berubah dari konvensi menjadi gerbang CI.

### Keputusan yang dikunci dalam SQL
* **`DecrementStockStrict` vs `DecrementStockAllowNegative`** — dua kueri berbeda,
  karena checkout online menolak stok kurang sementara sync offline wajib menerimanya
* **Mutex stok = kunci baris Postgres**, bukan Redis — `UPDATE` tunggal sudah atomik;
  menambah Redis ke jalur ini menambah titik kegagalan di bagian paling kritis
* **`CreateSaleIdempotent`** — `ON CONFLICT DO NOTHING RETURNING`; 0 baris = duplikat
  (kelas ACCEPTED), bukan error
* **`InsertOutboxEvent`** dalam transaksi yang sama — mengatasi dual-write
* **`CalculateExpectedCash`** mengecualikan `is_late_arrival` — Z-Report tidak berubah retroaktif
* `numeric` → `decimal.Decimal`, **tidak pernah `float64`**

### Belum diverifikasi
Belum pernah dijalankan lewat `sqlc generate` (belum ada lingkungan Go).
Validasi statis lulus: 23 kueri, 0 masalah tenant-scope, parameter berurutan.

---

## [1.0.0] — 2026-08-22

### Migrasi awal ditulis — dari dokumen menjadi kode
`30-data/migrations/` — **9 berkas, 47 tabel, 57 indeks**, validasi dependensi FK lulus.

| # | Isi |
|---|---|
| 00001 | tenants · outlets · users · `user_outlet_assignments` · refresh_tokens |
| 00002 | platform_admins · breakglass_sessions · identities · distributors · model izin |
| 00003 | katalog dengan **`DECIMAL(14,3)` + `uom` + `item_type` + BOM + konversi satuan** |
| 00004 | customers · consents · segments · interactions |
| 00005 | shifts · cash_movements · sales · items · payments · refunds |
| 00006 | stock_events · opname · transfer antar-outlet |
| 00007 | sync_receipts · webhook · **event_outbox** · background_jobs · audit_logs |
| 00008 | daily_outlet_summary · product_performance · restock_predictions |
| 00009 | sop_templates · sop_executions |

### Diselesaikan
* 🔴 **Celah `stock_quantity INT` tertutup.** Skema awal langsung `DECIMAL(14,3)` — Warung
  Wangi (ml) & Media Boga (gram) kini dapat dilayani tanpa `ALTER` di kemudian hari.
* Seluruh tabel yang tercecer di berbagai dokumen kini punya DDL nyata: `event_outbox`,
  `user_outlet_assignments`, `outlet_price_overrides`, `is_sandbox`, `is_late_arrival`.
* `30-data/migrations/` menjadi **sumber kebenaran skema**; DATA-MODEL.md menjadi penjelasan rancangan.

### Belum masuk migrasi
`settlement_reports` (menunggu vendor QRIS) · langganan & tagihan (menunggu finalisasi paket) ·
order pekerjaan & slot waktu (arketipe E & D, Fase 3–4)

---

## [0.9.0] — 2026-08-22

### Ditambahkan
* `00-product/MARKET-SEGMENTS.md` — **6 arketipe operasional** + katalog ~50 jenis usaha UMKM
* `00-product/SOP-MODULE.md` — SOP per kategori, tiga lapis: template → penegakan → penemuan

### 🔴 Temuan kritis
* **`stock_quantity INT` membuat kedua pelanggan fix tidak bisa dilayani.**
  Warung Wangi (ml) & Media Boga (gram) butuh `DECIMAL(14,3)` + UOM + konversi satuan.
  Naik menjadi **P0 nomor 0** — lebih murah diubah sekarang selagi tabel kosong.

### Prinsip baru
* **Universal dari sisi rancangan, fokus dari sisi pemasaran** — model data mencakup
  6 arketipe sejak awal (`item_type`), urutan fitur tetap bertahap
* **Kategori usaha = konfigurasi, bukan cabang kode** — sejalan dengan model izin RBAC §7

### Diubah
* Legalitas usaha (izin, NPWP, PIRT, pajak) → **tanggung jawab owner/tenant**.
  Yang tetap melekat pada kita: UU PDP sebagai pemroses & keamanan data.
  Paparan diperkecil lewat model sub-merchant + DPA. **Tidak memblokir Fase 0.**
* SOP naik menjadi **pembeda utama produk**, masuk Fase 1

---

## [0.8.0] — 2026-08-21

### Arah produk: mini ERP
* `00-product/ERP-MODULE-MAP.md` — peta 8 modul ERP, urutan pengerjaan, dan **peringatan
  ruang lingkup**: ERP adalah kategori produk berbeda, bukan POS + fitur
* Urutan disarankan: Purchasing → Finance ringan → HR ringan → Manufacturing (bersyarat)
* Tetap di Non-Goals: buku besar, payroll, e-faktur, marketplace pemasok

### Katalog peran lengkap — [RBAC-MODEL](./40-security/RBAC-MODEL.md) §6
* **18 peran** dalam 3 kelas, lengkap dengan pentahapan
* 🔑 **Rekomendasi utama: model berbasis izin (§7)**, bukan 18 peran keras —
  `permissions` + `role_templates` + peran kustom per tenant
* Peran bernilai tinggi & murah: `auditor`, `external_accountant` (baca saja)
* Peran kunci pertumbuhan: `area_manager` — tanpanya pertumbuhan berhenti di kapasitas owner

### Ditandai perlu ditinjau
* **North Star** kemungkinan salah — mengukur pemakaian, bukan pertumbuhan tenant
* Lanskap kompetitif berubah: kini juga Accurate, Jurnal, Majoo
* **Modul SOP** diusulkan sebagai pembeda utama — belum ada di roadmap mana pun

---

## [0.7.0] — 2026-08-21

### Model hak akses dirombak — [ADR-0007](./10-architecture/adr/0007-principal-classes-and-rbac.md)
* Tujuh peran dipetakan menjadi **tiga kelas principal**: platform · staf tenant · pihak eksternal
* `40-security/RBAC-MODEL.md` menjadi **sumber kebenaran RBAC** (menggantikan SECURITY §3)
* `users.role` diperluas: + `warehouse`, `sales_floor` — **`manager` dipertahankan**
* `platform_admins` + `breakglass_sessions`: super admin **tanpa akses default**,
  hanya lewat sesi beralasan, maks 4 jam, tercatat, **tenant diberi tahu**
* `identities` + tabel penghubung: identitas pelanggan & distributor **lintas-tenant**

### Konsekuensi
* 🔴 `TenantMiddleware` tidak lagi bisa mengasumsikan satu `tenant_id` — **menyentuh setiap endpoint**
* 🔴 Auth kini melayani pihak tidak dipercaya (portal publik) — permukaan ancaman baru
* **SPG mewajibkan fitur pesanan tertahan** yang selama ini belum tercakup FR mana pun
* Konflik terbuka: **gudang vs HPP** saat menerima barang
* Portal distributor menyentuh Non-Goals "marketplace pemasok" — butuh ADR tersendiri
* Persona baru: Gudang, SPG, Super Admin

---

## [0.6.0] — 2026-08-21

### Ruang lingkup diperluas — [ADR-0006](./10-architecture/adr/0006-crm-bi-and-python-service.md)
* **CRM & Business Intelligence masuk produk.** CRM dikeluarkan dari Non-Goals.
* **Layanan Python diaktifkan sejak Fase 1** — membatalkan keputusan penundaan di v0.5.0.
  Ruang lingkup: restock · segmentasi pelanggan (RFM) · agregasi BI.

### Ditambahkan
* `10-architecture/ANALYTICS-BI.md` — jalur analitik bertahap (ringkasan → replika → DuckDB)
* **Entitas pelanggan** di DATA-MODEL §5: `customers`, `customer_consents`,
  `customer_segments`, `customer_interactions` — sebelumnya **tidak ada sama sekali**
* Tooling Python ditetapkan: uv · psycopg3 · pandas · duckdb · scikit-learn · APScheduler · ruff · pytest

### Konsekuensi
* 🔴 **Sistem kini menyimpan PII pelanggan** — UU PDP naik dari P2 ke P0
* 🔴 **Perangkat kasir hilang kini membawa PII pelanggan** — mitigasi di DATA-MODEL §5E
* ⚠️ **Ukuran VPS naik: 4 GB → 8 GB minimum** (agregasi BI memuat data ke memori)
* Aturan dedup pelanggan pada sync offline (nomor telepon = kunci identitas)
* CRM & BI menjadi pembeda paket di PRICING

---

## [0.5.0] — 2026-08-21

### Disetujui
Seluruh keputusan teknis di [TECH-STACK](./10-architecture/TECH-STACK.md) dinaikkan ke ✅.
ADR-0004 & ADR-0005 → **Diterima**.

### Konsekuensi yang diterapkan
* **Layanan Python ditunda ke Fase 2.** V0/V1 prediksi restock dikerjakan `web-app` sebagai
  job terjadwal. FDR, SERVICE-BOUNDARIES, ROADMAP, INTELLIGENCE-WORKER, DOCKER, dan
  PERFORMANCE-BUDGET diperbarui. Menghemat ~512 MB RAM di VPS.
* **Peran TanStack Query dicabut dari sinkronisasi** dan dicatat langsung di
  `fondasi-UI-v0.1.md` §8C, tempat kesalahpahaman paling mungkin terjadi.
* Variabel baru di CONFIGURATION: `GHCR_TOKEN`, `GRAFANA_CLOUD_API_KEY`, `SENTRY_DSN`, kunci R2.
* Gerbang CI di PERFORMANCE-BUDGET & TESTING-STRATEGY kini punya platform yang menjalankannya.

### Menunggu penawaran komersial
* Gateway QRIS — **arah sub-merchant disetujui**, Midtrans dievaluasi lebih dulu
* WhatsApp — **API resmi disetujui**, pemilihan BSP menunggu

---

## [0.4.0] — 2026-08-21

### Ditetapkan
* **VPS: Hostinger (KVM)** — region terdekat Indonesia, RAM min. 4GB
* **Backend Go:** chi · pgx/v5 · sqlc · goose · go-redis/v9 · golang-jwt/v5 · x/crypto/argon2 · log/slog
* **Frontend:** pnpm · zod · Biome · Vitest · Playwright · **Serwist** (Service Worker)
* **CI & registry:** GitHub Actions + ghcr.io, build **tidak lagi di VPS** ([ADR-0004](./10-architecture/adr/0004-ci-build-and-registry.md))
* **Telemetri:** Grafana Cloud + Sentry SaaS; data transaksi tetap di VPS ([ADR-0005](./10-architecture/adr/0005-telemetry-external-data-internal.md))
* **Backup:** Cloudflare R2 (penyedia berbeda dari VPS)
* **Analytics produk:** tabel PostgreSQL sendiri, bukan PostHog/Umami

### Diubah
* `OBSERVABILITY.md` §6 direvisi: tumpukan pemantauan **tidak** self-hosted di VPS produksi
* Batas peran sinkronisasi ditegaskan: SW → aset · TanStack Query → cache baca ·
  antrean sendiri → **seluruh tulis transaksi**

### Menunggu keputusan komersial
* Gateway QRIS (kandidat: Midtrans / Xendit)
* WhatsApp Business Platform resmi

---

## [0.3.0] — 2026-08-21

### Ditambahkan
* **`00-product/`** — 9 dokumen: VISION-SCOPE, PERSONAS-JTBD, ROADMAP, SUCCESS-METRICS,
  ANALYTICS-EVENTS, ONBOARDING-ACTIVATION, PRICING-PACKAGING, MULTI-OUTLET, COMPETITIVE-LANDSCAPE
* **`10-architecture/`** — SERVICE-BOUNDARIES, EVENT-ARCHITECTURE, REDIS-STRATEGY,
  INTELLIGENCE-WORKER, SCALABILITY-RELIABILITY; ADR-0003 (Dokploy)
* **`20-api/`** — ERROR-CATALOG, INTEGRATION-QRIS
* **`30-data/`** — DATA-MODEL, MIGRATIONS, OFFLINE-SYNC-SPEC, RETENTION
* **`40-security/`** — THREAT-MODEL, COMPLIANCE-ID
* **`50-operations/`** — INFRASTRUCTURE, DOKPLOY, DOCKER, NETWORK-HARDENING,
  CONFIGURATION, DEPLOYMENT, OBSERVABILITY, BACKUP-DR, 6 runbook
* **`60-quality/`** — TESTING-STRATEGY, PERFORMANCE-BUDGET, ACCESSIBILITY, HARDWARE-SUPPORT
* Akar — DOCS-MAP, GLOSSARY, CONTRIBUTING, CHANGELOG; README per folder

### Diubah
* Struktur folder diberi awalan angka mengikuti alur `kenapa → bagaimana → dijaga → tampak`
* **FDR dipecah** (311 → 169 baris): skema → `30-data/`, compose → `50-operations/`,
  keamanan → `40-security/`. Tidak ada isi yang hilang.
* Reverse proxy ditetapkan **Traefik** (ADR-0003), mengakhiri "Traefik / Caddy / Nginx"

### Diperbaiki
* 3 tautan yang sudah rusak sebelumnya di ADR-0001 & ADR-0002

### Temuan yang menunggu keputusan
* Redis Pub/Sub kehilangan event → usul Redis Streams + outbox
* Revokasi token gagal saat Redis restart → Postgres sebagai sumber kebenaran
* `users` tidak terkait outlet → kasir dapat mengakses seluruh cabang
* `plan_tier` ada di skema tanpa definisi produk
* Tabrakan port 3000 antara `web-app` dan UI Dokploy
* "In-memory mutex" ambigu → pecah senyap saat penskalaan horizontal

---

## [0.2.0] — sebelum 2026-08-21

Baseline awal: PRD-01, FDR, SECURITY, ADR-0001/0002, API guidelines + OpenAPI,
design system, katalog aset, prototipe HTML.
