import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

const withSerwist = withSerwistInit({
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

// Dibungkus Capacitor menjadi APK saat BUILD_TARGET=capacitor. Capacitor
// memuat berkas statis dari dalam APK, jadi ia BUTUH `output: "export"` —
// sementara image Docker produksi butuh `output: "standalone"` (DOCKER.md §2).
// Keduanya tidak bisa aktif bersamaan, karena itu dipilih lewat env, bukan
// dengan mengganti-ganti berkas ini saat mau rilis.
const isCapacitor = process.env.BUILD_TARGET === "capacitor";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: isCapacitor ? "export" : "standalone",
  ...(isCapacitor
    ? {
        // Pengoptimal next/image butuh runtime server yang tidak ikut masuk
        // ke dalam APK; tanpa ini `next build` menolak mengekspor.
        images: { unoptimized: true },
        // WebView memuat berkas dari skema file://-like, yang tidak punya
        // resolusi "/rute" → "/rute/index.html".
        trailingSlash: true,
      }
    : {}),
};

export default withSerwist(nextConfig);

// CATATAN: JANGAN menetapkan NEXT_PUBLIC_API_URL di berkas ini.
//
// Berkas ini dievaluasi SEBELUM Next menyisipkan variabel NEXT_PUBLIC_* ke
// dalam bundle klien, sehingga penetapan di sini MENIMPA environment yang
// benar-benar diberikan saat build. Sebelumnya baris
//
//     process.env.NEXT_PUBLIC_API_URL = "http://localhost:8080";
//
// berada tepat di sini, dan akibatnya setiap build produksi mengandung
// "localhost:8080" — terbukti dengan membangun memakai URL lain lalu mencari
// string-nya di .next/static: URL asli muncul NOL kali, localhost 12 kali.
// Di VPS artinya browser pengguna menghubungi dirinya sendiri; di dalam APK
// artinya ponsel menghubungi dirinya sendiri. Keduanya gagal total, dan tidak
// terlihat saat pengembangan karena di lokal localhost memang benar.
//
// Nilainya sekarang murni dari environment saat build, dengan cadangan
// http://localhost:8080 di src/lib/auth/api.ts untuk pengembangan lokal.
