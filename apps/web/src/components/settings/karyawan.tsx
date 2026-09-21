"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { JaringanError } from "@/lib/auth/api";
import {
  type Karyawan,
  KaryawanError,
  PERAN_KARYAWAN,
  fetchKaryawan,
  setAktifKaryawan,
  tambahKaryawan,
} from "@/lib/staff/api";
import { UserPlus, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

const LABEL: Record<string, string> = {
  owner: "Pemilik",
  manager: "Manager",
  cashier: "Kasir",
  warehouse: "Gudang",
  sales_floor: "Pramuniaga",
};

/** Karyawan toko. Owner saja (RBAC-MODEL §Administrasi). */
export function KaryawanToko({ accessToken }: { accessToken: string | null }) {
  const [daftar, setDaftar] = useState<Karyawan[] | null>(null);
  const [buka, setBuka] = useState(false);
  const [nama, setNama] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [peran, setPeran] = useState<string>("cashier");
  const [coba, setCoba] = useState(false);
  const [menyimpan, setMenyimpan] = useState(false);

  const muat = useCallback(async () => {
    if (!accessToken) return;
    try {
      setDaftar(await fetchKaryawan(accessToken));
    } catch {
      setDaftar([]);
    }
  }, [accessToken]);

  useEffect(() => {
    void muat();
  }, [muat]);

  const galatNama = nama.trim() === "" ? "Nama wajib diisi" : undefined;
  const galatEmail = email.includes("@") ? undefined : "Email tidak valid";
  const galatPassword = password.length >= 8 ? undefined : "Minimal 8 karakter";
  const sah = !galatNama && !galatEmail && !galatPassword;

  const simpan = async () => {
    setCoba(true);
    if (!sah || !accessToken || menyimpan) return;
    setMenyimpan(true);
    try {
      await tambahKaryawan(accessToken, {
        name: nama.trim(),
        email: email.trim().toLowerCase(),
        password,
        role: peran,
      });
      toast.success(`${nama.trim()} ditambahkan sebagai ${LABEL[peran] ?? peran}`);
      setNama("");
      setEmail("");
      setPassword("");
      setCoba(false);
      setBuka(false);
      await muat();
    } catch (err) {
      toast.error(
        err instanceof JaringanError
          ? "Tidak bisa menghubungi server. Coba lagi saat online."
          : err instanceof KaryawanError
            ? err.message
            : "Gagal menambah karyawan",
      );
    } finally {
      setMenyimpan(false);
    }
  };

  const ubahAktif = async (k: Karyawan) => {
    if (!accessToken) return;
    try {
      await setAktifKaryawan(accessToken, k.id, !k.is_active);
      await muat();
    } catch (err) {
      toast.error(err instanceof KaryawanError ? err.message : "Gagal menyimpan");
    }
  };

  return (
    <Card variant="solid" className="p-4 sm:p-5">
      <h2 className="mb-1 flex items-center gap-2 font-sans text-lg font-bold">
        <Users className="h-5 w-5" aria-hidden="true" />
        Karyawan
      </h2>
      <p className="mb-4 font-sans text-sm text-main">
        Kasir masuk dengan akunnya sendiri, jadi setiap nota dan setiap mutasi stok tercatat atas
        namanya. Karyawan yang berhenti dinonaktifkan — riwayatnya tetap utuh.
      </p>

      <ul aria-label="Daftar karyawan" className="mb-4 flex flex-col gap-2">
        {daftar === null && <li className="font-sans text-sm text-muted">Memuat…</li>}
        {(daftar ?? []).map((k) => (
          <li
            key={k.id}
            className="flex items-center gap-3 rounded-2xl border-2 border-card-border bg-surface px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-sans text-sm font-bold text-main">
                {k.name}
                {!k.is_active && " · nonaktif"}
              </p>
              <p className="truncate font-sans text-xs text-main">
                {LABEL[k.role] ?? k.role} · {k.email}
                {(k.role === "owner" || k.role === "manager") &&
                  (k.punya_pin ? " · PIN aktif" : " · PIN belum diatur")}
              </p>
            </div>
            {k.role !== "owner" && (
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0 border-card-border"
                onClick={() => void ubahAktif(k)}
              >
                {k.is_active ? "Nonaktifkan" : "Aktifkan"}
              </Button>
            )}
          </li>
        ))}
        {daftar?.length === 0 && (
          <li className="font-sans text-sm text-muted">Belum ada karyawan lain.</li>
        )}
      </ul>

      {buka ? (
        <div className="flex flex-col gap-3">
          <Input
            label="Nama"
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            maxLength={200}
            autoComplete="off"
            error={coba ? galatNama : undefined}
          />
          <Input
            label="Email untuk login"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
            error={coba ? galatEmail : undefined}
          />
          <Input
            label="Password awal"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            error={coba ? galatPassword : undefined}
            hint="Beritahukan ke karyawan; ia memakainya untuk masuk di mesin kasir."
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="peran-karyawan" className="text-sm font-medium text-main">
              Peran
            </label>
            <select
              id="peran-karyawan"
              value={peran}
              onChange={(e) => setPeran(e.target.value)}
              className="pos-touch-target w-full rounded-2xl border-2 border-card-border bg-card px-4 font-sans text-base font-bold text-main"
            >
              {PERAN_KARYAWAN.map((p) => (
                <option key={p.nilai} value={p.nilai}>
                  {p.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-main">
              Kasir tidak bisa melihat omzet, HPP, atau mengubah harga. Refund dan pembatalan butuh
              PIN manager.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="pos"
              variant="ghost"
              className="border-card-border"
              onClick={() => setBuka(false)}
            >
              Batal
            </Button>
            <Button
              size="pos"
              variant="primary"
              className="flex-1"
              disabled={menyimpan}
              onClick={simpan}
            >
              {menyimpan ? "Menyimpan…" : "Simpan karyawan"}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="pos"
          variant="secondary"
          className="w-full gap-2"
          onClick={() => setBuka(true)}
        >
          <UserPlus className="h-5 w-5" aria-hidden="true" />
          Tambah karyawan
        </Button>
      )}
    </Card>
  );
}
