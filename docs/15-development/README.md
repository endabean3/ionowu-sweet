# 15-development — Dari Repo Kosong sampai Deploy Produksi

Folder ini menjawab: **bagaimana tim bekerja**, sehingga saat produksi tiba, deploy lewat
Dokploy hanyalah langkah terakhir yang membosankan — bukan peristiwa yang menegangkan.

> **Prinsip yang mengikat seluruh folder ini:** setiap hal yang bisa gagal harus gagal
> **sebelum** produksi. Deploy produksi yang baik adalah deploy yang tidak menghasilkan
> kejutan apa pun, karena semuanya sudah terbukti di lokal dan staging.

---

## 1. Jalur Ujung-ke-Ujung

```
┌─ FASE A ─ PERSIAPAN ──────────────────────────────────────┐
│  A1  Buat repo monorepo         → REPOSITORY.md           │
│  A2  Scaffold layanan & CI       → CI-PIPELINE.md         │
│  A3  Lingkungan lokal jalan      → LOCAL-SETUP.md         │
│      ✅ Gerbang: `make dev` menyalakan seluruh stack       │
└───────────────────────────────────────────────────────────┘
                            ↓
┌─ FASE B ─ IMPLEMENTASI ───────────────────────────────────┐
│  B1  Migrasi & skema             → 30-data/MIGRATIONS.md  │
│  B2  Fitur Fase 0                → 00-product/ROADMAP.md  │
│  B3  Uji + gerbang CI            → 60-quality/            │
│      ✅ Gerbang: CI hijau, uji offline lulus              │
└───────────────────────────────────────────────────────────┘
                            ↓
┌─ FASE C ─ PERSIAPAN SERVER (paralel dgn B) ───────────────┐
│  C1  Provisioning Hostinger      → 50-operations/SERVER-PROVISIONING.md │
│  C2  Pasang Dokploy + Traefik    → idem                   │
│  C3  DNS, TLS, firewall          → idem                   │
│  C4  Rahasia & registry          → 50-operations/CONFIGURATION.md │
│      ✅ Gerbang: nmap dari luar hanya 22/80/443           │
└───────────────────────────────────────────────────────────┘
                            ↓
┌─ FASE D ─ STAGING ────────────────────────────────────────┐
│  D1  Deploy staging via Dokploy                           │
│  D2  Uji migrasi dgn data mirip produksi                  │
│  D3  Uji restore backup                                   │
│  D4  Uji rollback                                         │
│      ✅ Gerbang: restore & rollback PERNAH dijalankan     │
└───────────────────────────────────────────────────────────┘
                            ↓
┌─ FASE E ─ GO-LIVE ────────────────────────────────────────┐
│  E1  Checklist kesiapan          → 50-operations/GO-LIVE.md │
│  E2  Deploy produksi                                      │
│  E3  Toko percontohan 7 hari     → 00-product/ROADMAP.md  │
└───────────────────────────────────────────────────────────┘
```

**Fase C berjalan paralel dengan Fase B.** Provisioning server tidak menunggu kode selesai —
justru sebaliknya: server yang siap lebih dulu memungkinkan staging dipakai sejak fitur
pertama jadi.

---

## 2. Dokumen di Folder Ini

| # | Dokumen | Menjawab |
|:-:|---|---|
| 1 | [REPOSITORY.md](./REPOSITORY.md) | Kode ditaruh di mana, struktur apa |
| 2 | [LOCAL-SETUP.md](./LOCAL-SETUP.md) | Cara menjalankan seluruh stack di laptop |
| 3 | [WORKFLOW.md](./WORKFLOW.md) | Branch, commit, review, definition of done |
| 4 | [CI-PIPELINE.md](./CI-PIPELINE.md) | Apa yang berjalan di GitHub Actions |
| 5 | [DEV-VS-PROD.md](./DEV-VS-PROD.md) | **Apa yang berlaku di mana** — batas dev/staging/produksi |

**Di folder lain, bagian dari jalur yang sama:**

| Dokumen | Fase |
|---|---|
| [50-operations/SERVER-PROVISIONING.md](../50-operations/SERVER-PROVISIONING.md) | C |
| [50-operations/GO-LIVE.md](../50-operations/GO-LIVE.md) | E |
| [50-operations/DEPLOYMENT.md](../50-operations/DEPLOYMENT.md) | D–E, berulang |

---

## 3. Kenapa "Tinggal Deploy" Bisa Tercapai

Deploy produksi menjadi sepele **hanya bila** empat hal ini sudah benar sebelumnya:

| Prasyarat | Dijamin oleh |
|---|---|
| Image sudah dibangun & teruji | CI, bukan VPS ([ADR-0004](../10-architecture/adr/0004-ci-build-and-registry.md)) |
| Migrasi kompatibel mundur | Aturan expand–contract ([MIGRATIONS](../30-data/MIGRATIONS.md) §4) |
| Rahasia sudah ada di Dokploy | [CONFIGURATION](../50-operations/CONFIGURATION.md) |
| Rollback pernah diuji | Fase D4 — bukan diasumsikan |

Bila salah satu belum terpenuhi, deploy produksi berubah dari langkah rutin menjadi
perjudian. **Fase D ada khusus untuk memastikan keempatnya sudah terbukti.**

---

## 4. Aturan Folder Ini

1. **Lingkungan lokal harus semirip mungkin dengan produksi** — versi Postgres, Redis, dan
   Go/Node yang sama. Perbedaan versi adalah sumber bug "jalan di laptop saya".
2. **Tidak ada langkah manual yang tidak tercatat.** Bila seseorang harus SSH dan mengetik
   sesuatu, itu harus ada di dokumen — atau lebih baik, diotomatiskan.
3. **Produksi tidak pernah menjadi tempat percobaan pertama.** Setiap prosedur dijalankan
   di staging lebih dulu, termasuk restore dan rollback.
