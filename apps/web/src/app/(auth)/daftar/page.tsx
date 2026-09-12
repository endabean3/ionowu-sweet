"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { apiRegister } from "@/lib/auth/api";
import { groupedByArchetype, phaseNote } from "@/lib/business-type/catalog";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

/**
 * Halaman pendaftaran tenant baru + akun owner pertama (POST /auth/register).
 *
 * Jenis usaha dikirim sebagai slug `business_type` dan tersimpan di kolom
 * tenants.business_type. Field ini OPSIONAL: kolomnya nullable, dan menahan
 * pendaftaran hanya demi data segmentasi akan menukar pelanggan nyata dengan
 * kerapian data.
 */
export default function DaftarPage() {
  const router = useRouter();
  const groups = useMemo(() => groupedByArchetype(), []);

  const [organizationName, setOrganizationName] = useState("");
  const [outletName, setOutletName] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [tenantId, setTenantId] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const session = await apiRegister({
        organization_name: organizationName.trim(),
        outlet_name: outletName.trim() || undefined,
        owner_name: ownerName.trim(),
        owner_email: ownerEmail.trim(),
        owner_password: ownerPassword,
        business_type: businessType || undefined,
      });
      // Tidak langsung diarahkan ke kasir: pemilik baru perlu konfirmasi
      // bahwa tokonya jadi. Tenant ID disembunyikan di balik <details> —
      // login tidak membutuhkannya lagi, tapi tim dukungan masih memintanya
      // saat menelusuri masalah.
      setTenantId(session.user.tenant_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pendaftaran gagal");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-base p-4">
      {/* Ambient orb — rgba() literal, bukan token+opacity (lihat login/page.tsx) */}
      <div className="fixed inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute top-[-20%] right-[-10%] w-[60vw] h-[60vw] rounded-full bg-[rgba(255,164,182,0.2)] blur-[80px]" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-[rgba(162,232,206,0.2)] blur-[80px]" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="milky-glass rounded-[32px] p-8 space-y-6">
          <div className="text-center space-y-1">
            <Image
              src="/icons/icon-mark.png"
              alt=""
              width={40}
              height={42}
              priority
              className="mx-auto h-10 w-auto"
            />
            <h1 className="text-2xl font-bold text-main font-display">Daftar Toko</h1>
            <p className="text-sm text-muted">Buat tenant baru & akun pemilik</p>
          </div>

          {tenantId ? (
            <div className="space-y-4">
              <div className="rounded-2xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700 space-y-2">
                <p className="font-medium">Toko berhasil didaftarkan.</p>
                <p className="text-xs">Login cukup pakai email dan password yang barusan dibuat.</p>
                <details className="text-xs">
                  <summary className="cursor-pointer text-green-800">
                    Lihat Tenant ID (untuk dukungan teknis)
                  </summary>
                  <code className="mt-2 block bg-white/70 rounded-xl px-3 py-2 text-xs font-mono break-all text-main">
                    {tenantId}
                  </code>
                </details>
              </div>
              <Button
                type="button"
                variant="primary"
                size="pos"
                className="w-full"
                onClick={() => router.replace("/login")}
              >
                Lanjut ke Login
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Nama Toko"
                type="text"
                placeholder="Warung Wangi Dongko"
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                required
                autoComplete="organization"
              />

              <Select
                label="Jenis Usaha"
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
                hint="Boleh dilewati — dipakai menyiapkan template katalog"
              >
                <option value="">— Pilih jenis usaha —</option>
                {groups.map(({ archetype, categories }) => {
                  const note = phaseNote(archetype.phase);
                  return (
                    <optgroup
                      key={archetype.code}
                      label={
                        note
                          ? `${archetype.code} — ${archetype.label} (${note})`
                          : `${archetype.code} — ${archetype.label}`
                      }
                    >
                      {categories.map((c) => (
                        <option key={c.slug} value={c.slug}>
                          {c.label}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </Select>

              <Input
                label="Nama Outlet"
                type="text"
                placeholder="Kosongkan bila sama dengan nama toko"
                value={outletName}
                onChange={(e) => setOutletName(e.target.value)}
                autoComplete="off"
              />
              <Input
                label="Nama Pemilik"
                type="text"
                placeholder="Nama lengkap"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                required
                autoComplete="name"
              />
              <Input
                label="Email"
                type="email"
                placeholder="pemilik@toko.id"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                required
                autoComplete="email"
              />
              <Input
                label="Password"
                type="password"
                placeholder="Minimal 8 karakter"
                value={ownerPassword}
                onChange={(e) => setOwnerPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
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
                disabled={
                  submitting ||
                  !organizationName ||
                  !ownerName ||
                  !ownerEmail ||
                  ownerPassword.length < 8
                }
              >
                {submitting ? "Mendaftarkan…" : "Daftarkan Toko"}
              </Button>

              <p className="text-center text-xs text-muted">
                Sudah punya akun?{" "}
                <Link href="/login" className="text-main underline">
                  Masuk
                </Link>
              </p>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-muted mt-4">ionowu sweet v0.1 · Fase 0</p>
      </div>
    </div>
  );
}
