import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Tanpa konfigurasi eksplisit, glob bawaan Vitest
    // (`**/*.{test,spec}.?(c|m)[jt]s?(x)`) ikut memungut spesifikasi
    // Playwright di e2e/*.spec.ts — keduanya sama-sama diakhiri `.spec.ts`.
    // Ditemukan saat memverifikasi gerbang ⭐ paritas uang (ci.yml job
    // money-parity) benar-benar jalan, bukan cuma terlihat benar.
    exclude: ["**/node_modules/**", "**/e2e/**", "**/.next/**"],
  },
});
