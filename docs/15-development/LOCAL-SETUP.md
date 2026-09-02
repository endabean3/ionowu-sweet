# Setup Lingkungan Lokal

> **Status:** 🟡 Draft
> **Urutan baca:** dokumen **ke-2**
> **Tujuan:** pengembang baru bisa menjalankan seluruh stack dan bertransaksi **dalam 30 menit**.

---

## 1. Prasyarat — hanya satu

| Tool | Catatan |
|---|---|
| **Docker Desktop** | Itu saja. |
| VS Code / Cursor *(opsional)* | Untuk "Reopen in Container" |

**Mac Anda tidak perlu Go, Node, pnpm, Python, goose, maupun sqlc.** Seluruh toolchain
berada di dalam Dev Container (`.devcontainer/Dockerfile`), dengan **versi dipin**:

```
Go 1.26 · Node 24 LTS · pnpm 11.22.0 · Python 3.12 · uv
goose v3.27.3 · sqlc v1.31.1 · golangci-lint v2.12.2
Postgres 16 · Redis 7          ← versi SAMA dengan produksi
```

> **Kenapa semua di container:** menghilangkan "jalan di laptop saya" sejak akar. Versi
> Postgres dan Redis identik dengan produksi — pada basis data keuangan, perbedaan perilaku
> pembulatan atau penguncian tidak boleh ditemukan pertama kali di produksi.
>
> Manfaat lain: mesin Anda tetap bersih. Proyek lain di laptop yang sama tidak terganggu,
> dan tidak ada bentrok versi antar-proyek.

### Kalau memakai VS Code / Cursor

Buka folder ini → **"Reopen in Container"**. Editor masuk ke dalam container, sehingga
autocomplete, go-to-definition, dan error inline tetap berfungsi penuh — inilah yang
membedakan Dev Container dari sekadar `docker run`.

---

## 2. Langkah Pertama

```bash
git clone <repo> && cd docs-umkm-intelligence
make dev
```

`make dev` membangun wadah kerja, menyalakan Postgres + Redis, dan menjalankan migrasi.

`make help` menampilkan seluruh perintah. Semuanya otomatis dijalankan **di dalam container**
— Anda tidak perlu masuk manual.

```
web-app     → http://localhost:3000
pos-engine  → http://localhost:8080
postgres    → localhost:5432
redis       → localhost:6379
```

---

## 3. Perintah Makefile

| Perintah | Fungsi |
|---|---|
| `make dev` | Nyalakan seluruh stack |
| `make down` | Matikan, volume tetap |
| `make reset` | **Hapus volume**, migrasi & seed ulang |
| `make migrate` | Jalankan migrasi |
| `make migrate-new name=...` | Buat berkas migrasi baru |
| `make sqlc` | Generate kode dari `queries/` |
| `make sqlc-vet` | Tegakkan aturan tenant scope & SELECT * |
| `make shell` | Masuk ke dalam wadah kerja |
| `make tools-check` | Verifikasi versi seluruh tool |
| `make psql` | Buka psql ke database dev |
| `make docs-check` | Validasi tautan dokumentasi |
| `make seed` | Isi data contoh |
| `make test` | Seluruh uji |
| `make test-money` | **Hanya paritas rumus uang Go ↔ TS** |
| `make test-offline` | Playwright, skenario offline |
| `make lint` | golangci-lint + Biome |

---

## 4. Data Contoh — Wajib Dua Tenant

Seeder membuat **dua tenant lengkap**, bukan satu:

```
Tenant A "Kopi Senja"   → 2 outlet, 25 varian, 3 pengguna, riwayat 30 hari
Tenant B "Roti Manis"   → 1 outlet, 12 varian, 2 pengguna, riwayat 30 hari
```

> **Isolasi tenant tidak bisa diuji dengan satu tenant.** Setiap lingkungan pengembangan
> wajib punya minimal dua, agar kebocoran antar-tenant
> ([TESTING-STRATEGY](../60-quality/TESTING-STRATEGY.md) §3B) tertangkap sejak lokal.

Akun contoh: `owner@kopisenja.test` / `manager@` / `cashier@` — kata sandi ada di `.env.example`.
Riwayat 30 hari cukup untuk menguji laporan; **belum cukup** untuk prediksi restock (butuh 8 minggu).

---

## 5. Menguji Mode Offline di Lokal

Ini pembeda utama produk, jadi harus mudah diuji sejak hari pertama.

| Cara | Langkah |
|---|---|
| **DevTools** | Network → Offline. Cepat, untuk pemeriksaan manual. |
| **Matikan API** | `docker compose stop pos-engine` — lebih realistis: browser online, server tidak terjangkau |
| **Playwright** | `make test-offline` — `context.setOffline(true)` |

> Cara kedua paling sering terlewat, padahal itulah yang terjadi di toko: internet toko
> hidup, tetapi VPS tidak terjangkau. `navigator.onLine` akan tetap `true` — sehingga
> deteksi konektivitas **tidak boleh** hanya bergantung padanya
> ([FDR](../10-architecture/FDR.md) §3B).

---

## 6. `docker-compose.dev.yml` — Berbeda dari Produksi

| Aspek | Dev | Produksi |
|---|---|---|
| Build | Lokal, dengan hot reload | Image dari `ghcr.io` |
| `ports:` | **Dipublish** agar bisa diakses | **Tidak ada** — hanya Traefik |
| Rahasia | Nilai dev di `.env` | Panel Dokploy |
| Data | Seed, boleh dihapus | Nyata, dicadangkan |

> Publikasi port di dev **aman dan disengaja**. Yang berbahaya adalah membawanya ke produksi —
> lihat jebakan Docker↔UFW di [NETWORK-HARDENING](../50-operations/NETWORK-HARDENING.md) §3.
> Karena itu compose dev dan produksi adalah **dua berkas terpisah**, bukan satu berkas
> dengan percabangan.

---

## 7. Masalah Umum

### Akses GUI database dari host

Secara bawaan **port database tidak di-publish** — seluruh tool sudah ada di dalam
workspace, jadi ia menjangkau Postgres lewat jaringan Docker internal. Ini juga
menghindari bentrok dengan proyek lain di mesin yang sama.

Butuh TablePlus/DBeaver? Pakai overlay opsional:

```bash
docker compose -f docker-compose.dev.yml -f docker-compose.expose.yml up -d
# Postgres -> localhost:5440   ·   Redis -> localhost:6390
```

Port 5440/6390 dipilih karena 5432 dan 6379 sudah dipakai proyek lain di mesin ini.

---

## 8. Masalah Umum

| Gejala | Sebab |
|---|---|
| `connection refused` ke Postgres | Healthcheck belum lulus — `make dev` menunggunya |
| Migrasi gagal | Skema lokal tertinggal → `make reset` |
| Uji paritas uang gagal | **Rumus Go dan TS menyimpang** — perbaiki sebelum lanjut |
| Service Worker tidak aktif | SW butuh `localhost` atau HTTPS |
| Antrean sync tidak jalan | Cek `navigator.storage.persist()` sudah dipanggil |
| `port is already allocated` | Proyek lain memakai port itu — jangan pakai overlay expose |
