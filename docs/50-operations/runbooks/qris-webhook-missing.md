# Runbook: Webhook QRIS Tidak Masuk

**Gejala:** transaksi `pending` menumpuk · pelanggan mengaku sudah bayar

## 0. Nilai keparahan
🟠 **Menyangkut uang.** Pelanggan mungkin sudah membayar barang yang belum ditandai lunas.

## 1. Cakupan
```sql
SELECT count(*) FROM sales_transactions
WHERE payment_status='pending' AND created_at > now() - interval '1 hour';
```
Satu tenant → masalah konfigurasi merchant. Semua → masalah gateway atau endpoint kita.

## 2. Endpoint kita hidup?
```bash
curl -I https://api.sweet.ionowu.com/v1/webhooks/qris     # harap bukan 404/502
docker logs --tail 200 pos-engine | grep -i webhook
```

## 3. Periksa penolakan
```sql
SELECT process_status, count(*) FROM webhook_events
WHERE received_at > now() - interval '1 hour' GROUP BY process_status;
```
- `rejected_signature` → 🔴 **alarm keamanan** atau rahasia webhook salah/baru dirotasi
- `rejected_replay` → jam server meleset; periksa sinkronisasi NTP

## 4. Fallback polling
Polling harusnya menutup celah ini otomatis
([INTEGRATION-QRIS](../../20-api/INTEGRATION-QRIS.md) §5). Bila transaksi tetap `pending`
>15 menit, polling tidak berjalan → periksa jobnya.

## 5. Rekonsiliasi manual
1. Tarik laporan transaksi dari dasbor gateway
2. Cocokkan dengan `sales_transactions` yang `pending`
3. **Jangan tandai `paid` secara manual tanpa bukti dari gateway**
4. Setiap koreksi manual wajib masuk `audit_logs`

## 6. Bila gateway mati total
Beri tahu tenant: **gunakan tunai sementara**. Kasir tetap berfungsi penuh.
