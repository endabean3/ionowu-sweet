import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

const withSerwist = withSerwistInit({
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Dibutuhkan Dockerfile produksi (DOCKER.md §2: "Node → output: standalone").
  // Tanpa ini, `next build` tidak menghasilkan .next/standalone dan image
  // produksi tidak bisa dibangun sama sekali.
  output: "standalone",
};

export default withSerwist(nextConfig);

process.env.NEXT_PUBLIC_API_URL = "http://localhost:8080";
