# Runbook: Tenant Melapor Transaksi Hilang

**Gejala:** "Penjualan kemarin tidak ada di laporan"

## 0. Sikap
Anggap **datanya ada di suatu tempat** sampai terbukti sebaliknya. Sebagian besar kasus
adalah masalah tampilan atau sinkronisasi, bukan kehilangan data.

## 1. Kumpulkan fakta
Tenant, outlet, tanggal & jam, perkiraan jumlah transaksi, perangkat mana, apakah saat itu
sedang offline.

## 2. Masih di perangkat?
Paling sering: transaksi ada, tetapi belum tersinkron.
```
Di perangkat kasir: buka status sinkronisasi → jumlah "pending"
```
Bila pending → ikuti [sync-stuck.md](./sync-stuck.md). **Data aman.**

## 3. Ada di server tapi tidak tampil?
```sql
SELECT count(*), sum(grand_total) FROM sales_transactions
WHERE tenant_id=$1 AND outlet_id=$2
  AND created_at BETWEEN $3 AND $4;
```
Ada → masalah tampilan. Periksa:
- **Zona waktu** — laporan memakai zona yang salah? ([MULTI-OUTLET](../../00-product/MULTI-OUTLET.md) §5)
- **Batas jam tutup buku** — transaksi lewat tengah malam masuk hari berikutnya?
- **Penanda sandbox** — tertandai `is_sandbox` sehingga dikecualikan laporan?
- **Penerimaan terlambat** — `is_late_arrival = TRUE`, ada di laporan terpisah

> Tiga penyebab pertama adalah yang paling sering. Periksa itu dulu sebelum mencurigai
> kehilangan data.

## 4. Benar-benar tidak ada di server
```sql
SELECT * FROM sync_receipts WHERE tenant_id=$1
  AND created_at BETWEEN $2 AND $3;
SELECT * FROM audit_logs WHERE tenant_id=$1 AND action_type='VOID_TRANSACTION'
  AND created_at BETWEEN $2 AND $3;
```
- Ada void → transaksi dibatalkan, bukan hilang. **Tunjukkan siapa dan kapan.**
- Perangkat hilang/rusak sebelum sync → 🔴 data memang hilang; jujur kepada tenant

## 5. Eskalasi
Bila ada di `sync_receipts` tetapi tidak di `sales_transactions` → 🔴 **bug ingest serius**.
Kumpulkan bukti, jangan ubah data, eskalasi.

## 6. Komunikasi
Selalu beri tahu tenant apa yang **benar-benar** terjadi. Bila data hilang, katakan terus
terang beserta penyebab dan pencegahannya. Menyamarkan kehilangan data merusak kepercayaan
jauh lebih parah daripada kehilangan itu sendiri.
