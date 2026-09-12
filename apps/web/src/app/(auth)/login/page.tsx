"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth/context";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Halaman login kasir / owner.
 *
 * Cukup email + password: `idx_users_email` UNIQUE global, jadi satu email
 * hanya pernah menunjuk satu user dan tenant-nya diambil dari baris user itu.
 * Sebelumnya layar ini meminta Tenant ID (ULID 26 karakter) — pemilik warung
 * yang kehilangan string itu terkunci keluar dari datanya sendiri, tanpa jalur
 * pemulihan apa pun.
 *
 * Setelah login sukses, redirect ke /kasir (kasir) atau /dashboard (owner/manager).
 */
export default function LoginPage() {
  const { login, isLoading } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      // Redirect sesuai role dilakukan oleh middleware/layout
      // Default: ke halaman kasir
      router.replace("/kasir");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login gagal");
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base">
        <div className="text-muted text-sm">Memuat sesi…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-base p-4">
      {/* Ambient orb — rgba() literal, bukan token/opacity: Tailwind tidak
         bisa menerapkan modifier opacity pada warna yang didefinisikan
         sebagai string var(--x) di tailwind.config.ts (butuh nilai resolved
         saat build), jadi bg-sweet-strawberry/20 diam-diam menjadi transparan
         penuh — ditemukan lewat pengecekan getComputedStyle nyata di browser,
         bukan cuma baca kode. */}
      <div className="fixed inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute top-[-20%] right-[-10%] w-[60vw] h-[60vw] rounded-full bg-[rgba(255,164,182,0.2)] blur-[80px]" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-[rgba(162,232,206,0.2)] blur-[80px]" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Card */}
        <div className="milky-glass rounded-[32px] p-8 space-y-6">
          {/* Logo / brand */}
          <div className="text-center space-y-1">
            <Image
              src="/icons/icon-mark.png"
              alt=""
              width={40}
              height={42}
              priority
              className="mx-auto h-10 w-auto"
            />
            <h1 className="text-2xl font-bold text-main font-display">ionowu sweet</h1>
            <p className="text-sm text-muted">Kasir empuk, cepat & cerdas</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email"
              type="email"
              placeholder="kasir@toko.id"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />

            {error && (
              <div className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="pos"
              className="w-full"
              disabled={submitting || !email || !password}
            >
              {submitting ? "Masuk…" : "Masuk"}
            </Button>
            <p className="text-center text-xs text-muted">
              Belum punya akun?{" "}
              <Link href="/daftar" className="text-main underline">
                Daftarkan toko
              </Link>
            </p>
          </form>
        </div>

        <p className="text-center text-xs text-muted mt-4">ionowu sweet v0.1 · Fase 0</p>
      </div>
    </div>
  );
}
