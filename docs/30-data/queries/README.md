# Kueri SQL — Sumber untuk `sqlc`

SQL ditulis tangan di sini, lalu `sqlc generate` menghasilkan kode Go yang aman tipe.
**Jangan pernah mengedit kode hasil generate** — ubah SQL-nya, lalu generate ulang.

```bash
sqlc generate     # hasilkan kode Go
sqlc vet          # tegakkan aturan (lihat ../sqlc.yaml)
```

---

## Aturan Wajib

1. **Setiap kueri menyebut `tenant_id`** kecuali pada tabel lintas-tenant
   (`platform_admins`, `identities`, `distributors`, `webhook_events`) — dan pengecualian
   itu wajib diberi komentar `-- sqlc-vet-disable: wajib-tenant-scope` **di baris SQL yang
   sama** (inline), bukan di baris tersendiri di atas kueri. Contoh yang benar:
   ```sql
   INSERT INTO tenants (id, name) -- sqlc-vet-disable: wajib-tenant-scope
   VALUES ($1, $2) RETURNING id;
   ```
   Komentar di baris tersendiri **tidak terbaca** oleh `sqlc vet` — field `query.sql` yang
   dievaluasi aturan CEL tidak menyertakan komentar baris tersendiri.
   Ditegakkan otomatis oleh `sqlc vet`.
2. **Tanpa `SELECT *`.** Kolom baru akan ikut terbawa diam-diam — termasuk `cost_price`,
   yang hanya boleh dilihat Owner.
3. **`tenant_id` selalu parameter pertama.** Konsisten dan mudah diaudit sekilas.
4. **Kueri jalur checkout diberi tanda `-- HOT PATH`** beserta anggaran latensinya.

---

## Berkas

| Berkas | Isi |
|---|---|
| `catalog.sql` | Lookup barcode, resolusi harga, katalog untuk sync |
| `shift.sql` | Shift terbuka, saldo, tutup shift |
| `checkout.sql` | **Jalur uang** — transaksi, item, pembayaran, stok, outbox |
| `seed.sql` | Kueri untuk `cmd/seed` SAJA — bukan jalur produksi |

---

## Catatan `DECIMAL`

Seluruh kuantitas adalah `DECIMAL(14,3)` dan uang `DECIMAL(14,2)`, dipetakan ke
`decimal.Decimal` ([`sqlc.yaml`](../../../30-data/sqlc.yaml)).

> **Jangan pernah mengubahnya menjadi `float64`** — galat pecahan biner menumpuk dan muncul
> sebagai selisih kas yang tidak bisa dijelaskan siapa pun. Ini alasan tipe `numeric`
> di-override secara eksplisit alih-alih memakai bawaan pgx.
