# PRD-01: Point of Sale (POS) Inti & Platform Intelijen UMKM

> **Produk:** ionowu sweet  
> **Versi Dokumen:** 1.0 (Baseline Resmi)  
> **Tanggal Rilis:** 21 Agustus 2026  
> **Target Pengguna:** UMKM Ritel, Kafe Artisanal, Bakery, Stand Minuman di Indonesia  
> **Status:** Disetujui (Ready for Engineering)

---

## 1. Visi Produk & Ringkasan Eksekutif

**ionowu sweet** adalah sistem kasir (Point of Sale) modern berbasis Progressive Web App (PWA) yang menggabungkan:
1. **Kecepatan Transaksi Roket (<50ms UI / <5ms Backend):** Kasir dapat memproses transaksi secepat kilat dengan keyboard-first shortcuts atau barcode scanning instan.
2. **Kenyamanan Visual Maksimal (*Zero Visual Fatigue*):** Menghilangkan warna hitam pekat `#000000` dan tampilan koran yang kaku. Menggantinya dengan estetika *Sweet Creamy Spatial Luxe* (Oat Milk `#FAF6F0` & Warm Cocoa `#2D231E`) serta audio haptik lembut berlatensi 0ms.
3. **100% Offline-First Mutlak:** Toko tetap bisa berjualan, mencatat pesanan, dan mencetak struk thermal meski jaringan internet padam total.
4. **1-Tap Actionable Intelligence:** Rekomendasi stok menipis langsung terhubung dengan pesan pemesanan otomatis ke distributor via WhatsApp.

---

## 2. Persona Pengguna

| Persona | Peran | Masalah Utama yang Dihadapi | Solusi ionowu sweet |
|---|---|---|---|
| 👩‍💼 **Sari (Kasir / Barista)** | Input ratusan pesanan per shift, sering berdiri di bawah terik/lampu terang. | Mata pedih akibat layar kasir silau; antrean macet jika sistem kasir lambat (*lag*). | Palet Oat Milk teduh, tombol mochi membal 48–64px, keyboard shortcuts, dan suara pop air empuk. |
| 🧑‍🍳 **Budi (Manager Toko)** | Mengatur stok harian, buka/tutup shift kasir, hitung rekonsiliasi uang fisik. | Selisih kas di akhir shift; bahan baku sering habis mendadak tanpa peringatan. | Manajemen shift otomatis (hitung selisih kas), alert stok menipis otomatis. |
| 👨‍💼 **Hendra (Owner UMKM)** | Memantau omzet harian dari smartphone, rekap laporan, bayar supplier. | Data lambat masuk, kesulitan rekap multi-outlet, aplikasi kasir konvensional mahal. | Real-time Owner Dashboard, tombol 1-klik kirim WA ke supplier, paket hemat multi-outlet. |

---

## 3. Kebutuhan Fungsional (*Functional Requirements*)

### A. Autentikasi & Multi-Tenant (FR-01 s.d. FR-05)
* **FR-01 (Registrasi Tenant):** Pendaftaran akun baru langsung membuat `organization`, `outlet` pertama, dan akun `owner`.
* **FR-02 (Login Cepat Kasir):** Login kasir mendukung sistem PIN 4–6 digit untuk pergantian shift cepat antar-karyawan.
* **FR-03 (Role-Based Access Control / RBAC):** ⚠️ *Diperluas 21 Agu 2026 menjadi tujuh peran
  dalam tiga kelas principal — lihat [RBAC-MODEL.md](../40-security/RBAC-MODEL.md). Tiga peran
  di bawah adalah baseline Fase 0.*
  * `Owner`: Akses penuh ke omzet, laba, pengaturan harga, dan cabang.
  * `Manager`: Akses katalog produk, stok, laporan shift, dan audit kas.
  * `Cashier`: Akses terbatas hanya ke layar transaksi kasir, buka/tutup shift miliknya.
* **FR-04 (Multi-Outlet Support):** Satu akun organisasi dapat mengelola banyak cabang toko dengan stok terpisah.
* **FR-05 (Session & Token Refresh):** JWT Access Token (15 menit) + Refresh Token (30 hari) dengan auto-renew transparan di background.

---

### B. Katalog Produk & Varian (FR-10 s.d. FR-15)
* **FR-10 (Manajemen Produk):** Tambah, ubah, dan arsip produk lengkap dengan kategori, foto SVG/3D, dan deskripsi.
* **FR-11 (Varian & Opsi):** Setiap produk dapat memiliki banyak varian (misal: *Size Regular/Large*, *Hot/Ice*, *Less Sugar*).
* **FR-12 (Barcode & SKU Eksklusif):** Setiap varian memiliki barcode unik yang dapat langsung dipindai scanner barcode USB/Bluetooth.
* **FR-13 (Bulk Import Excel/CSV):** Import ribuan SKU sekaligus secara asinkron (*job-based*).
* **FR-14 (Pengingat Bahan Menipis):** Indikator stok berbasis warna (*Matcha = Aman, Custard = Sedang, Strawberry = Kritis*).

---

### C. Alur Transaksi Kasir POS (FR-20 s.d. FR-29)
* **FR-20 (Scan-to-Cart 0ms):** Pemindaian barcode langsung memasukkan barang ke keranjang tanpa jeda konfirmasi modal.
* **FR-21 (Keyboard-First Navigation):**
  * `Enter`: Lanjut ke pembayaran.
  * `Esc`: Batalkan pilihan / kosongkan keranjang.
  * `F1 - F4`: Tombol cepat metode pembayaran (Tunai, QRIS, Transfer, Debit).
  * `Space`: Buka pencarian cepat produk (*Command Palette*).
* **FR-22 (Split & Multi-Payment):** Mendukung pembayaran gabungan (misal: Rp 20.000 Tunai + Rp 30.000 QRIS).
* **FR-23 (Dinamis QRIS Instan):** Generate kode QRIS dinamis langsung di layar dengan nominal presisi.
* **FR-24 (Pencetakan Struk Thermal):** Cetak struk via Bluetooth/USB Thermal Printer (58mm & 80mm) dan kirim e-receipt via WhatsApp.
* **FR-25 (Diskon & Pajak Otomatis):** Perhitungan diskon persen/nominal dan PPN otomatis dengan format angka tabular rapi.

---

### D. Manajemen Shift & Kasir (FR-30 s.d. FR-34)
* **FR-30 (Buka Shift):** Kasir wajib menginput saldo awal kas laci sebelum mulai transaksi.
* **FR-31 (Pencatatan Kas Masuk/Keluar):** Catat pengeluaran kas kecil (*petty cash*, misal: beli es batu darurat).
* **FR-32 (Tutup Shift & Rekonsiliasi):** Kasir menghitung uang fisik di laci; sistem membandingkan dengan total tercatat dan mencetak struk ringkasan shift (*Z-Report*).

---

### E. Sinkronisasi Data Offline-First (FR-40 s.d. FR-45)
* **FR-40 (Penyimpanan Lokal IndexedDB):** Seluruh katalog produk dan antrean transaksi disimpan di database browser kasir via Dexie.js.
* **FR-41 (Operasional 100% Offline):** Saat internet padam, transaksi checkout, kalkulasi total, dan cetak struk tetap berjalan normal.
* **FR-42 (Auto-Sync saat Online):** Begitu sinyal pulih, seluruh antrean transaksi lokal otomatis dikirim ke backend Go secara berurutan (*FIFO batch sync*).
* **FR-43 (Resolusi Konflik Stok):** Backend Go melakukan rekonsiliasi pemotongan stok dengan *atomic in-memory lock* untuk mencegah stok minus.

---

### F. Actionable AI & WhatsApp Automation (FR-50 s.d. FR-55)
* **FR-50 (1-Click Restock Order):** Menghasilkan pesan WhatsApp berformat rapi untuk distributor susu/kopi dalam 1 sentuhan tombol.
* **FR-51 (Laporan Omzet Harian ke Owner):** Ringkasan penjualan otomatis terkirim ke WhatsApp nomor owner setiap toko tutup shift.

---

## 4. Kebutuhan Non-Fungsional (*Non-Functional Requirements*)

| Parameter | Target Standar | Metode Verifikasi |
|---|---|---|
| **Latensi UI Kasir** | `< 50 milidetik` di smartphone RAM 3GB | Web Vitals INP (Interaction to Next Paint) |
| **Latensi Backend API** | `< 5 milidetik` (Core Go checkout) | Benchmark k6 / autocannon |
| **Ketahanan Offline** | Mampu menyimpan hingga `10.000 transaksi` offline | Uji kapasitas IndexedDB Storage |
| **Aksesibilitas Kontras** | Rasio Kontras `≥ 7.0:1` (WCAG AAA) | Audit Kontras (#FAF6F0 vs #2D231E) |
| **Ukuran Image Docker** | `< 25 MB` (Golang Scratch Container) | `docker images` audit |

---

## 5. Referensi Terkait
* **Spesifikasi Teknis FDR:** [FDR.md](../10-architecture/FDR.md)
* **Arsitektur Hybrid ADR-0001:** [adr/0001-hybrid-go-ts-docker-architecture.md](../10-architecture/adr/0001-hybrid-go-ts-docker-architecture.md)
* **Fondasi Desain UI:** [design-system/fondasi-UI-v0.1.md](../70-design-system/fondasi-UI-v0.1.md)
* **Kontrak API:** [api/openapi.yaml](../20-api/openapi.yaml)
