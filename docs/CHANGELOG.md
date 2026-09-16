# Changelog Dokumentasi

Perubahan struktural pada dokumentasi. Bukan changelog produk.

---

## [1.9.0] — 2026-09-16

> Nomor 1.7.0 dan 1.8.0 dilewati dengan sengaja: keduanya dipakai PR yang belum masuk `main`
> (#16 cetak struk Bluetooth, #21 framer-motion + perapian UI). Urutannya tetap benar menurut
> tanggal begitu PR-PR itu merge.

### Ditambahkan
* **Jalur rilis Google Play** — `PLAY-STORE.md` + konfigurasi penandatanganan rilis di
  `android/app/build.gradle` + target `make aab`. Kredensial dibaca dari
  `android/keystore.properties` (di-gitignore) atau environment; tidak pernah masuk repo.
  `versionCode`/`versionName` kini bisa dinaikkan lewat environment — Play menolak unggahan
  dengan `versionCode` yang sudah dipakai.
* **`android-build.yml`** — gerbang kompilasi Android di SETIAP PR yang menyentuh berkas
  Android/Gradle/Capacitor. Sebelumnya satu-satunya jalur yang mengompilasi Android
  (`apk-debug.yml`) bersifat manual dan hanya dari `main`, sehingga berkas Gradle yang rusak baru
  ketahuan setelah merge. URL API di job ini sengaja palsu — yang diuji kompilasinya, bukan
  artefaknya, dan APK-nya tidak pernah diunggah.

### Diketahui, belum selesai
* **Tidak bisa diverifikasi di mesin pengembang** (host sengaja tanpa JDK, ADR-0010
  §Konsekuensi). Karena itu `android-build.yml` ditambahkan: kompilasinya dibuktikan di CI pada
  PR ini juga, bukan ditunda sampai setelah merge. Yang TETAP belum terbukti adalah jalur
  **bertanda tangan** — itu butuh keystore yang hanya boleh dibuat pemilik.
* **Yang memblokir penerbitan bukan kode:** keystore rilis (hanya pemilik yang boleh membuatnya),
  akun Play Console, dan **URL kebijakan privasi** semuanya belum ada.

## [1.6.4] — 2026-09-14

### Ditambahkan
* **`apk-debug.yml`** — APK debug menunjuk API produksi, dibangun di GitHub Actions dan dijalankan
  **manual** dari `main`. `make apk` tidak bisa dipakai untuk rilis: Gradle berjalan di host yang
  sengaja tidak punya JDK aktif, dan build di laptop ikut membawa branch yang sedang aktif —
  saat itu working tree berada di branch PR #16 yang belum di-review. Tiga gerbang: hanya
  `refs/heads/main`, URL API sama dengan build.yml, dan URL diverifikasi **di dalam APK yang
  jadi** (domain produksi harus ada; `ionowu.example`/`localhost:8080` harus nol). Artefak
  diberi nama per commit + SHA-256, disimpan 14 hari. `CI-PIPELINE.md` §3b; `GO-LIVE.md` §2.G.
  Belum mencakup build release/Play Store — butuh keystore milik pemilik.

---

## [1.6.3] — 2026-09-14

### Diperbaiki
* **Image web di `ghcr.io` memanggil domain yang tidak ada.** `NEXT_PUBLIC_API_URL` dibakar
  ke bundle klien saat build, tetapi `build.yml` tidak pernah meneruskannya — `build-args` hanya
  berisi `VERSION`/`COMMIT`/`CREATED`. Setiap image web (termasuk `08210e5`) memuat default
  Dockerfile `https://api.ionowu.example`. Image itu menyala normal dan lolos semua cek; ia baru
  gagal saat kasir memanggil API. Mengisi `PUBLIC_API_URL` di panel Dokploy tidak menolong karena
  nilainya tidak dibaca saat runtime. Ditemukan saat memeriksa gerbang GO-LIVE §2.G sebelum
  menyerahkan digest untuk deploy.
  * `build.yml` meneruskan repository variable `PUBLIC_API_URL`, dan langkah **Gerbang URL API web**
    menolak build bila nilainya kosong, berisi `example`, menunjuk `localhost`, atau bukan `https://`.
  * `apps/web/Dockerfile` tidak lagi punya default; build tanpa `--build-arg` gagal di tempat.
  * `DOCKER.md` §5 — contoh build manual ikut membawa `--build-arg`.

### Diubah
* **Skema domain produksi** (ditetapkan pemilik 2026-09-14) — satu subdomain per aplikasi Ionowu:
  web **`sweet.ionowu.com`**, API **`api.sweet.ionowu.com`**, menggantikan `app.ionowu.com` /
  `api.ionowu.com` di `DOKPLOY.md` §4, `SERVER-PROVISIONING.md`, `INFRASTRUCTURE.md`, dan contoh di
  `docker-compose.prod.yml`. Repository variable `PUBLIC_API_URL` diisi `https://api.sweet.ionowu.com`.
  Saat ditetapkan, `ionowu.com` sudah menunjuk VPS (76.13.16.85) tetapi kedua subdomain **belum
  punya record DNS**.

---

## [1.6.2] — 2026-09-14

### Ditambahkan
* **ADR-0011** — image hanya `linux/amd64`; arm64 dihentikan. Build `web` untuk arm64 berjalan
  lewat QEMU di runner x86 dan terbukti **macet tanpa log**: 358,8 menit pada `997aab8`
  (dibatalkan timeout 6 jam) dan 30,8 menit pada `f3fa10f`, sementara amd64 di run yang sama
  selesai dalam hitungan menit. Server produksi dikonfirmasi pemilik x86_64. Butir WAJIB
  `IMG-10` (amd64) tetap dipenuhi; yang dihentikan hanya bagian SEBAIKNYA (arm64).

### Diubah
* **`build.yml`** — `platforms: linux/amd64`; `setup-qemu-action` dihapus.
* **`SERVER-PROVISIONING.md` §1** — baris **Arsitektur** baru. Sebelumnya dokumen hanya
  menyebut jumlah vCPU, sehingga tidak ada yang tahu image arm64 tidak pernah dipakai.
* **`DOCKER.md` §5** — panduan build manual di Mac Apple Silicon (`--platform linux/amd64`):
  tanpa itu image arm64 lolos uji lokal lalu gagal di server dengan `exec format error`.

---

## [1.6.1] — 2026-09-14

### Diperbaiki
* **`DOKPLOY.md` §6 basi.** Berisi lima pertanyaan "masih harus ditetapkan" dan
  diagram yang menggambar build **di VPS** — padahal §7 berkas yang sama sudah
  menutupnya lewat ADR-0004. Empat dari lima pertanyaan ternyata sudah dijawab di
  `DEPLOYMENT.md` dan `MIGRATIONS.md`, termasuk yang ditandai P0 (urutan migrasi
  terhadap deploy). Kini diganti tabel status yang menunjuk jawabannya; satu yang
  benar-benar masih terbuka (deploy otomatis vs manual) ditandai jujur, dan rollback
  ditandai "tertulis, belum diuji".

### Ditambahkan
* **`GO-LIVE.md` §2.G — gerbang build & klien.** Tiga cacat yang pernah lolos semua
  pemeriksaan lain: URL API ter-*bake* `localhost`, CORS tanpa origin APK, dan APK
  demo yang menunjuk IP laptop. Masing-masing disertai cara memeriksanya pada
  artefak nyata, bukan pada konfigurasi. Urutan hari-H kini mewajibkan login dari
  **APK sungguhan**, karena CORS untuk origin APK tidak teruji oleh browser mana pun.

---

## [1.6.0] — 2026-09-12

### Ditambahkan
* **ADR-0010** — Capacitor membungkus PWA yang sama menjadi APK, menolak usulan
  menulis ulang dengan React Native. Pengukuran pada kode nyata: RN membuang
  ±92% frontend (2.860 baris komponen + Dexie/Serwist/sync engine), sementara
  Capacitor memenuhi kedua kebutuhan client (Play Store + printer termal
  Bluetooth) tanpa membuang satu baris pun.
* **Target `make apk`** — satu perintah dari sumber sampai APK. `API_URL` wajib
  diisi karena nilainya ter-*bake* saat build.

### Diubah
* **`next.config.ts`** — keluaran kini dipilih lewat `BUILD_TARGET`:
  `export` untuk Capacitor, `standalone` untuk image Docker. Keduanya tidak
  bisa aktif bersamaan.

### Diperbaiki
* **`next.config.ts` mem-*bake* `localhost:8080` ke SETIAP build.** Baris
  `process.env.NEXT_PUBLIC_API_URL = "http://localhost:8080"` di dalam config
  dieksekusi sebelum Next menyisipkan variabel `NEXT_PUBLIC_*`, sehingga
  menimpa environment yang benar-benar diberikan. Dibuktikan dengan membangun
  memakai URL lain lalu mencari string-nya: URL asli muncul **nol** kali,
  localhost **12** kali. Dampaknya bukan hanya APK (ponsel menghubungi dirinya
  sendiri) tetapi juga deployment VPS — browser pengguna akan menghubungi
  dirinya sendiri. Tidak terlihat saat pengembangan karena di lokal localhost
  memang kebetulan benar.

---

## [1.5.0] — 2026-09-11

### Ditambahkan
* **Katalog jenis usaha** — `services/pos-engine/internal/businesstype/catalog.json`
  beserta pembacanya di Go (`//go:embed`) dan TypeScript. Isinya diturunkan dari
  `MARKET-SEGMENTS.md` §3 dan §5; tidak ada kategori di luar yang tertulis di sana.
  Berkasnya **satu** dan dibaca kedua bahasa — bukan konstanta kembar — mengikuti pola
  paritas `internal/money/fixtures`. Kategori `parfum_refill` ("Toko Parfum Refil")
  melayani Warung Wangi, satu dari dua pelanggan pasti (CLAUDE.md §2).
* **Halaman `/daftar`** (`apps/web`) — pendaftaran tenant + pemilik dengan pemilih jenis
  usaha, dikelompokkan per arketipe A–F dan ditandai fase fiturnya, supaya pemilik tahu
  arketipe yang belum digarap **sebelum** mendaftar. Sebelumnya `POST /auth/register`
  sudah ada di backend tetapi tidak punya layar sama sekali.
* **`components/ui/select.tsx`** — token dan bentuknya disalin persis dari `input.tsx`.

### Diubah
* **`openapi.yaml` `/auth/register`** — menerima `business_type` (opsional) dan
  mendokumentasikan respons `400 INVALID_BUSINESS_TYPE`.
* **`httpapi/auth.go`** — `PostRegister` memvalidasi lalu menyimpan `business_type`.
  Sebelumnya kolom itu **selalu `NULL`** untuk setiap tenant yang mendaftar lewat HTTP:
  `CreateTenantParams` sudah punya field-nya, tetapi handler tidak pernah mengisinya —
  hanya seeder yang mengisi, sehingga cacatnya tidak terlihat dari data contoh.

---

## [1.4.0] — 2026-09-03

### Ditambahkan
* **ADR-0008** — tiga penyimpangan dari `fondasi-server-ionowu.md` v3.9 (base image build Go,
  ketiadaan `HEALTHCHECK` Docker di image distroless, cosign belum aktif), dicatat sesuai
  prinsip P7 standar itu sendiri: penyimpangan boleh terjadi bila ditulis terbuka.
* **ADR-0009** — model dua-proyek Dokploy (`ionowu-sweet-data` tipe Compose,
  `ionowu-sweet` tipe Application), membalik sebagian keputusan ADR-0003. Alasannya
  diverifikasi lewat pengujian nyata: Swarm mengabaikan `depends_on`, membuat `DEP-07`
  (zero-downtime) diam-diam gagal bila seluruh stack didaftarkan sebagai satu Compose.

### Diubah
* **`DOKPLOY.md` §2** — rekomendasi "satu Compose untuk semua layanan" ditandai usang dan
  digantikan model dua-proyek, dengan peringatan eksplisit alih-alih dihapus diam-diam.

### Diperbaiki
* **`services/pos-engine/internal/httpapi/router.go`** — `/health/live` dan `/health/ready`
  dipisah (RUN-08); sebelumnya hanya satu `/healthz` generik.
* **`.github/workflows/build.yml`** — image `web` tidak akan pernah ter-build karena
  `context` salah (pnpm workspace butuh context root, bukan `./apps/web`); dikonfirmasi lewat
  `docker build` nyata sebelum diperbaiki.

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
