# Migrasi Basis Data

Berkas SQL aktual. Aturan lengkap ada di [../MIGRATIONS.md](../MIGRATIONS.md).

**Tooling:** `goose` · **Basis data:** PostgreSQL 16

---

## Menjalankan

```bash
goose -dir . postgres "$DATABASE_URL" up
goose -dir . postgres "$DATABASE_URL" status
```

Di lingkungan lokal cukup `make migrate` ([15-development/LOCAL-SETUP.md](../../15-development/LOCAL-SETUP.md)).

---

## Urutan

| # | Berkas | Isi |
|---|---|---|
| 00001 | `foundation` | tenants · outlets · users · penugasan outlet · refresh token |
| 00002 | `platform_principals` | platform admin · break-glass · identitas eksternal · template peran |
| 00003 | `catalog` | kategori · produk · varian (**desimal + UOM + item_type**) · konversi satuan |
| 00004 | `crm` | pelanggan · consent · segmen · interaksi |
| 00005 | `shifts_and_sales` | shift · kas · transaksi · item · pembayaran · refund |
| 00006 | `stock_ledger` | stock_events · opname |
| 00007 | `sync_and_infra` | idempotensi sync · webhook · job · outbox · audit log |
| 00008 | `analytics` | ringkasan BI · prediksi restock |
| 00009 | `sop` | template & eksekusi SOP |

Urutan ditentukan ketergantungan foreign key. `customers` sengaja dibuat **sebelum**
`sales_transactions`, karena transaksi merujuknya.

---

## Konvensi

| Hal | Aturan |
|---|---|
| Primary key | `VARCHAR(26)` ULID — dibuat klien untuk entitas yang bisa lahir offline |
| **Uang** | `DECIMAL(14,2)` — tidak pernah `FLOAT` |
| **Kuantitas & stok** | `DECIMAL(14,3)` — mendukung 0,5 kg dan 750 ml |
| Waktu | `TIMESTAMPTZ`, disimpan UTC |
| Tenant scoping | Setiap tabel transaksional punya `tenant_id` + indeks berawalan `(tenant_id, ...)` |
| Katalog | Di-arsip lewat `is_active`, **tidak** di-`DELETE` |

---

## Catatan Penting

**`-- +goose Down` hanya untuk pengembangan lokal.** Di produksi berlaku aturan
*hanya maju* ([../MIGRATIONS.md](../MIGRATIONS.md) §3): rollback dilakukan lewat migrasi
baru yang memperbaiki, bukan membalik. Membalik migrasi yang sudah menyentuh data transaksi
berisiko menghapus penjualan.

**Menambah indeks setelah ada data produksi wajib `CONCURRENTLY`** dan blok
`-- +goose NO TRANSACTION`. Pada migrasi awal ini tidak diperlukan karena tabelnya kosong —
tetapi `CREATE INDEX` biasa pada `sales_transactions` yang sudah besar akan **mengunci tabel
dan menghentikan seluruh kasir di semua tenant**.

**Lokasi berkas akan pindah** ke `services/pos-engine/db/migrations/` begitu monorepo dibuat
([15-development/REPOSITORY.md](../../15-development/REPOSITORY.md)).
