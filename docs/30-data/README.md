# 30-data — Skema, Migrasi & Siklus Hidup Data

Sumber kebenaran untuk **bentuk data**, terpisah dari arsitektur sistem.

| # | Dokumen | Isi | Status |
|:-:|---|---|:---:|
| 1 | [DATA-MODEL.md](./DATA-MODEL.md) | Skema lengkap: tabel inti + pelengkap | 🟡 Draft |
| 2 | [MIGRATIONS.md](./MIGRATIONS.md) | Tooling, expand–contract, migrasi klien | 🟡 Draft |
| 3 | [OFFLINE-SYNC-SPEC.md](./OFFLINE-SYNC-SPEC.md) | Resolusi konflik & kasus tepi | 🟡 Draft |
| 4 | [RETENTION.md](./RETENTION.md) | Masa simpan, arsip, penghapusan | 🟡 Draft |
| 5 | [migrations/](./migrations/) | **Berkas SQL aktual — 11 migrasi, 47 tabel** | ✅ Ditulis |
| 6 | [sqlc.yaml](../../30-data/sqlc.yaml) | Konfigurasi generate Go + **aturan `sqlc vet`** | ✅ Ditulis |
| 7 | [queries/](./queries/) | **Kueri SQL — 23 kueri, jalur checkout** | ✅ Ditulis |

---

## Aturan Folder Ini

1. **Setiap tabel wajib punya `tenant_id`** dan indeks berawalan `(tenant_id, ...)`.
2. **Uang selalu `DECIMAL(14,2)`.** Tidak pernah `FLOAT`.
3. **Waktu disimpan UTC** dengan `TIMESTAMP WITH TIME ZONE`.
4. **Katalog di-arsip (`is_active`), tidak di-`DELETE`** — transaksi lama masih merujuknya.
5. **Setiap endpoint di [20-api/](../20-api/) wajib punya tabel penyangga di sini.**

## Status Skema

✅ **Sudah masuk migrasi** — 47 tabel: fondasi · principal & izin · katalog (desimal, UOM,
`item_type`, BOM, konversi satuan) · CRM · shift & penjualan · ledger stok & transfer ·
sync/webhook/outbox/audit · ringkasan BI & prediksi · SOP.

❌ **Belum masuk migrasi:**

| Tabel | Dari | Menunggu |
|---|---|---|
| `settlement_reports` | [INTEGRATION-QRIS](../20-api/INTEGRATION-QRIS.md) §6 | Pemilihan vendor QRIS |
| Langganan & tagihan | [PRICING-PACKAGING](../00-product/PRICING-PACKAGING.md) §7 | Finalisasi paket |
| Order pekerjaan (arketipe E) | [MARKET-SEGMENTS](../00-product/MARKET-SEGMENTS.md) §3 | Fase 3 |
| Sesi & slot waktu (arketipe D) | idem | Fase 4 |
