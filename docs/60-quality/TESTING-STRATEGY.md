# Strategi Pengujian

> **Status:** 🟡 Draft · **Prioritas:** 🟠 P1
> **Dokumen Terkait:** [PERFORMANCE-BUDGET.md](./PERFORMANCE-BUDGET.md), [OFFLINE-SYNC-SPEC.md](../30-data/OFFLINE-SYNC-SPEC.md)

---

## 1. Apa yang Harus Dibuktikan

[PRD](../00-product/PRD-01-POS-INTI.md) §4 membuat janji terukur, tetapi metode
verifikasinya sebagian besar berupa benchmark sekali jalan. Yang dibutuhkan adalah
**gerbang otomatis di CI**, bukan pengukuran manual yang dilakukan sekali lalu dilupakan.

Prioritas pengujian mengikuti kerugian bila gagal:

1. **Uang salah hitung** — tidak dapat dipulihkan dengan patch
2. **Kebocoran antar-tenant** — kepercayaan hilang permanen
3. **Offline rusak** — pembeda utama produk lenyap
4. **Kasir lambat** — adopsi gagal dari dalam

---

## 2. Piramida

```
        ╱ E2E ╲            sedikit, lambat, alur kritis saja
      ╱─────────╲
    ╱ Integrasi  ╲         API + DB nyata, konflik sync
  ╱───────────────╲
╱   Unit + Kontrak  ╲      banyak, cepat, rumus uang
```

| Lapisan | Cakupan target | Menguji |
|---|---|---|
| Unit | Rumus uang: **100%** | Diskon, pajak, pembulatan, variance |
| Kontrak | Semua endpoint | `openapi.yaml` cocok dengan implementasi |
| Integrasi | Jalur uang & sync | Postgres + Redis nyata |
| E2E | 6 alur kritis (§5) | Browser sungguhan |

> **Cakupan menyeluruh 80% bukan target yang berguna.** Rumus perhitungan uang butuh 100%;
> halaman pengaturan boleh jauh lebih rendah. Menetapkan satu angka untuk semuanya mendorong
> orang menulis uji yang mudah, bukan uji yang penting.

---

## 3. Uji yang Paling Menentukan

### A. Paritas rumus klien–server

[SERVICE-BOUNDARIES.md](../10-architecture/SERVICE-BOUNDARIES.md) §4 menerima duplikasi rumus
total (Go untuk server, TypeScript untuk offline). Duplikasi itu **wajib diikat oleh uji**.

```
Berkas kasus bersama (JSON): keranjang, diskon, pajak → total yang diharapkan
   ├─► dijalankan oleh uji Go
   └─► dijalankan oleh uji TypeScript
Kedua hasil wajib identik, termasuk pembulatan.
```

Bila uji ini tidak ada, ketidakcocokan baru ketahuan di produksi sebagai
`INVALID_TRANSACTION_TOTAL` — yang artinya **struk pelanggan tidak cocok dengan catatan server**.

### B. Isolasi tenant

Setiap endpoint diuji dengan dua tenant:

```
Tenant A membuat data → Tenant B meminta data itu → wajib 404/403, bukan 200
```

Ini harus **otomatis untuk semua endpoint**, bukan dipilih manual. Endpoint baru yang lupa
diuji adalah persis cara kebocoran lolos ke produksi. Termasuk memeriksa kunci Redis
mengandung `tenant_id` ([REDIS-STRATEGY](../10-architecture/REDIS-STRATEGY.md) §4).

### C. Uji offline

Ini yang membuktikan pembeda utama produk. Playwright dengan `context.setOffline(true)`:

| Skenario | Harus terjadi |
|---|---|
| Jaringan mati saat checkout | Transaksi selesai, struk tercetak, **tanpa dialog error** |
| Jaringan mati saat sync | Batch diulang, tidak ada duplikat |
| Muat ulang browser dgn antrean terisi | Antrean utuh |
| Offline 7 hari lalu online | Semua tersinkron berurutan |
| 10.000 transaksi di IndexedDB | Peringatan muncul di 70%/85%/95% |
| Dua perangkat jual stok terakhir | Keduanya diterima, stok −1, alert muncul |
| Jam perangkat mundur 3 jam | Terkoreksi & ditandai |

---

## 4. Data Uji

* **Jangan pernah memakai data produksi** yang belum dianonimkan.
* Seeder membuat tenant lengkap: outlet, katalog, shift, riwayat transaksi.
* Sediakan **minimal dua tenant** di setiap lingkungan uji — isolasi tidak bisa diuji dengan satu.
* Kasus tepi uang wajib ada: pembulatan `.005`, diskon 100%, pembayaran gabungan, refund parsial.

---

## 5. Alur E2E Kritis

1. Daftar → 5 produk → transaksi pertama → tutup shift *(jalur aktivasi)*
2. Checkout: scan → keranjang → bayar gabungan → cetak
3. Siklus offline penuh: putus → 5 transaksi → sambung → sinkron
4. Buka shift → petty cash → tutup → variance benar
5. Void & refund dengan PIN manager
6. Pembayaran QRIS lewat sandbox gateway

---

## 6. Gerbang CI

| Gerbang | Gagal berarti |
|---|---|
| **`sqlc vet`** — tenant scope, tanpa `SELECT *`, tanpa DELETE transaksional | Blokir merge |
| Unit + integrasi lulus | Blokir merge |
| Uji isolasi tenant lulus | Blokir merge |
| Paritas rumus klien–server | Blokir merge |
| Uji kontrak vs `openapi.yaml` | Blokir merge |
| Budget performa terpenuhi | Blokir merge ([PERFORMANCE-BUDGET](./PERFORMANCE-BUDGET.md)) |
| **Tidak ada rahasia di log uji** | Blokir merge ([OBSERVABILITY](../50-operations/OBSERVABILITY.md) §4) |
| E2E lulus | Blokir rilis |

---

## 7. Yang Harus Ditetapkan

- [x] ✅ Uji Go: **`testify` + `testcontainers-go`**
- [x] ✅ Uji TS: **Vitest**; E2E: **Playwright**
- [x] ✅ Platform CI: **GitHub Actions** ([ADR-0004](../10-architecture/adr/0004-ci-build-and-registry.md))
- [ ] Sandbox gateway QRIS untuk E2E
- [ ] Uji beban: k6 terhadap target di [SCALABILITY-RELIABILITY](../10-architecture/SCALABILITY-RELIABILITY.md) §1
- [ ] Uji pada perangkat Android RAM 3GB sungguhan, bukan hanya emulator
