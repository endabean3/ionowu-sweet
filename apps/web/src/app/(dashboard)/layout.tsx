import { SessionGuard } from "@/components/auth/session-guard";
import type { ReactNode } from "react";

/**
 * Layar pemilik: wajib punya sesi hidup. Angkanya memang datang dari server,
 * jadi tidak ada janji offline yang perlu dijaga di sini — dan cangkang kosong
 * tanpa sesi hanya terlihat seperti aplikasi rusak.
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <SessionGuard mode="pemilik">{children}</SessionGuard>;
}
