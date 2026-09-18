# Struktur Repositori

> **Status:** 🟡 Draft — §1 (monorepo) **✅ final**, dikonfirmasi pemilik 2026-09-18. §2 belum
> dicocokkan ulang dengan isi repo.
> **Urutan baca:** dokumen **ke-1** dari 15-development

---

## 1. ✅ Keputusan: Monorepo

**Satu repositori untuk semuanya**, termasuk dokumentasi ini. Dikonfirmasi final oleh pemilik
pada 2026-09-18 — repo `ionowu-sweet` sudah berjalan dalam bentuk ini sejak awal kode.

| Opsi | Kelebihan | Kekurangan |
|---|---|---|
| **Monorepo** ✅ *(dipilih)* | Satu PR bisa mengubah API + klien + dokumen sekaligus; kontrak selalu sinkron; satu CI | Repo lebih besar; butuh path filter di CI |
| Repo terpisah per layanan | Batas tegas; CI lebih ringan | **Perubahan kontrak API butuh 2–3 PR terkoordinasi** — sumber ketidaksinkronan yang mahal |

Alasan utama memilih monorepo di proyek ini: `openapi.yaml` adalah kontrak antara Go dan
TypeScript, dan rumus perhitungan uang **sengaja diduplikasi** di kedua sisi
([SERVICE-BOUNDARIES](../10-architecture/SERVICE-BOUNDARIES.md) §4). Uji paritas rumus
klien–server ([TESTING-STRATEGY](../60-quality/TESTING-STRATEGY.md) §3A) **hanya bisa
berjalan di satu CI bila keduanya ada di repo yang sama.**

> **Konsekuensi untuk dokumen ini:** dokumentasi hidup di `docs/` di dalam repo kode, bukan
> di folder terpisah. Dokumen yang hidup terpisah dari kode akan basi — dan dokumentasi basi
> lebih berbahaya daripada tidak ada dokumentasi.

---

## 2. Struktur

```
ionowu-sweet/
├── README.md
├── Makefile                        # perintah pengembang (lihat LOCAL-SETUP)
├── docker-compose.dev.yml          # stack lokal
├── docker-compose.prod.yml         # dipakai Dokploy — hanya image, tanpa build
├── .env.example                    # TANPA nilai rahasia sungguhan
├── .github/workflows/              # CI (lihat CI-PIPELINE.md)
│
├── services/
│   └── pos-engine/                 # Go — jalur uang
│       ├── cmd/server/main.go
│       ├── internal/
│       │   ├── handler/            # HTTP (chi)
│       │   ├── middleware/         # tenant, auth, ratelimit
│       │   ├── domain/             # rumus uang ← 100% coverage
│       │   ├── store/              # sqlc generated + kueri
│       │   └── sync/               # ingest offline
│       ├── db/
│       │   ├── migrations/         # goose
│       │   └── queries/            # SQL sumber untuk sqlc
│       ├── sqlc.yaml
│       └── Dockerfile
│
├── apps/
│   └── web/                        # Next.js 15 — PWA kasir + dasbor
│       ├── app/
│       │   ├── (kasir)/            # rute kasir — bundle TERKECIL
│       │   └── (dashboard)/        # dipisah agar tidak ikut ke perangkat kasir
│       ├── lib/
│       │   ├── db/                 # Dexie
│       │   ├── sync/               # ⚠️ antrean transaksi — implementasi sendiri
│       │   └── money/              # rumus uang ← paritas dgn Go
│       ├── public/sw.js            # Serwist
│       └── Dockerfile
│
├── packages/
│   ├── shared-types/               # tipe hasil generate dari openapi.yaml
│   └── money-testcases/            # ⭐ kasus uji uang bersama Go & TS
│
└── docs/                           # seluruh isi folder dokumentasi ini
```

### Dua folder yang paling menentukan

**`packages/money-testcases/`** — berisi berkas JSON kasus uji perhitungan uang, dijalankan
oleh uji Go **dan** uji TypeScript. Inilah yang mengikat duplikasi rumus agar tidak menyimpang.
Tanpa ini, ketidakcocokan baru ketahuan di produksi sebagai `INVALID_TRANSACTION_TOTAL` —
yang artinya struk pelanggan tidak cocok dengan catatan server.

**`apps/web/lib/sync/`** — antrean transaksi. Sengaja dipisah dari `lib/db/` agar terlihat
sebagai komponen tersendiri, bukan sekadar wrapper Dexie. Ia memegang urutan FIFO,
idempotensi ULID, dan antrean mati ([OFFLINE-SYNC-SPEC](../30-data/OFFLINE-SYNC-SPEC.md)).

├── services/
│   └── intelligence-worker/        # Python 3.12 — restock · CRM · BI
│       ├── src/
│       │   ├── restock/            # prediksi V0/V1
│       │   ├── crm/                # segmentasi RFM
│       │   └── bi/                 # agregasi semalam (duckdb)
│       ├── pyproject.toml          # uv
│       └── Dockerfile

> Layanan Python **aktif sejak Fase 1** ([ADR-0006](../10-architecture/adr/0006-crm-bi-and-python-service.md)) —
> CRM & BI membatalkan keputusan penundaan sebelumnya.

---

## 3. Pemisahan Rute Kasir & Dasbor

`app/(kasir)/` dan `app/(dashboard)/` dipisah sebagai route group karena
[PERFORMANCE-BUDGET](../60-quality/PERFORMANCE-BUDGET.md) §4 mensyaratkan rute kasir menjadi
bundle terkecil. Kode dasbor pemilik **tidak boleh** ikut terkirim ke perangkat kasir RAM 3GB.

Pemisahan ini harus dijaga oleh gerbang CI ukuran bundle, bukan oleh niat baik.

---

## 4. Konvensi

| Hal | Aturan |
|---|---|
| Nama folder | `kebab-case` |
| Paket Go | `internal/` untuk yang tidak boleh diimpor luar |
| Berkas migrasi | `NNNNN_deskripsi.sql`, hanya maju |
| Kueri SQL | Ditulis tangan di `db/queries/`, digenerate `sqlc` |
| Rahasia | **Tidak pernah** di repo — `.env` wajib di `.gitignore` |

---

## 5. Yang Wajib Ada di `.gitignore` & `.dockerignore`

```
.env
.env.*
!.env.example
node_modules/
.next/
dist/
*.log
```

> `.dockerignore` **wajib** memuat `.env` dan `.git`. Tanpa itu, `COPY . .` menanam rahasia
> secara permanen di layer image — tetap terbaca meski berkasnya dihapus di layer berikutnya
> ([DOCKER](../50-operations/DOCKER.md) §2).
