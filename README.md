# ionowu sweet

Sistem kasir **PWA offline-first** untuk UMKM Indonesia, berkembang menjadi mini-ERP
dengan CRM, Business Intelligence, dan modul SOP.

> **Tesis produk:** UMKM gagal naik kelas bukan karena kurang pelanggan, melainkan karena
> operasionalnya hanya ada di kepala pemilik. Pembeda utamanya bukan daftar fitur,
> melainkan **offline-first** (toko tetap bisa jualan saat semuanya mati) dan
> **SOP yang diturunkan dari data**.

---

## Kenapa offline-first, bukan sekadar "ada mode offline"

Kasir tidak boleh menunggu. Empat invarian di bawah tidak pernah boleh dilanggar —
semuanya ditegakkan di kode, bukan sekadar niat baik:

| # | Invarian | Ditegakkan oleh |
|:-:|---|---|
| 1 | Setiap kueri memfilter `tenant_id` | Aturan `sqlc vet` kustom (`wajib-tenant-scope`) |
| 2 | Kasir tetap bisa berjualan meski server/internet mati | Antrean IndexedDB (Dexie) + sync ULID idempoten |
| 3 | Uang `DECIMAL(14,2)`, kuantitas `DECIMAL(14,3)` — **tidak pernah** `float` | `shopspring/decimal` (Go) + `decimal.js` (TS), diuji paritas lewat fixture JSON bersama |
| 4 | Transaksi offline selalu diterima, meski membuat stok negatif | `DecrementStockAllowNegative` di jalur `/sync/push` |

Barang sudah keluar dan uang sudah diterima — menolak sync berarti menghapus penjualan nyata.

---

## Arsitektur

```
apps/web/              Next.js 15 PWA — kasir, dasbor, katalog
                       Dexie (IndexedDB) · Serwist · Tailwind · Biome · Vitest · Playwright

services/pos-engine/   Go — chi · pgx/v5 · sqlc · goose · JWT EdDSA · Argon2id
                       cmd/api (HTTP) · cmd/seed (data contoh dua tenant)

30-data/               Sumber kebenaran skema: migrations/ + queries/ (SQL-first, sqlc)
docs/                  Dokumentasi lengkap — mulai dari docs/DOCS-MAP.md
infra/                 Skrip init database
```

Detail keputusan arsitektur ada di `docs/10-architecture/adr/` (ADR-0001 dst.).

---

## Menjalankan secara lokal

**Prasyarat: hanya Docker.** Mac/PC kamu tidak perlu punya Go, Node, pnpm, goose, atau sqlc —
seluruh toolchain hidup di dalam Dev Container.

```bash
cp .env.example .env       # lalu isi DEV_* (lihat komentar di dalamnya)
make dev                   # nyalakan stack + migrasi + data contoh
```

`make seed` mencetak kredensial login yang bisa langsung dipakai. Seeder sengaja membuat
**dua tenant** — isolasi antar-tenant tidak bisa diuji dengan satu tenant saja.

Perintah lain:

```bash
make help           # daftar semua perintah
make shell          # masuk ke dalam container kerja
make test           # seluruh uji Go
make test-money     # paritas rumus uang Go ↔ TypeScript
make sqlc-vet       # tegakkan aturan tenant-scope & larangan SELECT *
make lint           # golangci-lint + biome
make reset          # HAPUS volume, mulai dari nol (hanya lokal)
```

Butuh akses dari browser host? Tambahkan overlay port:

```bash
docker compose -f docker-compose.dev.yml -f docker-compose.expose.yml up -d
# web → http://localhost:3005 · api → http://localhost:8080
```

---

## Menjalankan uji

```bash
make test           # Go: unit + integrasi
make test-money     # fixture uang dipakai Go DAN TypeScript — wajib 100% sama
make test-offline   # Playwright, skenario jaringan mati
```

Aturan uang diuji dari **satu berkas fixture JSON yang sama** di kedua bahasa. Kalau Go dan
TypeScript pernah berbeda satu rupiah pun, uji ini gagal — bukan ditemukan pelanggan.

---

## Produksi

Build image di GitHub Actions → `ghcr.io`, **bukan** di VPS (build di VPS bisa OOM saat kasir
sedang bertransaksi). Deploy lewat Dokploy + Traefik dengan **model dua proyek**
(ADR-0009): satu proyek Compose untuk lapisan data, satu proyek Application untuk layanan
stateless.

Rahasia produksi tidak pernah ada di repositori ini — semuanya di panel Environment Dokploy.
Berkas `docker-compose.dev.yml` hanya membaca variabel `DEV_*` dari `.env` lokal yang
tidak ikut ter-commit.

---

## Dokumentasi

| Mulai dari | Isi |
|---|---|
| [`docs/DOCS-MAP.md`](./docs/DOCS-MAP.md) | Indeks seluruh dokumen + statusnya |
| [`CLAUDE.md`](./CLAUDE.md) | Keputusan yang sudah diambil, yang sudah ditolak, dan invarian |
| [`docs/00-product/`](./docs/00-product/) | Visi, persona, PRD, roadmap |
| [`docs/10-architecture/adr/`](./docs/10-architecture/adr/) | Architecture Decision Records |
| [`docs/70-design-system/`](./docs/70-design-system/) | Bahasa visual *Sweet Creamy Spatial Luxe* |

---

## Status

Fase 0. Jalur kasir inti (login → buka shift → checkout → sync) sudah berjalan end-to-end
dan diverifikasi lewat browser nyata, bukan hanya uji unit. Yang **belum** digarap dan jangan
diasumsikan ada: refund UI, void, transfer stok, CRM, analytics lanjutan, dan modul SOP.

Yang memblokir dan bukan pekerjaan teknis: vendor QRIS, BSP WhatsApp resmi, wawancara
pelanggan pilot, serta T&C + DPA. Keempatnya tidak memblokir Fase 0 yang hanya butuh tunai.
