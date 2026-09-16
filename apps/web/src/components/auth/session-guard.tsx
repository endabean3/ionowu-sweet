"use client";

import {
  type KeputusanAkses,
  aksesKasir,
  aksesPemilik,
  pernahLoginDiPerangkatIni,
} from "@/lib/auth/access";
import { useAuth } from "@/lib/auth/context";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";

/**
 * Penjaga sesi untuk seluruh layar di dalam grup rute.
 *
 * Aturannya (dan alasan kenapa kasir berbeda dari pemilik) ada di
 * lib/auth/access.ts — di sini hanya penerapannya di React.
 *
 * Sebelum ini TIDAK ADA penjaga sama sekali: `app/page.tsx` mengalihkan ke
 * `/kasir`, dan siapa pun yang membuka APK langsung melihat cangkang layar
 * kasir. Ditemukan saat memasang APK ke ponsel sungguhan, bukan di browser
 * pengembang yang sesinya selalu kebetulan hidup.
 */
export function SessionGuard({
  mode,
  children,
}: {
  mode: "kasir" | "pemilik";
  children: ReactNode;
}) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  // localStorage hanya ada di klien. null = belum sempat dibaca, dan selama
  // itu keputusannya "tunggu" — bukan "ke-login", supaya render pertama tidak
  // melempar kasir keluar sebelum jawabannya diketahui.
  const [pernahLogin, setPernahLogin] = useState<boolean | null>(null);
  useEffect(() => {
    setPernahLogin(pernahLoginDiPerangkatIni());
  }, []);

  const keputusan: KeputusanAkses =
    pernahLogin === null
      ? "tunggu"
      : (mode === "kasir" ? aksesKasir : aksesPemilik)({
          isLoading,
          adaSesi: user !== null,
          pernahLogin,
        });

  useEffect(() => {
    if (keputusan === "ke-login") router.replace("/login");
  }, [keputusan, router]);

  if (keputusan !== "izinkan") {
    // Teks statis, bukan spinner: layar kasir melarang animasi memuat
    // (pages/kasir.md), dan ini tampil sepersekian detik saja.
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-base p-6">
        <p className="font-sans text-sm font-bold text-muted">
          {keputusan === "ke-login" ? "Mengalihkan ke halaman masuk…" : "Memeriksa sesi…"}
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
