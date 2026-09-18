"use client";

import { useAuth } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { naikMasukTegas } from "@/lib/motion/tokens";
import type { ReceiptPrinter } from "@/lib/printer/use-receipt-printer";
import { useSync } from "@/lib/sync/provider";
import { useLiveQuery } from "dexie-react-hooks";
import { m } from "framer-motion";
import { Moon, Printer, RefreshCw, Settings, Sun, Wifi, WifiOff } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import React, { useEffect, useState } from "react";

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  manager: "Manager",
  cashier: "Kasir",
  warehouse: "Gudang",
  sales_floor: "Sales",
};

interface HeaderProps {
  /** outlet_id shift yang sedang aktif — nama diambil dari cache db.outlets
   * (diisi ShiftModal), bukan dihardcode. Undefined berarti belum ada shift
   * terbuka, header tetap menampilkan identitas kasir tanpa nama outlet. */
  outletId?: string;
  /** Hanya diisi di APK (printer Bluetooth). Di browser, cetak lewat dialog
   *  sistem dan tidak ada yang perlu diatur di sini. */
  printer?: ReceiptPrinter;
}

export function POSHeader({ outletId, printer }: HeaderProps) {
  const { user } = useAuth();
  const { isSyncing, syncNow, lastSyncedAt } = useSync();
  // null = BELUM diketahui. Status jaringan hanya ada di klien, jadi server
  // dan render pertama klien wajib sepakat pada "belum tahu" — kalau tidak,
  // React membuang seluruh HTML server dan merender ulang dari nol.
  //
  // Lazy-init `navigator.onLine` TIDAK bisa dipakai di sini: Node 21+ punya
  // global `navigator` TANPA properti onLine, jadi `typeof navigator !==
  // "undefined"` lolos di server tapi nilainya undefined → server merender
  // "Offline" sementara klien merender "Online". Itu persis hydration error
  // yang sempat terjadi.
  //
  // Default `true` juga ditolak: kasir yang membuka aplikasi saat toko sudah
  // offline akan melihat "Online" palsu. "Memeriksa…" jujur untuk keduanya.
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isDark, setIsDark] = useState<boolean>(false);

  const outlet = useLiveQuery(() => (outletId ? db.outlets.get(outletId) : undefined), [outletId]);

  useEffect(() => {
    // Tetapkan status nyata SETELAH mount — di sinilah navigator.onLine
    // benar-benar tersedia dan aman dibaca.
    setIsOnline(navigator.onLine);

    // Tema dipulihkan dari pilihan TERAKHIR kasir. Sebelumnya setiap muat
    // ulang kembali ke mode terang, jadi kasir yang bekerja di ruang remang
    // harus menekan tombol ini setiap kali aplikasi dibuka.
    //
    // Sengaja TIDAK mengikuti prefers-color-scheme sistem: ponsel Android
    // banyak yang menyalakan mode gelap otomatis di malam hari, sementara
    // layar kasir justru paling sering dipakai di bawah silau — mode gelap
    // yang menyala sendiri di etalase kaca membuat angka lebih sulit dibaca,
    // bukan lebih mudah. Gelap hanya kalau kasir memintanya.
    try {
      if (localStorage.getItem("ionowu.tema") === "dark-cocoa") {
        setIsDark(true);
        document.documentElement.setAttribute("data-theme", "dark-cocoa");
      }
    } catch {
      // Penyimpanan diblokir: tema jatuh ke mode terang bawaan.
    }

    const handleOnline = () => {
      setIsOnline(true);
      syncNow();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const interval = setInterval(async () => {
      try {
        const count = await db.syncQueue.where("status").anyOf(["pending", "failed"]).count();
        setPendingCount(count);
      } catch {}
    }, 3000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, [syncNow]);

  const toggleTheme = () => {
    const nextTheme = !isDark;
    setIsDark(nextTheme);
    if (nextTheme) {
      document.documentElement.setAttribute("data-theme", "dark-cocoa");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    try {
      localStorage.setItem("ionowu.tema", nextTheme ? "dark-cocoa" : "oat-milk");
    } catch {
      // Tema tetap berlaku untuk sesi ini meski tidak bisa disimpan.
    }
  };

  return (
    <header className="milky-glass flex flex-wrap items-center justify-between gap-4 rounded-squircle p-4">
      {/* Brand & Outlet */}
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill border-2 border-card-border bg-sweet-strawberry shadow-hard-sm">
          <Image
            src="/icons/icon-mark.png"
            alt=""
            width={22}
            height={24}
            priority
            className="h-[22px] w-auto"
          />
        </span>
        <div>
          <h1 className="font-display text-lg font-bold tracking-tight text-main">
            ionowu <span className="font-italic text-sweet-strawberry">sweet</span>
          </h1>
          <p className="font-sans text-xs font-semibold text-muted">
            {outlet?.name ?? "Memuat outlet..."} • {user?.name ?? "Kasir"}
            {user?.role && ` (${ROLE_LABEL[user.role] ?? user.role})`}
          </p>
        </div>
      </div>

      {/* Status Badges & Controls */}
      {/* flex-wrap: di layar 360px deretan ini tadinya melebihi lebar layar —
         tombol tema terpotong di tepi kanan dan halaman bisa digeser ke samping. */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Sync trigger button */}
        <button
          type="button"
          onClick={() => syncNow()}
          disabled={!isOnline || isSyncing}
          className="mochi-button flex h-11 items-center gap-1.5 whitespace-nowrap rounded-pill border-2 border-card-border bg-surface px-3 font-sans text-xs font-bold text-main shadow-hard-sm disabled:opacity-50"
          aria-label={
            lastSyncedAt
              ? `Sinkronkan sekarang. Terakhir sync ${lastSyncedAt.toLocaleTimeString("id-ID")}`
              : "Sinkronkan sekarang. Belum pernah sync"
          }
        >
          <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} aria-hidden="true" />
          {isSyncing ? "Mengirim…" : "Sinkron"}
        </button>

        {/* Offline/Online Indicator */}
        <div
          className={`flex h-11 items-center gap-2 whitespace-nowrap rounded-pill border-2 border-card-border px-3 font-sans text-xs font-bold shadow-hard-sm ${
            isOnline === null
              ? "bg-card text-muted"
              : isOnline
                ? "bg-sweet-matcha text-main"
                : "bg-sweet-taro text-main"
          }`}
        >
          {isOnline === null ? (
            <>
              <Wifi className="h-4 w-4" aria-hidden="true" />
              <span>Memeriksa…</span>
            </>
          ) : isOnline ? (
            <>
              <Wifi className="h-4 w-4" aria-hidden="true" />
              <span>Online</span>
            </>
          ) : (
            <>
              <WifiOff className="h-4 w-4" aria-hidden="true" />
              <span>Offline · tersimpan</span>
            </>
          )}
        </div>

        {/* Sync Queue Badge */}
        {/* Tanpa AnimatePresence — alasannya di kasir/page.tsx: anak tunggal
           bersyarat meninggalkan node tersangkut yang menelan ketukan. */}
        {pendingCount > 0 && (
          <m.div
            key="antrean"
            variants={naikMasukTegas}
            initial="sembunyi"
            animate="tampil"
            aria-live="polite"
            className="flex h-11 items-center gap-1.5 whitespace-nowrap rounded-pill border-2 border-card-border bg-sweet-custard px-3 font-sans text-xs font-bold text-main shadow-hard-sm"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            <span>
              {pendingCount} <span className="sr-only">transaksi </span>belum terkirim
            </span>
          </m.div>
        )}

        {printer && (
          <button
            type="button"
            onClick={printer.bukaPicker}
            aria-label={
              printer.printer
                ? `Pengaturan printer. Terpasang: ${printer.printer.name}, kertas ${printer.printer.paper} mm`
                : "Pengaturan printer. Belum ada printer dipilih"
            }
            className={`mochi-button flex h-11 items-center gap-1.5 whitespace-nowrap rounded-pill border-2 border-card-border px-3 font-sans text-xs font-bold text-main shadow-hard-sm ${
              printer.printer ? "bg-base" : "bg-sweet-custard"
            }`}
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            {/* Nama printer tidak ditampilkan (bisa panjang dan patah); yang
               penting bagi kasir: sudah siap atau belum. */}
            {printer.printer ? "Printer" : "Pilih printer"}
          </button>
        )}

        <Link
          href="/pengaturan"
          aria-label="Pengaturan toko, struk, printer, dan akun"
          className="mochi-button flex h-11 w-11 items-center justify-center rounded-pill border-2 border-card-border bg-base text-main shadow-hard-sm"
        >
          <Settings className="h-4 w-4" aria-hidden="true" />
        </Link>

        {/* Dark/Light Toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={isDark ? "Ganti ke mode terang" : "Ganti ke mode gelap"}
          aria-pressed={isDark}
          className="mochi-button flex h-11 w-11 items-center justify-center rounded-pill border-2 border-card-border bg-base text-main shadow-hard-sm"
        >
          {isDark ? (
            <Sun className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Moon className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
    </header>
  );
}
