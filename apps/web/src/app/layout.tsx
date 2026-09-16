import { MotionProvider } from "@/components/motion/motion-provider";
import { AuthProvider } from "@/lib/auth/context";
import { SyncProvider } from "@/lib/sync/provider";
import type { Metadata, Viewport } from "next";
import { Fraunces, Plus_Jakarta_Sans, Space_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

const spaceMono = Space_Mono({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-space-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ionowu sweet — Kasir POS & UMKM Intelligence",
  description: "Sistem Kasir Offline-First PWA & Mini ERP untuk UMKM Indonesia",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ionowu sweet",
  },
};

// TIDAK ADA maximumScale / userScalable: false.
//
// Keduanya sebelumnya mengunci zoom di seluruh aplikasi. Itu melanggar WCAG
// 1.4.4 (Resize Text) dan memukul justru pengguna yang paling butuh: pemilik
// warung berusia 50+ yang ingin memperbesar angka di layar, dan kasir yang
// memeriksa ULID kecil di struk. Alasan klasik "mencegah zoom tak sengaja
// saat mengetuk cepat" sudah ditangani `touch-action: manipulation` di
// globals.css, yang mematikan double-tap-to-zoom TANPA mematikan cubit-zoom.
export const viewport: Viewport = {
  themeColor: "#FAF6F0",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="id"
      className={`${plusJakarta.variable} ${fraunces.variable} ${spaceMono.variable}`}
    >
      <body className="min-h-screen bg-base text-main antialiased selection:bg-sweet-strawberry selection:text-main">
        <MotionProvider>
          <AuthProvider>
            <SyncProvider>{children}</SyncProvider>
          </AuthProvider>
        </MotionProvider>
        <Toaster
          position="top-center"
          toastOptions={{
            className:
              "milky-glass rounded-squircle text-main font-sans border-2 border-card-border",
          }}
        />
      </body>
    </html>
  );
}
