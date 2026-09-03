# 🗺️ DOCS-MAP — Peta Dokumentasi & Analisis Celah

> **Diperbarui:** 28 Agustus 2026 · **Status audit:** ✅ 88 dokumen, **nol error**
> (link · §seksi · penanda basi · yatim · kontradiksi · heading · tabel · blok kode)
> **Tujuan:** satu halaman untuk tahu *dokumen apa yang sudah ada*, *apa yang belum*, dan
> *apa yang harus ditulis lebih dulu* agar sistem ini kuat — bukan hanya terlihat lengkap.

---

## 1. Prinsip Penataan Folder

Folder diberi awalan angka agar **urutan baca = urutan berpikir**: dari *kenapa dibangun*
(produk) → *bagaimana dibangun* (arsitektur, API, data) → *bagaimana dijaga* (keamanan,
operasional, kualitas) → *bagaimana terlihat* (desain, aset, prototipe).

```
docs-UMKM Intelligence/
│
├── README.md                    # Pintu masuk & navigasi
├── DOCS-MAP.md                  # ← Dokumen ini: indeks + peta celah
├── GLOSSARY.md                  # Kamus istilah (shift, opname, tenant, QRIS, Z-Report)
│
├── 15-development/              # BEKERJA — repo, lokal, workflow, CI
│                                #   (jalur Fase A→E ada di README-nya)
├── 00-product/                  # KENAPA — masalah, pengguna, ruang lingkup
│                                #   VISION · PERSONAS · PRD · ROADMAP · METRICS
│                                #   EVENTS · ONBOARDING · PRICING · MULTI-OUTLET
├── 10-architecture/             # BAGAIMANA — bentuk sistem & keputusan
│   │                            #   FDR · SERVICE-BOUNDARIES · EVENT-ARCHITECTURE
│   │                            #   REDIS-STRATEGY · INTELLIGENCE-WORKER
│   │                            #   SCALABILITY-RELIABILITY
│   └── adr/                     #   Architecture Decision Records
├── 20-api/                      # KONTRAK — antarmuka antar-komponen
├── 30-data/                     # KEBENARAN — skema, migrasi, retensi
├── 40-security/                 # PROTEKSI — ancaman, akses, kepatuhan
├── 50-operations/               # MENJALANKAN — infra, deploy, observabilitas, insiden
│   │                            #   INFRASTRUCTURE · DOKPLOY · DOCKER · NETWORK-HARDENING
│   └── runbooks/                #   Prosedur saat ada masalah jam 2 pagi
├── 60-quality/                  # MEMBUKTIKAN — strategi tes, budget performa, a11y
├── 70-design-system/            # TAMPAK — token, komponen, halaman
├── 80-assets/                   # ASET — SVG, maskot, render 3D
└── 90-prototypes/               # BUKTI — showcase HTML interaktif
```

**Aturan:** satu dokumen = satu tanggung jawab. Kalau sebuah file mulai menjawab dua
pertanyaan berbeda (mis. FDR yang juga memuat skema DB **dan** docker-compose **dan** aturan
RBAC), itu tanda dokumen harus dipecah.

---

## 2. Inventaris Saat Ini

| Dokumen | Lokasi | Status | Catatan |
|---|---|:---:|---|
| PRD POS Inti | `00-product/PRD-01-POS-INTI.md` | ✅ Kuat | FR-01…FR-51 + NFR terukur |
| Visi & Ruang Lingkup | `00-product/VISION-SCOPE.md` | 🟡 Draft baru | Masalah, posisi, **Non-Goals**, asumsi |
| Persona & JTBD | `00-product/PERSONAS-JTBD.md` | 🟡 Draft baru | 3 persona + anti-persona + sehari penuh |
| Roadmap | `00-product/ROADMAP.md` | 🟡 Draft baru | Fase 0–3 + kriteria lulus |
| Metrik Keberhasilan | `00-product/SUCCESS-METRICS.md` | 🟡 Draft baru | North Star + guardrail |
| Taksonomi Event | `00-product/ANALYTICS-EVENTS.md` | 🟡 Draft baru | Katalog event + aturan offline |
| Onboarding & Aktivasi | `00-product/ONBOARDING-ACTIVATION.md` | 🟡 Draft baru | Jalur ke transaksi pertama |
| Paket & Harga | `00-product/PRICING-PACKAGING.md` | 🔴 Usulan | Menutup `plan_tier` yang menggantung |
| Multi-Outlet | `00-product/MULTI-OUTLET.md` | 🟡 Draft baru | FR-04 mendalam |
| Lanskap Kompetitif | `00-product/COMPETITIVE-LANDSCAPE.md` | 🔴 Kerangka | Perlu riset primer |
| FDR (Arsitektur) | `10-architecture/FDR.md` | ✅ v1.1 | **Sudah dipecah** — kini arsitektur murni (311→169 baris) |
| Batas Layanan | `10-architecture/SERVICE-BOUNDARIES.md` | 🟡 Draft baru | Aturan penempatan Go / TS / Python |
| Arsitektur Event | `10-architecture/EVENT-ARCHITECTURE.md` | 🟡 Draft baru | **Menemukan cacat Pub/Sub** |
| Strategi Redis | `10-architecture/REDIS-STRATEGY.md` | 🟡 Draft baru | **Menemukan cacat revokasi token** |
| Intelligence Worker | `10-architecture/INTELLIGENCE-WORKER.md` | 🟡 Draft baru | Spesifikasi layanan Python |
| Skalabilitas & Keandalan | `10-architecture/SCALABILITY-RELIABILITY.md` | 🟡 Draft baru | Kapasitas & mode kegagalan |
| Tech Stack & Tooling | `10-architecture/TECH-STACK.md` | ✅ **Disetujui** | Register tooling + VPS Hostinger |
| **Jalur Development** | `15-development/` | 🟡 Draft | Repo · lokal · workflow · CI · **batas dev/prod** |
| Analitik & BI | `10-architecture/ANALYTICS-BI.md` | 🟡 Draft baru | Jalur OLAP agar BI tak ganggu kasir |
| ADR-0006 CRM & BI | `10-architecture/adr/` | ✅ **Diterima** | Python aktif; CRM keluar Non-Goals |
| ADR-0007 Kelas Principal | `10-architecture/adr/` | ✅ **Diterima** | 7 peran dalam 3 kelas |
| **Model RBAC** | `40-security/RBAC-MODEL.md` | 🟡 Draft · 🔴 **P0** | 18 peran, 3 kelas, model izin |
| **Pipeline Keamanan** | `40-security/SECURITY-PIPELINE.md` | ✅ Terpasang | 10 kontrol otomatis di CI |
| **Peta Modul ERP** | `00-product/ERP-MODULE-MAP.md` | 🟡 Draft baru | Urutan modul + peringatan ruang lingkup |
| **Segmen Pasar** | `00-product/MARKET-SEGMENTS.md` | 🟡 Draft baru | 6 arketipe + primitif universal |
| **Modul SOP** | `00-product/SOP-MODULE.md` | 🟡 Draft baru | SOP per kategori — pembeda utama |
| Provisioning Server | `50-operations/SERVER-PROVISIONING.md` | 🟡 Draft baru | Ketentuan server + bootstrap |
| Go-Live | `50-operations/GO-LIVE.md` | 🟡 Draft baru | Checklist rilis pertama |
| ADR-0004 Build di CI | `10-architecture/adr/` | ✅ **Diterima** | ghcr.io, rollback deterministik |
| ADR-0005 Telemetri eksternal | `10-architecture/adr/` | ✅ **Diterima** | Merevisi OBSERVABILITY §6 |
| ADR-0001 Hybrid Go/TS | `10-architecture/adr/` | ✅ | |
| ADR-0002 Design Language | `10-architecture/adr/` | ✅ | |
| ADR-0008 Penyimpangan Standar Server | `10-architecture/adr/` | ✅ **Diterima** | 3 penyimpangan fondasi-server-ionowu, dicatat sesuai P7 |
| ADR-0009 Model Dua-Proyek Dokploy | `10-architecture/adr/` | ✅ **Diterima** | Membalik sebagian ADR-0003 — DEP-13 |
| API Guidelines | `20-api/API-GUIDELINES.md` | ✅ Kuat | RFC 7807, idempotensi, rate limit |
| OpenAPI Spec | `20-api/openapi.yaml` | ✅ 907 baris | 22 endpoint |
| Data Model pelengkap | `30-data/DATA-MODEL.md` | 🟡 Draft baru | Menutup 11 celah skema |
| Security Baseline | `40-security/SECURITY.md` | ✅ Kuat | RBAC, Argon2id, HMAC, audit log |
| Design System MASTER | `70-design-system/MASTER.md` | ✅ | |
| Fondasi UI v0.1 | `70-design-system/fondasi-UI-v0.1.md` | ✅ Kuat | Token, Mochi Spring, audio |
| Spek halaman Kasir | `70-design-system/pages/kasir.md` | ✅ | |
| Katalog Aset | `80-assets/README.md` | ✅ | |
| Prototipe HTML | `90-prototypes/` | ✅ | 2 file showcase |

---

## 3. Celah Dokumentasi — Status Terkini

Seluruh 23 celah yang teridentifikasi pada audit awal **sudah ditulis**. Yang tersisa bukan
lagi dokumen yang hilang, melainkan **keputusan yang harus diambil manusia** dan
**riset yang harus dilakukan**.

### ✅ Selesai Ditulis

| Kelompok | Dokumen |
|---|---|
| Produk | VISION-SCOPE · PERSONAS-JTBD · ROADMAP · SUCCESS-METRICS · ANALYTICS-EVENTS · ONBOARDING-ACTIVATION · PRICING-PACKAGING · MULTI-OUTLET · COMPETITIVE-LANDSCAPE |
| Arsitektur | SERVICE-BOUNDARIES · EVENT-ARCHITECTURE · REDIS-STRATEGY · INTELLIGENCE-WORKER · SCALABILITY-RELIABILITY · ADR-0003 |
| API | ERROR-CATALOG · INTEGRATION-QRIS |
| Data | DATA-MODEL · MIGRATIONS · OFFLINE-SYNC-SPEC · RETENTION |
| Keamanan | THREAT-MODEL · COMPLIANCE-ID |
| Operasional | INFRASTRUCTURE · DOKPLOY · DOCKER · NETWORK-HARDENING · CONFIGURATION · DEPLOYMENT · OBSERVABILITY · BACKUP-DR · 6 runbook |
| Kualitas | TESTING-STRATEGY · PERFORMANCE-BUDGET · ACCESSIBILITY · HARDWARE-SUPPORT |
| Akar | DOCS-MAP · GLOSSARY · CONTRIBUTING · CHANGELOG |

### 🔴 P0 — Keputusan yang Memblokir Implementasi

| # | Keputusan | Dokumen | Kenapa mendesak |
|---|---|---|---|
| 0 | ~~Stok `INT` → `DECIMAL` + UOM~~ | ✅ **Selesai** — [migrations/00003](./30-data/migrations/) | Skema awal langsung benar, tanpa ALTER |
| 1 | Redis Streams + outbox, bukan Pub/Sub | [EVENT-ARCHITECTURE](./10-architecture/EVENT-ARCHITECTURE.md) §1 | Pub/Sub kehilangan event tanpa error |
| 2 | Postgres sumber kebenaran revokasi token | [REDIS-STRATEGY](./10-architecture/REDIS-STRATEGY.md) §2 | Token tercabut kembali berlaku saat Redis restart |
| 3 | `user_outlet_assignments` | [MULTI-OUTLET](./00-product/MULTI-OUTLET.md) §3 | Kasir dapat mengakses seluruh cabang |
| 4 | Model harga dasar + override | [MULTI-OUTLET](./00-product/MULTI-OUTLET.md) §2 | Mengubahnya nanti = migrasi seluruh data harga |
| 5 | `outlets.timezone` & jam tutup buku | [MULTI-OUTLET](./00-product/MULTI-OUTLET.md) §5 | Memengaruhi setiap kueri laporan |
| 6 | Penanda `is_sandbox` | [ONBOARDING-ACTIVATION](./00-product/ONBOARDING-ACTIVATION.md) §6 | Menambah nanti = tulis ulang semua laporan |
| 7 | Definisi `plan_tier` | [PRICING-PACKAGING](./00-product/PRICING-PACKAGING.md) | Sudah ada di skema produksi tanpa arti |
| 8 | Mutex stok: Postgres atau Redis | [REDIS-STRATEGY](./10-architecture/REDIS-STRATEGY.md) §5 | Menentukan apakah penskalaan horizontal mungkin |
| 9 | Vendor QRIS — **arah sub-merchant disetujui**, menunggu penawaran | [INTEGRATION-QRIS](./20-api/INTEGRATION-QRIS.md) §8 | Memblokir FR-23, **bukan Fase 0** |
| 10 | Hapus `ports:` & rahasia dari compose | [DOCKER](./50-operations/DOCKER.md) §6 | Tabrakan port + rahasia bocor |
| 11 | Perbaiki penomoran FR bolong | [ROADMAP](./00-product/ROADMAP.md) §5 | FR-15/29/34/45/55 fiktif |
| 12 | Batas RBAC Manager | [RBAC-MODEL](./40-security/RBAC-MODEL.md) §2 | PRD & SECURITY bertentangan |
| 12b | 🔴 **Middleware sadar kelas principal** | [RBAC-MODEL](./40-security/RBAC-MODEL.md) §5 | Menyentuh **setiap** endpoint |
| 12c | **Gudang vs HPP** — siapa input harga beli? | [RBAC-MODEL](./40-security/RBAC-MODEL.md) §2 | Margin usaha bocor bila salah |
| 12d | 🔑 **Model izin, bukan peran keras** | [RBAC-MODEL](./40-security/RBAC-MODEL.md) §7 | Menambal belakangan = migrasi seluruh otorisasi |
| 12e | **North Star perlu ditinjau** — ukur pertumbuhan tenant, bukan pemakaian | [ERP-MODULE-MAP](./00-product/ERP-MODULE-MAP.md) §5 | Visi berubah ke "UMKM naik kelas" |
| 13 | ~~Strategi Service Worker~~ → **Serwist** | [TECH-STACK](./10-architecture/TECH-STACK.md) §5 | ✅ **Disetujui** |
| 14 | ~~Peran TanStack Query~~ → **cache baca saja** | [TECH-STACK](./10-architecture/TECH-STACK.md) §5C | ✅ **Disetujui** |

### 🟠 P1 — Riset & Verifikasi

| # | Tindakan | Dokumen |
|---|---|---|
| 13 | **10 wawancara pengguna** — persona masih hipotesis | [PERSONAS-JTBD](./00-product/PERSONAS-JTBD.md) §1 |
| 14 | **Uji offline pesaing secara langsung** | [COMPETITIVE-LANDSCAPE](./00-product/COMPETITIVE-LANDSCAPE.md) §4 |
| 15 | Konsultasi hukum: **hanya T&C + DPA** — legalitas usaha jadi tanggung jawab owner | [COMPLIANCE-ID](./40-security/COMPLIANCE-ID.md) §1c |
| 16 | Uji restore backup — belum pernah dilakukan | [BACKUP-DR](./50-operations/BACKUP-DR.md) §4 |
| 17 | Verifikasi `nmap` dari luar (jebakan Docker↔UFW) | [NETWORK-HARDENING](./50-operations/NETWORK-HARDENING.md) §6 |
| 18 | Posisi resmi soal iOS | [HARDWARE-SUPPORT](./60-quality/HARDWARE-SUPPORT.md) §5 |
| 19 | Pilih kerangka uji & perangkat observabilitas | [TESTING-STRATEGY](./60-quality/TESTING-STRATEGY.md) §7 |
| 19b | ~~Platform CI~~ → **GitHub Actions + ghcr.io** | [ADR-0004](./10-architecture/adr/0004-ci-build-and-registry.md) |
| 19c | ~~Tooling Go~~ → **chi + pgx + sqlc + goose** | [TECH-STACK](./10-architecture/TECH-STACK.md) §3 |
| 19d | Gateway WhatsApp → **API resmi disetujui**, BSP menunggu penawaran | [TECH-STACK](./10-architecture/TECH-STACK.md) §9 |
| 19e | ~~Penyedia VPS~~ → ✅ **Hostinger** | [INFRASTRUCTURE](./50-operations/INFRASTRUCTURE.md) §5 |
| 19f | ~~Object storage~~ → **Cloudflare R2** | [TECH-STACK](./10-architecture/TECH-STACK.md) §8 |

### 🟡 P2 — Melengkapi

| # | Tindakan |
|---|---|
| 20 | 5 ADR yang belum ditulis (lihat [10-architecture/README](./10-architecture/README.md) §2) |
| 21 | ~~Berkas migrasi SQL~~ → ✅ **selesai**: 9 migrasi, 47 tabel · sqlc.yaml · 23 kueri |
| 22 | Tabel yang belum masuk DATA-MODEL (lihat [30-data/README](./30-data/README.md)) |
| 23 | Spesifikasi halaman desain selain kasir |

---

## 4. Temuan Perbaikan pada Dokumen yang Sudah Ada

Bukan celah dokumen baru, tetapi hal yang perlu dikoreksi:

1. ~~**FDR terlalu gemuk.**~~ ✅ **Selesai 21 Agustus 2026** — §2 → `30-data/DATA-MODEL.md`,
   §4 → `50-operations/DOCKER.md`, §5 → `40-security/SECURITY.md`. FDR kini 169 baris.
2. **Rahasia literal di FDR §4.** `secret_pass` dan `your_ultra_secure_jwt_secret_key` di
   docker-compose contoh berisiko disalin apa adanya ke produksi. Ganti dengan
   `${POSTGRES_PASSWORD}` + rujukan ke `CONFIGURATION.md`.
3. **`docker-compose` `version: '3.8'`** sudah usang di Compose V2 dan memunculkan peringatan.
4. **`sslmode=disable`** pada `DB_URL` — dapat diterima di jaringan Docker internal, tetapi
   harus dinyatakan eksplisit sebagai keputusan, bukan kelalaian.
5. **Konflik RBAC.** PRD FR-03 menyebut Manager mengakses "laporan shift", sementara
   SECURITY §3 melarang Manager melihat "Omzet & Laba Bersih". Batasnya perlu dipertegas:
   Manager boleh lihat omzet **shift/cabangnya**, tidak boleh lihat **laba (HPP)**.
6. **Tabrakan port 3000.** `web-app` di FDR §4 mem-publish `3000:3000`, port yang sama dengan
   UI Dokploy. Selain bertabrakan, mem-publish port aplikasi berarti melewati Traefik — tanpa
   TLS dan tanpa terhalang firewall. Lihat `50-operations/INFRASTRUCTURE.md` §2.
7. **Reverse proxy sudah tidak menggantung.** FDR §1 menulis "Traefik / Caddy / Nginx";
   ADR-0003 menetapkan **Traefik**, karena itulah yang dibawa Dokploy. FDR perlu disesuaikan.
8. **`plan_tier` tanpa definisi.** `free`/`premium` sudah ada di skema FDR §2 tetapi tidak
   pernah dijelaskan di dokumen produk mana pun. Lihat `00-product/PRICING-PACKAGING.md`.
9. **`users` tidak terkait outlet.** Skema FDR §2 membuat setiap kasir secara teknis dapat
   mengakses seluruh cabang — bertentangan dengan SECURITY §3. Lihat `00-product/MULTI-OUTLET.md` §3.
10. **Lima nomor FR fiktif.** FR-15, 29, 34, 45, 55 disebut di judul rentang PRD tanpa isi.
11. **Redis Pub/Sub kehilangan event (P0).** Fire-and-forget: konsumen yang sedang restart
    kehilangan pesan permanen tanpa error. Lihat `10-architecture/EVENT-ARCHITECTURE.md` §1.
12. **Revokasi token gagal saat Redis restart (P0).** SECURITY §4B menjanjikan *instant
    revocation*, tetapi Redis tanpa persistensi kehilangan daftar cabutan.
    Lihat `10-architecture/REDIS-STRATEGY.md` §2.
13. **"In-memory mutex" ambigu (P1).** Bila di dalam proses Go, pecah senyap saat ada instans
    kedua → stok minus tanpa error. Lihat `10-architecture/REDIS-STRATEGY.md` §5.
14. **Duplikasi RBAC.** Matriks hak akses muncul di PRD §3A dan SECURITY §3. Tetapkan
   `40-security/SECURITY.md` sebagai satu-satunya sumber kebenaran; PRD cukup merujuk.

---

## 5. Urutan Pengerjaan yang Disarankan

```
Minggu 1  →  #2 Migrations · #5 Configuration · #4 Error Catalog
             (memungkinkan backend mulai dikoding dengan aman)

Minggu 2  →  #3 Offline-Sync Spec · #6 QRIS Integration
             (dua sumber bug termahal di sistem POS)

Minggu 3  →  #7 Testing · #13 Performance Budget
             (mengubah janji NFR menjadi gerbang CI)

Minggu 4  →  #8 Observability · #9 Runbooks · #10 Backup-DR · #11 Deployment
             (gerbang kesiapan produksi)

Berjalan  →  #12 Threat Model · #14 Intelligence Worker · P2 lainnya
```

---

## 6. Definisi "Kuat" untuk Dokumentasi Ini

Sistem ini disebut kuat secara dokumentasi bila keempat hal berikut terpenuhi:

1. **Tidak ada endpoint tanpa tabel**, dan tidak ada tabel tanpa migrasi.
2. **Setiap angka NFR punya alat ukur** yang berjalan di CI atau produksi.
3. **Setiap mode kegagalan punya runbook** — terutama yang menyangkut uang.
4. **Setiap keputusan yang sulit dibalik punya ADR** yang mencatat alternatif yang ditolak.
