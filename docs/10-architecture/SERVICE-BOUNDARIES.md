# Batas Layanan — Aturan Pembagian Go / TypeScript / Python

> **Status:** 🟡 Draft
> **Urutan baca:** dokumen **ke-2**. Sebelumnya: [FDR.md](./FDR.md)

---

## 1. Masalah yang Diselesaikan Dokumen Ini

[ADR-0001](./adr/0001-hybrid-go-ts-docker-architecture.md) memutuskan **memakai tiga bahasa**.
[FDR.md](./FDR.md) §1 menggambar **pembagian saat ini**. Tidak ada yang menjawab pertanyaan
yang akan muncul setiap minggu selama pengembangan:

> "Fitur baru ini ditaruh di Go atau di TypeScript?"

Tanpa aturan tertulis, jawabannya menjadi "di tempat yang paling cepat dikerjakan hari ini".
Enam bulan kemudian, logika transaksi tersebar di dua bahasa dan pembagian yang dirancang
di ADR-0001 kehilangan maknanya.

---

## 2. Aturan Keputusan

Jalankan berurutan. Berhenti di pertanyaan pertama yang dijawab "ya".

```
1. Apakah kode ini berjalan di jalur checkout kasir?
   └─ YA → GO. Tanpa pengecualian.

2. Apakah kode ini mengubah stok atau uang?
   └─ YA → GO.

3. Apakah kegagalannya boleh tidak disadari pengguna?
   └─ YA → PYTHON (worker asinkron).

4. Apakah butuh model statistik / ML?
   └─ YA → PYTHON.

5. Sisanya → TYPESCRIPT.
```

### Kenapa urutannya begitu

Pertanyaan 1 dan 2 mendahului yang lain karena **kesalahan di sana paling mahal**. Uang yang
salah hitung merusak kepercayaan yang tidak bisa dipulihkan dengan patch. Go dipilih di sana
bukan karena lebih cepat, melainkan karena target `<5ms` menuntut perilaku memori yang dapat
diprediksi dan penguncian yang eksplisit.

TypeScript berada di posisi terakhir sebagai **default**, bukan sebagai pilihan kelas dua.
Sebagian besar kode memang seharusnya ada di sana — dasbor, admin, impor, notifikasi.

---

## 3. Pembagian Tanggung Jawab

| | 👑 Go (pos-engine) | 🔷 TypeScript (web-app) | 🐍 Python (worker) |
|---|---|---|---|
| **Sifat** | Panas, kritis, sinkron | Interaktif, boleh lambat | Latar belakang, boleh gagal |
| **Anggaran latensi** | <5ms p99 | <500ms | Menit sampai jam |
| **Bila mati** | 🔴 Toko berhenti berjualan | 🟠 Pemilik kehilangan dasbor | 🟢 Tidak ada yang menyadari |
| Checkout & pembayaran | ✅ | ❌ | ❌ |
| Pemotongan stok | ✅ | ❌ | ❌ |
| Ingest sinkronisasi offline | ✅ | ❌ | ❌ |
| Webhook QRIS | ✅ | ❌ | ❌ |
| Autentikasi & terbit token | ✅ | ❌ | ❌ |
| Audit log (tulis) | ✅ | ⚠️ hanya aksinya sendiri | ❌ |
| Dasbor pemilik | ❌ | ✅ | ❌ |
| Manajemen produk & pengguna | ❌ | ✅ | ❌ |
| Impor massal | ❌ | ✅ (job) | ❌ |
| Notifikasi WhatsApp | ❌ | ✅ | ❌ |
| Penagihan & paket | ❌ | ✅ | ❌ |
| Prediksi restock | ❌ | ❌ | ✅ |
| **Segmentasi pelanggan (RFM)** | ❌ | ❌ | ✅ |
| **Agregasi BI semalam** | ❌ | ❌ | ✅ |
| **CRUD data pelanggan** | ⚠️ Saat checkout | ✅ Dasbor | ❌ |
| Analisis keranjang | ❌ | ❌ | ✅ |

---

## 4. Aturan yang Tidak Bisa Ditawar

1. **Go tidak pernah memanggil TypeScript atau Python secara sinkron.**
   Melakukannya berarti mengikat latensi jalur uang pada ketersediaan layanan yang boleh mati.
   Komunikasi keluar dari Go hanya lewat event — lihat [EVENT-ARCHITECTURE.md](./EVENT-ARCHITECTURE.md).

2. **TypeScript tidak pernah menulis ke tabel transaksional.**
   `sales_transactions`, `sales_items`, `payments`, `stock_events` hanya boleh ditulis Go.
   TypeScript membacanya untuk pelaporan. Dua penulis di jalur yang sama menghapus jaminan
   penguncian stok yang dijanjikan [PRD](../00-product/PRD-01-POS-INTI.md) FR-43.

3. **Python hanya membaca, kecuali ke tabelnya sendiri.**
   Worker menulis ke `restock_predictions`, `customer_segments`, `daily_outlet_summary`, dan
   `product_performance_summary` — **tidak pernah** ke `sales_transactions`, `payments`,
   atau `customers`. Segmentasi menulis segmen, bukan mengubah data pelanggan.

4. **Logika bisnis tidak diduplikasi antar-bahasa.**
   Perhitungan pajak dan diskon (FR-25) hanya ada di Go. Bila TypeScript perlu menampilkan
   perhitungan yang sama, ia memanggil API — tidak menulis ulang rumusnya.

> **Aturan 4 punya pengecualian yang tidak bisa dihindari:** PWA harus menghitung total
> **saat offline**, sehingga rumus yang sama mau tidak mau ada di klien. Duplikasi ini
> disengaja dan berbahaya — bila kedua sisi berbeda hasil, struk pelanggan tidak akan cocok
> dengan catatan server. **Harus ada uji kontrak yang menjalankan kasus yang sama di kedua
> implementasi.** Lihat [60-quality/TESTING-STRATEGY.md](../60-quality/TESTING-STRATEGY.md).

---

## 5. Biaya yang Kami Terima

Pembagian tiga bahasa bukan pilihan gratis. Biaya yang harus diakui terbuka:

| Biaya | Wujud nyata |
|---|---|
| **Tiga toolchain** | Tiga cara build, tiga manajer paket, tiga cara uji |
| **Rekrutmen lebih sempit** | Butuh orang yang nyaman minimal di dua dari tiga |
| **Duplikasi rumus (aturan 4)** | Perhitungan total ada di Go dan di klien TS |
| **Debugging lintas layanan** | Satu transaksi bisa menyentuh tiga proses |
| **Beban kognitif** | Setiap fitur baru butuh keputusan penempatan |

**Kapan pembagian ini harus ditinjau ulang:** bila tim menghabiskan lebih banyak waktu
memindahkan data antar-layanan daripada menulis fitur, atau bila `web-app` ternyata tidak
pernah menjadi hambatan yang dikhawatirkan — dalam kasus itu, menggabungkan TS ke dalam Go
lebih murah daripada memelihara dua basis kode.

---

## 6. Bila Aturan Terasa Salah

Jangan diam-diam melanggarnya. Tulis ADR baru memakai
[adr/TEMPLATE.md](./adr/TEMPLATE.md) yang menjelaskan kenapa batas ini tidak lagi cocok.
Aturan yang dilanggar diam-diam akan tetap tertulis di sini dan menyesatkan orang berikutnya.
