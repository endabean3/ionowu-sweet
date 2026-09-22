import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Alias "@/..." yang sama dengan tsconfig.json. Tanpa ini, modul yang
  // mengimpor sesamanya lewat "@/lib/..." — bentuk yang dipakai seluruh
  // aplikasi — tidak bisa diuji sama sekali: Vitest menolaknya dengan
  // "Cannot find package", dan penulis uji terpaksa memilih antara impor
  // relatif yang tidak konsisten dengan kode produksi, atau tidak menguji.
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // Runtime JSX otomatis, sama dengan yang dipakai Next saat membangun.
  // Tanpa ini komponen apa pun gagal dengan "React is not defined" saat
  // dirender di uji, sehingga tata letak yang HARUS dilihat — seperti lembar
  // stiker yang dicetak di kertas sungguhan — tidak bisa diperiksa sama sekali.
  esbuild: { jsx: "automatic" },
  test: {
    // Tanpa konfigurasi eksplisit, glob bawaan Vitest
    // (`**/*.{test,spec}.?(c|m)[jt]s?(x)`) ikut memungut spesifikasi
    // Playwright di e2e/*.spec.ts — keduanya sama-sama diakhiri `.spec.ts`.
    // Ditemukan saat memverifikasi gerbang ⭐ paritas uang (ci.yml job
    // money-parity) benar-benar jalan, bukan cuma terlihat benar.
    exclude: ["**/node_modules/**", "**/e2e/**", "**/.next/**"],
  },
});
