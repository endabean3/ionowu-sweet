import { SessionGuard } from "@/components/auth/session-guard";
import type { ReactNode } from "react";

/**
 * Layar kasir: boleh dibuka meski sesi sudah mati, ASAL perangkat ini pernah
 * dipakai login. Itu yang menjaga janji "kasir tetap bisa berjualan saat
 * semuanya mati" (CLAUDE.md §6.2) tetap berlaku bagi kasir yang membuka
 * aplikasi di toko yang sedang offline.
 */
export default function KasirLayout({ children }: { children: ReactNode }) {
  return <SessionGuard mode="kasir">{children}</SessionGuard>;
}
