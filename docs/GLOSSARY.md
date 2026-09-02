# 📖 GLOSSARY — Kamus Istilah ionowu sweet

Istilah domain kasir/UMKM tidak universal. Halaman ini adalah rujukan tunggal agar PRD, API,
dan UI memakai kata yang sama untuk hal yang sama.

| Istilah | Arti dalam sistem ini |
|---|---|
| **Tenant** | Satu organisasi/usaha pelanggan. Batas isolasi data tertinggi. Satu tenant bisa punya banyak outlet. |
| **Outlet** | Satu cabang/lokasi fisik toko. Stok dihitung per outlet, bukan per tenant. |
| **Shift** | Satu periode kerja kasir, dari input saldo awal laci sampai rekonsiliasi uang fisik. |
| **Z-Report** | Struk ringkasan yang dicetak saat shift ditutup: total penjualan, rincian metode bayar, dan selisih kas. Bersifat final — tidak boleh berubah setelah dicetak. |
| **Variance (Selisih Kas)** | `uang fisik dihitung − uang yang seharusnya ada`. Negatif = kurang, positif = lebih. Keduanya sama-sama perlu diinvestigasi. |
| **Petty Cash** | Kas kecil keluar/masuk di luar penjualan (mis. beli es batu darurat). Memengaruhi perhitungan variance. |
| **Stock Opname** | Penghitungan fisik stok untuk dicocokkan dengan catatan sistem, lalu disesuaikan. |
| **Drawer Kick** | Membuka laci uang tanpa ada transaksi. Sinyal fraud klasik — selalu masuk audit log. |
| **Void** | Pembatalan transaksi *sebelum* selesai/dibayar. Berbeda dari refund. |
| **Refund** | Pengembalian uang *setelah* transaksi selesai. Selalu butuh persetujuan manager. |
| **QRIS** | Standar kode QR pembayaran nasional Indonesia. *Dinamis* = nominal sudah tertanam di kode. |
| **Settlement** | Saat uang dari gateway pembayaran benar-benar masuk ke rekening merchant, biasanya T+1 — bukan saat status transaksi menjadi `paid`. |
| **ULID** | ID 26 karakter yang terurut secara waktu. Dipakai agar klien offline bisa membuat ID sendiri tanpa risiko tabrakan. |
| **Idempotency Key** | Header yang menjamin kirim-ulang request yang sama tidak membuat transaksi ganda. |
| **Offline-First** | Perangkat kasir adalah sumber kebenaran sementara; server melakukan rekonsiliasi belakangan. Bukan sekadar "punya mode offline". |
| **FIFO Batch Sync** | Antrean transaksi lokal dikirim berurutan sesuai waktu pembuatan, bukan paralel. |
| **Data Bleed** | Kebocoran data satu tenant ke tenant lain. Kegagalan paling fatal di sistem multi-tenant. |
| **Mochi Spring** | Kurva animasi khas `cubic-bezier(0.34, 1.56, 0.64, 1)` yang memberi efek membal. |
| **Zero Visual Fatigue** | Prinsip desain: tanpa `#000000`, kontras ≥7:1, untuk kasir yang menatap layar berjam-jam. |
