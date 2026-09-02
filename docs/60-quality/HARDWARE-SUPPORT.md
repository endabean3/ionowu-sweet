# Dukungan Perangkat Keras

> **Status:** 🟡 Draft · **Prioritas:** 🟡 P2

---

## 1. Ruang Lingkup

[PRD](../00-product/PRD-01-POS-INTI.md) FR-24 menjanjikan pencetakan struk thermal via
Bluetooth/USB (58mm & 80mm), dan FR-12 menjanjikan pemindaian barcode. Keduanya bergantung
pada perangkat keras yang tidak kami kendalikan.

**Risiko utama:** PWA berjalan di dalam browser, dan akses browser ke printer serta perangkat
Bluetooth sangat terbatas dan berbeda-beda antar-platform. Ini adalah tempat janji offline-first
paling mungkin bertemu kenyataan yang keras.

---

## 2. Perangkat Kasir

| Kelas | Spesifikasi | Dukungan |
|---|---|---|
| Acuan | Android 10+, RAM 3GB, Chrome | ✅ Wajib mulus |
| Tablet | Android 10+, layar 10" | ✅ |
| Desktop | Chrome/Edge | ✅ |
| iOS/iPadOS | Safari 16+ | ⚠️ **Lihat §5** |
| Android <10 | | ❌ Tidak didukung |

---

## 3. Scanner Barcode

| Jenis | Cara kerja | Dukungan |
|---|---|---|
| **USB HID** | Terbaca sebagai keyboard | ✅ Paling andal — **rekomendasikan ini** |
| **Bluetooth HID** | Sama | ✅ |
| Kamera perangkat | `BarcodeDetector` API | ⚠️ Lebih lambat; cadangan |

Scanner HID adalah pilihan terbaik justru karena ia menyamar sebagai keyboard — tidak butuh
izin browser, tidak butuh driver, dan bekerja identik di semua platform.

**Implikasi:** input barcode harus ditangkap sebagai rentetan ketikan cepat diakhiri `Enter`,
dan **tidak boleh** mengharuskan sebuah kolom input sedang terfokus. Kasir tidak akan mengklik
kolom sebelum memindai.

---

## 4. Printer Thermal

| Jalur | Kelayakan |
|---|---|
| **Web Bluetooth** | ⚠️ Chrome Android/desktop saja; **tidak ada di iOS** |
| **WebUSB** | ⚠️ Chrome saja |
| **Aplikasi jembatan** | ✅ Paling andal lintas platform |
| **Print OS biasa** | ✅ Selalu bisa, tetapi kualitas struk thermal buruk |
| **E-receipt WhatsApp** | ✅ **Selalu tersedia** — cadangan universal |

Perintah cetak memakai ESC/POS. Perlu profil per merek — verifikasi minimal untuk merek yang
umum di pasar Indonesia sebelum menjanjikan dukungan.

> **Keputusan penting:** e-receipt WhatsApp harus diperlakukan sebagai **jalur setara**,
> bukan sekadar cadangan. Ia bekerja di setiap platform tanpa perangkat keras apa pun —
> dan menghapus seluruh kelas masalah dukungan.

---

## 5. ⚠️ Keterbatasan iOS

Safari **tidak mendukung** Web Bluetooth maupun WebUSB. Artinya, di iPad:

* Printer thermal tidak dapat dikendalikan langsung dari PWA
* Hanya tersedia print sistem atau e-receipt WhatsApp

Ini memaksa satu keputusan produk yang harus diambil sadar, bukan ditemukan belakangan:

| Pilihan | Konsekuensi |
|---|---|
| **Android saja untuk kasir** | Sederhana; batasi ekspektasi sejak pemasaran |
| Aplikasi jembatan iOS | Menambah aplikasi native — bertentangan dengan Non-Goals |
| iOS tanpa printer thermal | iPad hanya dengan e-receipt |

**Rekomendasi:** nyatakan **Android sebagai platform kasir resmi**, iOS sebagai pendukung
untuk dasbor pemilik. Ini sejalan dengan persona Hendra yang memantau dari ponsel, sementara
Sari bekerja di perangkat kasir.

---

## 6. Yang Harus Dilakukan

- [ ] Uji minimal 3 merek printer thermal yang umum di Indonesia
- [ ] Uji minimal 2 scanner USB HID
- [ ] Putuskan posisi resmi soal iOS (§5)
- [ ] Dokumentasikan perangkat yang direkomendasikan untuk tenant baru
- [ ] Tentukan perilaku saat printer tidak tersedia — **transaksi tidak boleh gagal
      hanya karena struk tidak tercetak**
