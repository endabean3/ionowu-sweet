# Fondasi Sistem Desain ionowu — Versi 0.1
> **Gaya Desain:** Sweet Creamy Spatial Luxe × Soft Brutalism  
> **Target Pengalaman:** Zero Visual Fatigue, Super Cepat, Ramah & Menyenangkan  
> **Tanggal Rilis:** 21 Agustus 2026  
> **Status:** Disetujui (Baseline UI v0.1)

---

## 1. Filosofi & Alasan Desain

Desain ini lahir dari evaluasi mendalam terhadap kelemahan sistem kasir konvensional dan estetika visual kaku:

1. **Menolak Kekakuan Jurnalistik:** Elemen koran (garis ganda hitam tebal, ticker berjalan tanpa henti, penomoran hukum `§`, dan diksi birokratis) dihapus total karena menimbulkan ketegangan mental (*cognitive load*) pada kasir yang bekerja berjam-jam.
2. **Aturan Nol Hitam Murni (*Zero Pure Black Rule*):** Tidak ada warna `#000000` atau hitam digital mati di seluruh sistem. Semua garis border, teks, dan bayangan menggunakan **Warm Dark Cocoa (`#2D231E`)** yang memiliki temperatur hangat selaras dengan oat milk, strawberry, dan matcha.
3. **Kenyamanan Mata Maksimal (*Zero Visual Fatigue*):** Mengganti warna putih silau `#FFFFFF` dengan kanvas **Warm Oat Milk (`#FAF6F0`)** yang teduh dan menenangkan retina mata.
4. **Sentuhan "Sweet & Fluffy" (Mochi Squircles):** Menggunakan sudut tumpul empuk (`30px - 34px`) dan garis batas cokelat kakao hangat (`#2D231E`) yang memberi rasa bersahabat, bersih, dan menyenangkan layaknya kafe artisanal Jepang/Seoul.
5. **Kepastian Taktil & Suara (Haptic Feedback):** Setiap interaksi tombol memiliki efek kompresi mekanis (*spring bounce*) dan konfirmasi audio lembut (*soft water pop*) via Web Audio API.

---

## 2. Palet Warna (*Dessert Palette Tokens*)

### A. Latar & Struktur Utama
| Token Semantic | Hex / Nilai | Peran |
|---|---|---|
| `--bg-base` | `#FAF6F0` | Kanvas dasar *Warm Oat Milk* |
| `--card-bg` | `rgba(255, 255, 255, 0.88)` | Permukaan kartu kaca susu (*milky glass*) |
| `--card-border` | `#2D231E` | Garis kontur 2.5px *Warm Dark Cocoa* (bukan hitam mati) |
| `--text-main` | `#2D231E` | Teks utama dengan kontras tajam (7.2:1) |
| `--text-muted` | `#7A6F68` | Teks sekunder / label penjelas |
| `--border-highlight` | `rgba(255, 255, 255, 0.98)` | Kilau specular di tepi atas kartu kaca |

### B. Aksen Rasa Pastel (*Sweet Semantic Accents*)
| Rasa Pastel | Hex | Kegunaan |
|---|---|---|
| 🍓 **Strawberry Foam** | `#FFA4B6` | Aksi utama, CTA, diskon spesial, identitas brand ionowu |
| 🍵 **Matcha Pistachio** | `#A2E8CE` | Status stok aman, transaksi sukses, live status |
| ☁️ **Blue Cotton Candy** | `#A7D8F8` | Tombol sekunder, navigasi simulator, filter |
| 🧈 **Vanilla Custard** | `#FFEAA7` | Tag highlight, kotak keranjang belanja, badge promo |
| 🍠 **Sweet Taro** | `#DDD0FA` | Status offline-first, sinkronisasi data lokal |
| 🍑 **Peach Mochi** | `#FFD5BD` | Peringatan stok sedang, alert santai |

### C. Mode Malam "Sweet Dark Cocoa" (*Zero Pitch-Black Night Mode*)
Bukan hitam mati `#000000` yang dingin, mode malam ionowu menggunakan nuansa **Rich Chocolate Ganache & Roasted Cocoa** yang manis dan empuk di mata:

| Token Semantic | Hex / Nilai (Dark Mode) | Peran |
|---|---|---|
| `--bg-base` | `#1C1512` | Kanvas dasar *Deep Roasted Cocoa Ganache* |
| `--card-bg` | `rgba(42, 32, 27, 0.86)` | Permukaan kartu *Dark Cocoa Velvet Glass* |
| `--card-border` | `#524036` | Garis kontur 2.5px *Warm Milk Chocolate* |
| `--text-main` | `#FAF6F0` | Teks utama *Soft Oat Milk White* (tidak silau) |
| `--text-muted` | `#BFAFA5` | Teks sekunder *Hazelnut Cream* |
| `--sweet-strawberry` | `#FF7597` | Luminous Strawberry Neon Accent |
| `--sweet-matcha` | `#88E2C0` | Soft Matcha Glow |
| `--shadow-hard` | `5px 5px 0px #0D0907` | Bayangan cokelat pekat |

### D. Sistem Bayangan Ganda (*Dual-Layer Shadow*)
```css
/* Hard Cocoa Offset + Fluffy Diffused Pastel Glow */
box-shadow: 
  5px 5px 0px var(--card-border),
  0px 15px 35px var(--sweet-strawberry-glow);
```

---

## 3. Tipografi (*The Fluffy-Crisp Pairing*)

| Peran | Font Family | Konfigurasi Khusus | Alasan |
|---|---|---|---|
| **Display / Judul Utama** | **Fraunces** | `font-variation-settings: 'SOFT' 100, 'WONK' 0;` `font-weight: 800;` | Ujung membulat lembut (*soft-flare terminals*), terasa empuk dan hangat |
| **Aksen Miring Judul** | **Fraunces Italic** | `font-style: italic;` `font-weight: 800;` `SOFT: 100` | Miring anggun yang menyatu mulus tanpa garis runcing yang menusuk |
| **Teks UI & Paragraf** | **Plus Jakarta Sans** | `font-weight: 500 - 700;` `font-size: 14px - 16px;` | Sangat terbaca di layar smartphone kasir |
| **Angka, Harga & SKU** | **Space Mono / Geist Mono** | `font-variant-numeric: tabular-nums;` | Angka sejajar rapi, tidak bergoyang saat data ter-refresh |

---

## 4. Bentuk, Geometri & Komponen

### A. Kartu Kaca Susu (*Milky Glass Card*)
* **Radius:** `30px - 34px` (squircle membal).
* **Border:** `2.5px solid var(--card-border)`.
* **Backdrop Filter:** `blur(20px)`.
* **Specular Rim:** Garis tipis gradasi putih 98% di tepi paling atas kartu.

### B. Tombol Mochi (*Mochi Spring Button*)
* **Bentuk:** *Pill Shape* penuh (`border-radius: 999px`).
* **Interaksi Sentuh:**
  * **Hover:** `transform: translate(-2px, -2px); box-shadow: 6px 6px 0px var(--card-border);`
  * **Active / Press:** `transform: translate(2px, 2px) scale(0.95); box-shadow: 1px 1px 0px var(--card-border);`
  * **Transisi:** `all 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);`

### C. Macaron Menu POS
* Kartu menu berbentuk kotak rounded `22px` dengan ikon besar, label tebal, dan harga berformat mono tabular.

### D. Modal Bottom Sheet (Drawer iOS-Grade)
* Meluncur dari bawah layar dengan kurva inersia `cubic-bezier(0.32, 1, 0.23, 1)`.
* Memiliki *pill handle* abu-abu halus di bagian atas untuk affordance geser.

---

## 5. Audio Haptik (*Web Audio API Synth*)

Sistem tidak memerlukan file `.mp3` eksternal. Semua suara di-generate secara matematis melalui Web Audio API untuk latensi 0ms:

```javascript
// Suara Ketukan Air Empuk (Soft Water Drop Pop) untuk Tap Menu Kasir
function playPopSound() {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(460, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(160, audioCtx.currentTime + 0.08);
  gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.08);
}
```

---

## 6. Prinsip Performa & Operasional Kasir

1. **Offline-First Mutlak:**
   * Jika sinyal toko padam, kasir tetap bisa menginput pesanan dan mencetak struk thermal. Data tersimpan di **IndexedDB lokal** dan otomatis tersinkron saat internet pulih.
2. **60–120 FPS Fluid Motion:**
   * Animasi hanya menggunakan `transform` dan `opacity` (GPU-accelerated), menghindari *layout reflow* yang berat.
3. **1-Tap Actionable AI:**
   * Rekomendasi stok atau promo tidak hanya berupa teks, tetapi langsung menyediakan tombol aksi 1-klik (misal kirim order WhatsApp ke supplier).

---

---

## 7. File Referensi Langsung
* **Landing Page Resmi v0.1:** [landing-page.html](../90-prototypes/landing-page.html)
* **Demo Showcase Interaktif:** [glassbrut-showcase.html](../90-prototypes/glassbrut-showcase.html)

---

## 8. Ekosistem Library & Tech Stack Resmi

Untuk mengimplementasikan desain **Sweet Creamy Spatial Luxe** ke dalam aplikasi nyata (Next.js / Vite React PWA), gunakan kombinasi library standar berikut:

### A. Animasi & Fisika Mikro (*Motion & Gestures*)
| Library | Package | Peran dalam Sistem |
|---|---|---|
| 👑 **Framer Motion** | `framer-motion` | Raja animasi spring physics (`stiffness: 400`, `damping: 25`), morphing layout via `layoutId`, dan gesture drag. |

> **Status implementasi (2026-09-16):** terpasang dan berlaku di seluruh aplikasi, dengan tiga
> batas yang tidak boleh dilonggarkan tanpa alasan baru:
>
> 1. **`LazyMotion features={domAnimation}`** — bukan `domMax`. Mesin *layout animation* tidak
>    ikut dikirim, jadi `layoutId` di baris atas **tidak tersedia**; menghidupkannya berarti
>    menambah bundle di rute yang anggarannya sudah terlampaui.
> 2. **`strict`** — hanya komponen `m.*`. Satu `motion.*` yang lolos menarik seluruh pustaka
>    tanpa error apa pun.
> 3. **Nilai spring hidup di `apps/web/src/lib/motion/tokens.ts`**, bukan disebar per komponen.
>
> Layar kasir punya aturan tambahan: [pages/kasir.md](./pages/kasir.md) §Zona gerak.
| 📱 **Vaul** | `vaul` | Bottom Sheet / Drawer modal dengan elastisitas inersia native iOS & background scale-down. |
| 🔔 **Sonner** | `sonner` | Toast notification mengambang dengan transisi tumpuk (*stacking animation*) yang sangat fluid. |
| ⌨️ **cmdk** | `cmdk` | Command Palette (Spotlight / Raycast) super cepat untuk shortcut keyboard kasir. |

```bash
npm install framer-motion vaul sonner cmdk lucide-react clsx tailwind-merge
```

### B. Ikonografi & Tipografi
* **Ikon:** **`lucide-react`** (Gunakan `strokeWidth={2.25}` atau `2.5` agar serasi dengan ketebalan garis batas cocoa 2.5px).
* **Font Google:**
  * Judul: `Fraunces:opsz,wght,SOFT@9..144,700..800,100`
  * Teks: `Plus Jakarta Sans:wght@500;600;700;800`
  * Angka Tabular: `Space Mono:wght@400;700` atau `Geist Mono`

### C. Penyimpanan Data Offline-First (PWA)
| Library | Package | Peran |
|---|---|---|
| 🗄️ **Dexie.js** / **idb** | `dexie` | Wrapper IndexedDB modern, reaktif, dan sangat cepat untuk menampung transaksi lokal saat internet padam. |
| ⚡ **TanStack Query** | `@tanstack/react-query` | **Cache data BACA saja** (katalog, laporan, dasbor). ⚠️ **BUKAN** untuk antrean tulis transaksi — lihat catatan di bawah. |

> ### ⚠️ Batas Peran Sinkronisasi (keputusan 21 Agustus 2026)
>
> Versi awal dokumen ini memberi TanStack Query peran "sinkronisasi otomatis IndexedDB↔server".
> Peran itu **dicabut**, karena bertabrakan dengan antrean sinkronisasi buatan sendiri di
> [OFFLINE-SYNC-SPEC](../30-data/OFFLINE-SYNC-SPEC.md). Dua mekanisme yang sama-sama menulis
> transaksi menghasilkan duplikasi atau urutan yang hilang.
>
> | Komponen | Boleh | **Tidak boleh** |
> |---|---|---|
> | Service Worker (**Serwist**) | Aset statis, app shell | Transaksi |
> | TanStack Query | Cache **baca** | **Antrean tulis transaksi** |
> | Antrean sendiri (Dexie) | **Seluruh tulis transaksi** | — |
>
> Antrean transaksi butuh urutan FIFO ketat, idempotensi ULID, dan antrean mati yang dapat
> diaudit — jaminan yang tidak diberikan pustaka cache mana pun.
> Rincian: [TECH-STACK](../10-architecture/TECH-STACK.md) §5.

### D. Contoh Implementasi Komponen React (*Sweet Spring Card*)
```tsx
import { motion } from "framer-motion";
import { Coffee } from "lucide-react";

export function SweetProductCard({ name, price, onClick }) {
  return (
    <motion.button
      whileHover={{ y: -3, x: -1 }}
      whileTap={{ y: 2, x: 1, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 450, damping: 22 }}
      onClick={onClick}
      className="p-5 rounded-[28px] bg-white/85 backdrop-blur-xl border-[2.5px] border-[#2D231E] 
                 shadow-[5px_5px_0px_#2D231E] flex flex-col items-center gap-2 cursor-pointer"
    >
      <div className="w-12 h-12 rounded-2xl bg-[#FFA4B6] border-2 border-[#2D231E] grid place-items-center">
        <Coffee className="w-6 h-6 text-[#2D231E]" strokeWidth={2.25} />
      </div>
      <strong className="font-['Fraunces'] text-lg text-[#2D231E]">{name}</strong>
      <span className="font-mono text-xs text-[#7A6F68]">Rp {price.toLocaleString("id-ID")}</span>
    </motion.button>
  );
}
```

