# 🍓 ionowu sweet — UMKM Intelligence & POS Ecosystem

Sistem Kasir Modern, **CRM & Business Intelligence** untuk UMKM dengan filosofi desain
**Sweet Creamy Spatial Luxe** dan arsitektur backend **Citadel Hybrid (Golang + TypeScript + Docker)**.

> 🤖 **Claude / AI agent:** baca [CLAUDE.md](../CLAUDE.md) lebih dulu — berisi keputusan yang
> sudah diambil, hal yang sudah ditolak, dan invarian yang tidak boleh dilanggar.
>
> 🗺️ **Baru di sini?** Mulai dari [DOCS-MAP.md](./DOCS-MAP.md) — indeks lengkap, status tiap
> dokumen, dan daftar dokumen yang masih harus dibuat beserta prioritasnya.

---

## 📁 Peta Struktur Repositori

Folder diurutkan dengan awalan angka mengikuti alur berpikir:
**kenapa → bagaimana → dijaga → tampak**.

```
docs-UMKM Intelligence/
│
├── 🤖 CLAUDE.md                    # Konteks untuk AI agent — keputusan & invarian
├── 🗺️ DOCS-MAP.md                  # Indeks & status keputusan (MULAI DI SINI)
├── 📖 GLOSSARY.md                  # Kamus istilah domain kasir & UMKM
├── 🤝 CONTRIBUTING.md              # Cara menulis & sumber kebenaran
├── 📝 CHANGELOG.md                 # Riwayat perubahan dokumentasi
```

**Tautan cepat:** [DOCS-MAP](./DOCS-MAP.md) · [GLOSSARY](./GLOSSARY.md) ·
[CONTRIBUTING](./CONTRIBUTING.md) · [CHANGELOG](./CHANGELOG.md)

```
│
├── 📂 00-product/                   # KENAPA — masalah, persona, ruang lingkup
│   ├── VISION-SCOPE.md             #   Visi, posisi & Non-Goals
│   ├── PERSONAS-JTBD.md            #   Sari, Budi, Hendra + anti-persona
│   ├── PRD-01-POS-INTI.md          #   Product Requirements (FR-01…FR-51 + NFR)
│   ├── ROADMAP.md                  #   Fase 0–3 + kriteria lulus
│   ├── SUCCESS-METRICS.md          #   North Star, pohon KPI, guardrail
│   ├── ANALYTICS-EVENTS.md         #   Taksonomi event
│   ├── ONBOARDING-ACTIVATION.md    #   Jalur menuju transaksi pertama
│   ├── PRICING-PACKAGING.md        #   Paket free / premium / multi-outlet
│   ├── MULTI-OUTLET.md             #   FR-04 mendalam
│   ├── COMPETITIVE-LANDSCAPE.md    #   Kerangka riset pesaing
│   ├── ERP-MODULE-MAP.md           #   Peta urutan modul ERP
│   ├── MARKET-SEGMENTS.md          #   6 arketipe segmen UMKM
│   └── SOP-MODULE.md               #   SOP operasional terhubung data
│
├── 📂 10-architecture/              # BAGAIMANA — bentuk sistem & keputusan
│   ├── FDR.md                      #   Functional Design Record (Citadel Hybrid)
│   ├── SERVICE-BOUNDARIES.md       #   Aturan penempatan Go / TS / Python
│   ├── EVENT-ARCHITECTURE.md       #   Komunikasi antar-layanan & outbox
│   ├── REDIS-STRATEGY.md           #   Lima peran Redis & konfliknya
│   ├── INTELLIGENCE-WORKER.md      #   Spesifikasi layanan Python
│   ├── SCALABILITY-RELIABILITY.md  #   Kapasitas & mode kegagalan
│   ├── TECH-STACK.md               #   Register keputusan tooling
│   ├── ANALYTICS-BI.md             #   Jalur analitik CRM & BI
│   └── adr/                        #   Architecture Decision Records
│       ├── TEMPLATE.md
│       ├── 0001-hybrid-go-ts-docker-architecture.md
│       ├── 0002-sweet-creamy-spatial-luxe-design-language.md
│       ├── 0003-dokploy-self-hosted-paas.md
│       ├── 0004-ci-build-and-registry.md
│       ├── 0005-telemetry-external-data-internal.md
│       ├── 0006-crm-bi-and-python-service.md
│       └── 0007-principal-classes-and-rbac.md
│
├── 📂 15-development/               # BEKERJA — dari repo kosong sampai deploy
│   ├── REPOSITORY.md               #   Struktur monorepo
│   ├── LOCAL-SETUP.md              #   Menjalankan stack di laptop
│   ├── WORKFLOW.md                 #   Branch, PR, definition of done
│   ├── CI-PIPELINE.md              #   GitHub Actions → ghcr.io → Dokploy
│   └── DEV-VS-PROD.md              #   Batas dev / staging / produksi
│
├── 📂 20-api/                       # KONTRAK — antarmuka antar-komponen
│   ├── openapi.yaml                #   Spesifikasi REST (22 endpoint)
│   ├── API-GUIDELINES.md           #   RFC 7807, idempotensi, rate limiting
│   ├── ERROR-CATALOG.md            #   Kode error + kelas retry
│   └── INTEGRATION-QRIS.md         #   Alur pembayaran & rekonsiliasi
│
├── 📂 30-data/                      # KEBENARAN — skema, migrasi, retensi
│   ├── DATA-MODEL.md               #   Skema lengkap (inti + pelengkap)
│   ├── MIGRATIONS.md               #   Expand–contract, migrasi klien
│   ├── OFFLINE-SYNC-SPEC.md        #   Resolusi konflik & kasus tepi
│   └── RETENTION.md                #   Masa simpan & penghapusan
│
├── 📂 40-security/                  # PROTEKSI — akses, ancaman, kepatuhan
│   ├── SECURITY.md                 #   RBAC, Argon2id, HMAC, audit trail
│   ├── RBAC-MODEL.md               #   18 peran, 3 kelas principal
│   ├── SECURITY-PIPELINE.md        #   10 kontrol otomatis CI
│   ├── THREAT-MODEL.md             #   Analisis STRIDE & risiko terbuka
│   └── COMPLIANCE-ID.md            #   Kerangka pertanyaan hukum
│
├── 📂 50-operations/                # MENJALANKAN — infra, deploy, observabilitas, insiden
│   ├── INFRASTRUCTURE.md           #   Topologi VPS & matriks paparan port
│   ├── DOKPLOY.md                  #   Platform deploy, domain, TLS, backup
│   ├── DOCKER.md                   #   Standar image, compose & registry
│   ├── NETWORK-HARDENING.md        #   Firewall UFW, SSH, jebakan Docker↔UFW
│   ├── CONFIGURATION.md            #   Env var, rahasia, rotasi
│   ├── DEPLOYMENT.md               #   Jendela rilis, rollback
│   ├── OBSERVABILITY.md            #   SLO, metrik, alarm
│   ├── BACKUP-DR.md                #   RPO/RTO, uji restore
│   ├── SERVER-PROVISIONING.md      #   Ketentuan server & bootstrap Hostinger
│   ├── GO-LIVE.md                  #   Checklist rilis pertama
│   └── runbooks/                   #   6 prosedur insiden
│
├── 📂 60-quality/                   # MEMBUKTIKAN — tes, budget performa, a11y
│   ├── TESTING-STRATEGY.md         #   Piramida, uji offline, gerbang CI
│   ├── PERFORMANCE-BUDGET.md       #   Ambang yang memblokir merge
│   ├── ACCESSIBILITY.md            #   WCAG AAA & aturan kasir
│   └── HARDWARE-SUPPORT.md         #   Printer, scanner, batasan iOS
│
├── 📂 70-design-system/             # TAMPAK — token, komponen, halaman
│   ├── MASTER.md
│   ├── fondasi-UI-v0.1.md
│   └── pages/kasir.md
│
├── 📂 80-assets/                    # ASET — 100% Pure Vector SVG & 3D Renders
│   ├── icons-3d/  brand-mascot/  scenes-3d/  vectors-patterns/
│
└── 📂 90-prototypes/                # BUKTI — showcase HTML interaktif
    ├── landing-page.html
    └── glassbrut-showcase.html
```

---

## ⚡ Quick Start & Demo

Buka [90-prototypes/landing-page.html](./90-prototypes/landing-page.html) di browser untuk menguji:

* Umpan balik **Web Audio API Haptics** (suara ketukan air empuk & chord sukses).
* **Simulator Kasir POS** real-time dengan menu SVG interaktif.
* **Theme Switcher** antara mode terang *Warm Oat Milk* dan mode malam *Sweet Dark Cocoa*.
* iOS-grade bottom drawer & simulasi checkout QRIS.

---

## 🧭 Jalur Baca per Peran

| Peran | Urutan baca |
|---|---|
| **Backend Engineer** | `10-architecture/README.md` (urutan 1→6) → `30-data/DATA-MODEL.md` → `20-api/` |
| **Frontend / PWA** | `00-product/PRD` → `70-design-system/` → `20-api/openapi.yaml` |
| **Product / Owner** | `00-product/README.md` (urutan baca 1→10) → `90-prototypes/` |
| **DevOps / SRE** | `50-operations/SERVER-PROVISIONING.md` → `DOKPLOY.md` → `NETWORK-HARDENING.md` → `GO-LIVE.md` |
| **Mulai ngoding** | `15-development/README.md` (jalur Fase A→E) → `DEV-VS-PROD.md` → `LOCAL-SETUP.md` |

---

## 🎨 Prinsip Desain

* **Zero Pure Black:** tidak ada `#000000`. Menggunakan **Warm Dark Cocoa (`#2D231E`)**
  demi kenyamanan mata kasir sepanjang shift.
* **Mochi Spring Physics:** interaksi elastis membal `cubic-bezier(0.34, 1.56, 0.64, 1)`.
* **Offline-First Mutlak:** transaksi tersimpan lokal di IndexedDB dan tersinkronisasi otomatis.
