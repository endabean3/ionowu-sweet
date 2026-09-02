# Sistem Desain ionowu — MASTER
> **Bahasa Desain:** Sweet Creamy Spatial Luxe × Soft Brutalism  
> **Status:** Baseline Resmi v0.1 (Direvisi 21 Agustus 2026)  
> **Dokumen Detail:** [fondasi-UI-v0.1.md](./fondasi-UI-v0.1.md)

---

## 1. Filosofi Inti: "Zero Visual Fatigue & Warm Craftsmanship"

Sistem desain **ionowu** menolak kekakuan koran jurnalistik dan warna hitam pekat `#000000` yang melelahkan mata. Semua elemen dirancang untuk menciptakan suasana tenang, empuk, dan menyenangkan bagi kasir dan pemilik toko.

### 4 Aturan Emas Desain:
1. **Aturan Nol Hitam Murni (*Zero Pure Black Rule*):** Semua garis border, teks, dan bayangan menggunakan **Warm Dark Cocoa (`#2D231E`)** untuk mode terang (*Oat Milk*), dan `#524036` untuk mode malam (*Sweet Dark Cocoa*).
2. **Geometri Mochi Squircle:** Kartu menggunakan sudut empuk `30px - 34px` dan tombol berbentuk pill `999px` dengan *Mochi Spring Physics*.
3. **Palet Dessert Ramah Mata:** Kanvas *Warm Oat Milk* (`#FAF6F0`) dipadu aksen rasa *Strawberry Foam*, *Matcha Pistachio*, *Vanilla Custard*, dan *Taro Milk*.
4. **Audio Haptik Instan:** Setiap interaksi penting memicu umpan balik suara lembut (*soft water pop* 0ms latensi) via Web Audio API.

---

## 2. Token Warna Global

### A. Mode Terang (*Warm Oat Milk*)
```css
:root {
  --bg-base: #FAF6F0;                 /* Warm Oat Milk */
  --text-main: #2D231E;               /* Warm Dark Cocoa */
  --text-muted: #7A6F68;              /* Soft Ground Coffee */
  --card-bg: rgba(255, 255, 255, 0.88); /* Milky Glass */
  --card-border: #2D231E;             /* 2.5px Cocoa Outline */
  --sweet-strawberry: #FFA4B6;
  --sweet-matcha: #A2E8CE;
  --sweet-custard: #FFEAA7;
  --sweet-sky: #A7D8F8;
  --sweet-taro: #DDD0FA;
  --shadow-hard: 5px 5px 0px #2D231E;
}
```

### B. Mode Malam (*Sweet Dark Cocoa Ganache*)
```css
[data-theme="dark-cocoa"] {
  --bg-base: #1C1512;                 /* Deep Roasted Cocoa */
  --text-main: #FAF6F0;               /* Soft Oat Milk Cream */
  --text-muted: #BFAFA5;              /* Hazelnut Cream */
  --card-bg: rgba(42, 32, 27, 0.86);  /* Dark Cocoa Velvet Glass */
  --card-border: #524036;             /* 2.5px Milk Chocolate */
  --sweet-strawberry: #FF7597;
  --sweet-matcha: #88E2C0;
  --shadow-hard: 5px 5px 0px #0D0907;
}
```

---

## 3. Tipografi
* **Display / Judul:** **Fraunces** (`SOFT: 100`) + **Fraunces Italic** (Gradasi Strawberry)
* **Teks UI & Konten:** **Plus Jakarta Sans** (500–800)
* **Angka & Transaksi:** **Space Mono / Geist Mono** (`tabular-nums`)

---

## 4. Halaman Khusus & Override
* **Kasir / POS:** [pages/kasir.md](./pages/kasir.md) — Mengutamakan kecepatan keyboard-first, scan barcode instan, dan target tombol `48px - 64px`.

---

## 5. Sumber Aset & Referensi
* **Katalog Vektor SVG Resmi:** [../assets/README.md](../80-assets/README.md)
* **Demo Landing Page:** [landing-page.html](../90-prototypes/landing-page.html)
