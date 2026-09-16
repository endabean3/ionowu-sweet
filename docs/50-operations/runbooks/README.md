# Runbooks

Prosedur untuk dijalankan saat ada masalah — ditulis untuk dibaca **pukul dua pagi oleh
orang yang panik**. Karena itu: langkah bernomor, perintah siap salin, tanpa prosa panjang.

| Runbook | Gejala |
|---|---|
| [sync-stuck.md](./sync-stuck.md) | Transaksi tidak masuk; antrean perangkat membengkak |
| [redis-down.md](./redis-down.md) | Redis mati atau tidak responsif |
| [qris-webhook-missing.md](./qris-webhook-missing.md) | Pembayaran QRIS menggantung `pending` |
| [database-full.md](./database-full.md) | Disk penuh; Postgres menolak tulis |
| [tenant-data-missing.md](./tenant-data-missing.md) | Tenant melapor transaksinya hilang |
| [suspected-data-bleed.md](./suspected-data-bleed.md) | 🔴 Dugaan kebocoran antar-tenant |
| [deploy-pertama.md](./deploy-pertama.md) | Deploy produksi pertama — dari DNS sampai login dari APK |

## Aturan Umum

1. **Kasir lebih dulu.** Pertanyaan pertama selalu: *apakah toko masih bisa berjualan?*
   Bila ya, ini bukan keadaan darurat — jangan ambil tindakan tergesa yang justru merusak.
2. **Jangan restart sebelum mengumpulkan bukti.** Restart menghapus jejak penyebab.
3. **Catat setiap tindakan** beserta waktunya, untuk postmortem.
4. **Bila menyangkut uang, libatkan orang kedua** sebelum mengubah data.
