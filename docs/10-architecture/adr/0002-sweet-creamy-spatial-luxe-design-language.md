# ADR-0002: Bahasa Desain "Sweet Creamy Spatial Luxe × Soft Brutalism"

| Parameter | Nilai |
|---|---|
| **Status** | Diterima & Direvisi |
| **Tanggal Revisi** | 21 Agustus 2026 |
| **Pengambil Keputusan** | ionowu.com |
| **Dokumen Acuan** | [fondasi-UI-v0.1.md](../../70-design-system/fondasi-UI-v0.1.md) |
| **Pembaruan dari** | Soft Brutalism Kaku (Revisi total dari pendekatan dogmatis lama) |

---

## 1. Konteks & Evaluasi Kritis

Sistem informasi dan kasir PWA **ionowu** dipakai ratusan kali sehari oleh pemilik toko dan kasir di Indonesia. Evaluasi terhadap bahasa desain lama (*Soft Brutalism kaku / ala koran jurnalistik*) menunjukkan beberapa kelemahan nyata:

1. **Kekakuan Hitam Pekat (`#000000`):** Garis hitam mati 3-4px dan bayangan kaku terasa seperti software era 90-an yang kasar dan melelahkan mata setelah 30 menit pemakaian.
2. **Kekakuan Jurnalistik:** Diksi formal dan garis ganda broadsheet menciptakan ketegangan mental yang tidak perlu di lingkungan toko/kafe yang santai.
3. **Mitos "Anti-Glassmorphism":** Anggapan lama bahwa *semua efek kaca/blur itu merusak performa* adalah keliru. Dengan teknik **Milky Glass semi-solid (`rgba(255,255,255,0.88)`)**, kita mendapatkan kemewahan spasial modern sekelas Apple tanpa membebani GPU perangkat Android 9+ maupun iOS 16+.

---

## 2. Keputusan Desain Resmi: "Sweet Creamy Spatial Luxe"

Kami mengadopsi bahasa desain **Sweet Creamy Spatial Luxe × Soft Brutalism**, yang memadukan kehangatan rasa kafe artisanal, ketegasan garis kontur, dan kelembutan fisika mochi:

### A. Aturan Nol Hitam Murni (*Zero Pure Black Rule*)
* ❌ **Dilarang:** Menggunakan `#000000` pada teks, garis border, ataupun bayangan.
* ✅ **Wajib:** Menggunakan **Warm Dark Cocoa (`#2D231E`)**. Warna cokelat gelap ini memberikan rasio kontras tinggi (7.5:1 / lolos WCAG AAA) namun tetap hangat dan bersahabat.

### B. Kanvas "Warm Oat Milk" & "Milky Glass"
* Latar belakang utama menggunakan warna **Warm Oat Milk (`#FAF6F0`)** yang mencegah kelelahan mata (*zero visual fatigue*).
* Kartu menggunakan permukaan **Milky Glass (`rgba(255,255,255,0.88)`)** dengan border 2.5px Cocoa dan kilau specular di tepi atas.

### C. Palet Rasa Dessert (*Sweet Semantic Tokens*)
* 🍓 **Strawberry Foam (`#FFA4B6`):** Tombol aksi utama & aksen brand ionowu.
* 🍵 **Matcha Pistachio (`#A2E8CE`):** Status sukses & data pertumbuhan positif.
* 🧈 **Vanilla Custard (`#FFEAA7`):** Highlight informasi & kotak keranjang kasir.
* ☁️ **Blue Cotton Candy (`#A7D8F8`):** Aksi sekunder & filter data.
* 🍠 **Sweet Taro (`#DDD0FA`):** Indikator offline-first yang menenangkan.

### D. Tipografi "Fluffy-Crisp Pairing"
* **Judul & Branding:** **Fraunces** (`font-variation-settings: 'SOFT' 100`) dengan ujung membulat empuk, dipadu **Fraunces Italic** untuk kata aksen.
* **Teks UI:** **Plus Jakarta Sans** (bersih, modern, tinggi-x optimal).
* **Angka Tabular:** **Space Mono / Geist Mono** (angka tidak bergeser saat data ter-refresh).

### E. Geometri "Mochi Squircle" & Tombol Membal
* Kartu memiliki radius `30px - 34px`.
* Tombol berbentuk *Pill Shape* membal (`border-radius: 999px`) dengan kurva transisi *Spring Physics* `cubic-bezier(0.34, 1.56, 0.64, 1)`.

### F. Umpan Balik Audio Haptik (Web Audio API)
* Setiap tap tombol kasir memicu suara sintetis empuk (*soft water pop* `460Hz -> 160Hz`) berlatensi 0ms tanpa unduhan file `.mp3`.

---

## 3. Konsekuensi & Keuntungan

### ✅ Keuntungan:
1. **Daya Pikat Visual Luar Biasa (Awwwards / Apple-Tier):** Tampilan produk terlihat seperti aplikasi SaaS bernilai ratusan juta rupiah yang sangat prestisius.
2. **Kenyamanan Kerja Kasir:** Kasir tidak lagi merasakan ketegangan visual akibat silau atau warna hitam-putih yang menusuk mata.
3. **Performa Ringan di HP Entry-Level:** Berjalan lancar 60-120 FPS di Android 9+ dan iOS 16+ karena memanfaatkan akselerasi CSS GPU murni tanpa WebGL berat.

---

## 4. Referensi Terkait
* **Dokumen Fondasi Sistem Desain:** [fondasi-UI-v0.1.md](../../70-design-system/fondasi-UI-v0.1.md)
* **Landing Page Resmi:** [landing-page.html](../../90-prototypes/landing-page.html)
* **Showcase Komponen Interaktif:** [glassbrut-showcase.html](../../90-prototypes/glassbrut-showcase.html)
