import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Pembungkus APK untuk PWA yang sama (ADR-0010).
 *
 * `webDir: "out"` diisi oleh `BUILD_TARGET=capacitor pnpm build`, yang
 * memaksa Next memakai `output: "export"`. Build biasa tetap menghasilkan
 * `standalone` untuk image Docker — lihat catatan di next.config.ts.
 */
const config: CapacitorConfig = {
  appId: "id.ionowu.sweet",
  appName: "ionowu sweet",
  webDir: "out",

  // SENGAJA TIDAK ADA `server.url`.
  //
  // Mengisinya membuat WebView memuat aplikasi dari server jauh, sehingga APK
  // hanya menjadi cangkang: begitu internet mati, layar kasir ikut mati —
  // persis kebalikan dari janji offline-first (CLAUDE.md §6.2). Yang boleh
  // menyeberangi jaringan hanyalah panggilan API ke pos-engine, dan itu sudah
  // ditangani antrean Dexie saat offline.

  android: {
    // Aset dimuat dari dalam APK; tidak ada konten http polos yang perlu
    // diizinkan. Membiarkannya true hanya memperbesar permukaan serangan.
    allowMixedContent: false,
  },
};

export default config;
