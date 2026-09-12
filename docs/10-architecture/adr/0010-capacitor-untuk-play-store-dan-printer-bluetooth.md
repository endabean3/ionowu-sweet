# ADR-0010: Capacitor membungkus PWA, bukan menulis ulang dengan React Native

| Metadata | Nilai |
|---|---|
| **Status** | Diterima |
| **Tanggal** | 2026-09-12 |
| **Pengambil Keputusan** | Pemilik produk |
| **Dokumen Acuan** | [TECH-STACK](../TECH-STACK.md) §4 · [CLAUDE.md](../../../CLAUDE.md) §4, §6.2 · [DOCKER](../../50-operations/DOCKER.md) §2 |

## Konteks

Dua kebutuhan muncul dari sisi client, keduanya tidak bisa dipenuhi PWA murni:

1. **Harus ada di Play Store.** Instruksi "buka tautan lalu Add to Home Screen"
   terlalu asing untuk pemilik warung, dan client meminta aplikasinya bisa
   dicari seperti aplikasi lain.
2. **Printer termal Bluetooth (ESC/POS).** Struk saat ini dicetak lewat
   `window.print()` + `@media print`, yang menjangkau printer sistem dan
   "Simpan sebagai PDF". Itu cukup untuk warung tanpa printer, tetapi tidak
   bisa bicara langsung ke printer termal Bluetooth murah yang paling umum
   dipakai. Web Bluetooth tidak tersedia di Safari/iOS dan terbatas di Android.

Usulan awal adalah **menulis ulang dengan React Native**. Pengukuran pada
kode yang ada (12 September 2026) menunjukkan ongkosnya:

| Bagian | Baris | Nasib bila pindah RN |
|---|---:|---|
| Komponen `.tsx` (DOM + Tailwind) | 2.860 | ditulis ulang total |
| Sisa frontend (Dexie, Serwist, sync engine) | ~580 | ditulis ulang |
| Logika murni TS (uang, katalog jenis usaha) | 277 | selamat |

Sekitar **92% frontend** hilang, termasuk antrean offline berbasis Dexie,
service worker Serwist, cetak struk, dan 8 uji e2e Playwright yang baru saja
terbukti hijau. Backend Go, migrasi SQL, dan `openapi.yaml` tidak terpengaruh
oleh pilihan mana pun.

## Alternatif yang Dipertimbangkan

| Opsi | Kelebihan | Kekurangan | Alasan ditolak |
|---|---|---|---|
| **A. Tetap PWA murni** | Tidak ada pekerjaan tambahan; update instan tanpa toko | Tidak ada di Play Store; tidak bisa ESC/POS Bluetooth | Tidak memenuhi dua kebutuhan client |
| **B. Tulis ulang React Native** | Rasa native penuh; akses perangkat luas | ±92% frontend dibuang; offline engine, cetak struk, dan uji e2e ditulis ulang; iOS butuh Mac + akun $99/thn; update harus lewat review toko | Ongkosnya berminggu-minggu untuk dua kebutuhan yang bisa dipenuhi tanpa menulis ulang apa pun |
| **C. TWA (Trusted Web Activity)** | Paling ringan untuk masuk Play Store | Hanya menyelesaikan Play Store; akses Bluetooth tetap terbatas Web Bluetooth | Tidak menyelesaikan kebutuhan printer |
| **D. Capacitor** | Kode web dipakai 100%; plugin memberi Bluetooth native; bisa masuk Play Store; sudah dipakai tim di proyek lain | Perlu `output: "export"` berdampingan dengan `standalone`; menambah folder `android/`; rilis tetap tunduk review toko | — |

## Keputusan

Kami memilih **Capacitor (opsi D)** karena ia menutup kedua kebutuhan tanpa
membuang satu baris pun kode yang sudah terbukti jalan — termasuk janji
offline-first yang baru berhasil diverifikasi end-to-end.

PWA **tetap menjadi target utama**. APK adalah pembungkus distribusi, bukan
pengganti: keduanya membangun dari `apps/web` yang sama.

## Konsekuensi

**Positif:**
- Satu basis kode untuk web, APK, dan (nanti) iOS
- Antrean offline Dexie, Serwist, cetak struk, dan uji e2e tetap berlaku
- Jalur ke ESC/POS Bluetooth terbuka lewat plugin, tanpa menyentuh logika kasir

**Negatif / biaya yang kami terima:**
- `next.config.ts` kini punya dua mode keluaran (`export` untuk Capacitor,
  `standalone` untuk image Docker). Keduanya tidak bisa aktif bersamaan;
  mode dipilih lewat `BUILD_TARGET=capacitor`
- Rilis APK tunduk pada review Play Store — update mendesak tidak lagi instan
  seperti PWA (jalur PWA tetap ada sebagai katup darurat)
- Toolchain Android (JDK + SDK) hidup di host, menyimpang dari prinsip
  "seluruh toolchain di Dev Container" (CLAUDE.md §4). Android SDK tidak
  praktis dimasukkan ke dev container, dan ini dicatat sebagai penyimpangan
  sadar — pola yang sama dengan ADR-0008
- `NEXT_PUBLIC_API_URL` menjadi kritis: nilainya ter-*bake* saat build, dan
  APK tidak punya `localhost` yang berarti apa-apa

**Yang akan kami tinjau ulang bila:**
- Kebutuhan perangkat melampaui yang bisa dijangkau plugin Capacitor
  (mis. integrasi POS hardware yang dalam), atau
- Performa WebView pada perangkat kelas bawah terbukti menghambat jalur
  transaksi — diukur, bukan dirasakan
