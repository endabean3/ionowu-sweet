import type { Transition, Variants } from "framer-motion";

/**
 * Token gerak — satu sumber untuk seluruh aplikasi.
 *
 * Nilainya diturunkan dari "Mochi Spring Physics" di
 * `docs/70-design-system/fondasi-UI-v0.1.md` §A, bukan dikarang per komponen.
 * Menyebar angka spring di tiap file membuat aplikasi terasa punya beberapa
 * kepribadian sekaligus — persis masalah yang dihindari sistem desain ini.
 *
 * Dua aturan yang mengikat semua nilai di bawah:
 *
 * 1. **Hanya `transform` dan `opacity`.** Keduanya berjalan di compositor,
 *    tidak memicu layout reflow (fondasi-UI §129). Menganimasikan width,
 *    height, top, atau left akan menghabiskan anggaran 16ms per frame di
 *    Android RAM 3GB — perangkat acuan PERFORMANCE-BUDGET.
 * 2. **Keluar lebih cepat daripada masuk.** Elemen yang pergi tidak boleh
 *    menahan kasir; ~60-70% durasi masuk.
 *
 * `prefers-reduced-motion` TIDAK ditangani di sini melainkan sekali saja di
 * MotionConfig (components/motion/motion-provider.tsx), supaya tidak ada
 * komponen yang bisa lupa menghormatinya.
 */

/** Gerak utama: empuk, sedikit memantul. Untuk elemen yang MASUK. */
export const springMochi: Transition = {
  type: "spring",
  stiffness: 420,
  damping: 24,
  mass: 0.9,
};

/**
 * Lebih kaku dan nyaris tanpa pantulan. Untuk elemen di jalur transaksi
 * kasir, tempat pantulan membuat angka uang sulit dibaca sekilas.
 */
export const springTegas: Transition = {
  type: "spring",
  stiffness: 560,
  damping: 32,
  mass: 0.7,
};

/** Durasi dalam detik (satuan framer-motion), bukan milidetik. */
export const durasi = {
  /** Umpan balik sentuh; di atas ini terasa lamban (INP < 50ms, PERFORMANCE-BUDGET §3). */
  instan: 0.09,
  cepat: 0.16,
  sedang: 0.24,
} as const;

/** Transisi keluar: selalu lebih cepat daripada masuk. */
export const keluar: Transition = { duration: durasi.cepat, ease: [0.4, 0, 1, 1] };

/** Muncul dari bawah — untuk kartu, baris daftar, dan konten halaman. */
export const naikMasuk: Variants = {
  sembunyi: { opacity: 0, y: 12 },
  tampil: { opacity: 1, y: 0, transition: springMochi },
  pergi: { opacity: 0, y: 6, transition: keluar },
};

/** Versi tegas dari naikMasuk untuk layar kasir. */
export const naikMasukTegas: Variants = {
  sembunyi: { opacity: 0, y: 8 },
  tampil: { opacity: 1, y: 0, transition: springTegas },
  pergi: { opacity: 0, y: 4, transition: { duration: durasi.instan } },
};

/** Latar gelap modal. Fade murni: menggeser latar membuat isinya ikut goyah. */
export const latarModal: Variants = {
  sembunyi: { opacity: 0 },
  tampil: { opacity: 1, transition: { duration: durasi.cepat } },
  pergi: { opacity: 0, transition: keluar },
};

/**
 * Panel modal. Membesar dari 96% + naik sedikit, memberi kesan muncul dari
 * arah tombol yang menekannya (modal-motion, HIG/MD).
 */
export const panelModal: Variants = {
  sembunyi: { opacity: 0, scale: 0.96, y: 16 },
  tampil: { opacity: 1, scale: 1, y: 0, transition: springMochi },
  pergi: { opacity: 0, scale: 0.98, y: 8, transition: keluar },
};

/** Bar lengket yang naik dari tepi bawah layar. */
export const barBawah: Variants = {
  sembunyi: { opacity: 0, y: 24 },
  tampil: { opacity: 1, y: 0, transition: springTegas },
  pergi: { opacity: 0, y: 24, transition: { duration: durasi.instan } },
};

/**
 * Induk daftar: anak-anaknya muncul berurutan 40ms (rentang 30-50ms,
 * stagger-sequence MD). Dipakai HANYA di layar pemilik — daftar produk di
 * layar kasir tidak pernah di-stagger, lihat catatan di kasir/page.tsx.
 */
export const daftarBertahap: Variants = {
  sembunyi: {},
  tampil: { transition: { staggerChildren: 0.04, delayChildren: 0.02 } },
};
