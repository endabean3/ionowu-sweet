# Rilis ke Google Play

> **Status:** 🟡 Draft · **Prioritas:** 🟠 P1
>
> **Belum pernah dijalankan sampai selesai.** Konfigurasi penandatanganan di
> `android/app/build.gradle` sudah ada tetapi **belum pernah dikompilasi**: Mac
> pengembang sengaja tidak punya JDK ([ADR-0010](../10-architecture/adr/0010-capacitor-untuk-play-store-dan-printer-bluetooth.md)
> §Konsekuensi), dan keystore rilisnya belum dibuat. Anggap dokumen ini sebagai
> rencana yang harus diverifikasi pada percobaan pertama, bukan prosedur yang
> sudah terbukti.

---

## 0. Yang sudah siap dan yang belum

| Butir | Status |
|---|---|
| Aplikasi Android (Capacitor, `id.ionowu.sweet`) | ✅ ada, APK debug pernah jadi |
| Build APK debug di CI (`apk-debug.yml`) | ✅ ada |
| Konfigurasi penandatanganan rilis | 🟡 ditulis, **belum teruji** |
| Target `make aab` | 🟡 ditulis, **belum teruji** |
| **Keystore rilis** | ❌ belum ada — hanya pemilik yang boleh membuatnya |
| **Akun Play Console** | ❌ belum ada |
| **Kebijakan privasi (URL publik)** | ❌ belum ada — wajib bagi aplikasi yang memproses data pribadi |
| Formulir Data Safety | ❌ belum diisi |

> Tiga baris ❌ terakhir **bukan pekerjaan teknis**. Tanpa ketiganya, aplikasi
> tidak bisa diterbitkan sebagus apa pun kodenya. Kewajiban PDP sebagai pemroses
> data melekat pada kita meski legalitas usaha ada di pemilik (CLAUDE.md §7).

---

## 1. Membuat keystore rilis — **dikerjakan pemilik**

Jalankan di mesin pemilik, bukan di CI dan bukan oleh siapa pun selain pemilik:

```bash
keytool -genkeypair -v \
  -keystore ionowu-sweet-release.jks \
  -keyalg RSA -keysize 4096 -validity 10000 \
  -alias ionowu-sweet
```

`keytool` akan meminta kata sandi dan identitas. Simpan kata sandinya di
pengelola kata sandi.

> ⚠️ **Keystore ini tidak tergantikan.** Google Play mengikat identitas
> aplikasi pada tanda tangannya. Kalau berkas atau kata sandinya hilang, tidak
> ada seorang pun — termasuk Google — yang bisa memulihkannya, dan aplikasi
> `id.ionowu.sweet` tidak akan pernah bisa diperbarui lagi. Cadangkan ke
> penyimpanan terenkripsi **di luar** laptop kerja.
>
> Mendaftarkan *Play App Signing* saat unggah pertama memberi jaring pengaman
> untuk kunci penandatangan aplikasi, tetapi **kunci upload** tetap tanggung
> jawab pemilik.

---

## 2. Memberi tahu Gradle letak keystore

Buat `apps/web/android/keystore.properties` — berkas ini **di-gitignore** dan
tidak boleh di-commit:

```properties
storeFile=/jalur/absolut/ke/ionowu-sweet-release.jks
storePassword=…
keyAlias=ionowu-sweet
keyPassword=…
```

Alternatif untuk CI: isi empat environment variable `ANDROID_KEYSTORE_FILE`,
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
Keduanya dibaca `app/build.gradle`; berkas menang atas environment.

Bila keempatnya tidak ada, build rilis **tetap jalan** tetapi menghasilkan
artefak tanpa tanda tangan — dan Play Console akan menolaknya saat diunggah.

---

## 3. Membangun AAB

Play Store menerima **AAB** (`.aab`), bukan APK.

```bash
make aab API_URL=https://api.sweet.ionowu.com
```

`API_URL` ter-*bake* ke bundle saat build; salah isi berarti aplikasi terpasang
normal lalu gagal saat kasir memanggil API ([GO-LIVE](./GO-LIVE.md) §2.G).

Hasil: `apps/web/android/app/build/outputs/bundle/release/app-release.aab`.

Verifikasi tanda tangannya **sebelum** mengunggah:

```bash
jarsigner -verify -verbose -certs apps/web/android/app/build/outputs/bundle/release/app-release.aab
```

Setiap rilis berikutnya wajib menaikkan `versionCode`:

```bash
ANDROID_VERSION_CODE=2 ANDROID_VERSION_NAME=1.0.1 make aab API_URL=…
```

---

## 4. Izin yang akan ditanyakan Play Console

| Izin | Dipakai untuk | Catatan |
|---|---|---|
| `INTERNET` | Sinkronisasi ke pos-engine | Izin normal |
| `BLUETOOTH_CONNECT` | Cetak struk ke printer termal (ADR-0010) | Android 12+; hanya ke perangkat yang sudah dipasangkan — **tidak** ada pemindaian, jadi tidak ada izin lokasi |
| `BLUETOOTH` (maxSdkVersion 30) | Sama, untuk Android 11 ke bawah | Izin saat instal |

Aplikasi ini **tidak** memakai izin lokasi, kamera, kontak, maupun penyimpanan
eksternal. Itu menyederhanakan formulir Data Safety, tetapi formulirnya tetap
harus diisi jujur: aplikasi menyimpan data transaksi dan identitas kasir.

---

## 5. Yang masih harus diputuskan

* Nama aplikasi di Play Store, ikon, tangkapan layar, dan deskripsi
* Apakah rilis pertama lewat jalur **internal testing** dulu (disarankan) atau
  langsung produksi
* URL kebijakan privasi — memblokir penerbitan
* Apakah `apk-debug.yml` diperluas menjadi build AAB bertanda tangan di CI;
  bila ya, keystore masuk sebagai GitHub Secret berisi base64, dan itu keputusan
  keamanan tersendiri ([SECURITY-PIPELINE](../40-security/SECURITY-PIPELINE.md) §3)
