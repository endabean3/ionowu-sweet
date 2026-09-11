"use client";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { enqueueOfflineAction } from "@/lib/sync/queue";
import { Clock, Coffee, Lock, Store } from "lucide-react";
import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { ulid } from "ulid";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

interface OutletRow {
  id: string;
  name: string;
}

export function ShiftModal({ onClose }: { onClose: () => void }) {
  const [openingCash, setOpeningCash] = useState("");
  const { user, accessToken } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [outlets, setOutlets] = useState<OutletRow[] | null>(null);
  const [selectedOutletId, setSelectedOutletId] = useState<string>("");

  // GET /outlets sekarang sudah discope server (MULTI-OUTLET.md §3): kasir
  // hanya menerima outlet yang ditugaskan padanya, owner/manager menerima
  // semuanya — jadi tidak ada risiko kasir memilih cabang yang bukan haknya.
  // Bila hanya SATU outlet dikembalikan, langsung dipilih tanpa menampilkan
  // pemilihan (kasir single-outlet, mayoritas kasus, tidak perlu klik ekstra).
  //
  // Hasil sukses di-cache ke db.outlets. Tanpa ini, kasir yang membuka shift
  // dalam kondisi BENAR-BENAR offline (mis. modem toko mati sebelum toko
  // buka) tidak akan pernah bisa memulai hari kerjanya sama sekali — padahal
  // invarian #2 (CLAUDE.md §6) menjamin "kasir tetap bisa berjualan meski
  // internet mati". Kegagalan jaringan jatuh ke cache terakhir sebelum
  // menyerah.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/outlets`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) throw new Error("Gagal memuat daftar outlet");
        const { data }: { data: OutletRow[] } = await res.json();
        if (cancelled) return;
        const rows = data ?? [];
        setOutlets(rows);
        if (rows.length === 1) {
          setSelectedOutletId(rows[0].id);
        }
        if (rows.length > 0 && user?.tenant_id) {
          await db.outlets.bulkPut(
            rows.map((o) => ({ id: o.id, tenant_id: user.tenant_id, name: o.name })),
          );
        }
      } catch {
        if (cancelled) return;
        const cached = user?.tenant_id
          ? await db.outlets.where("tenant_id").equals(user.tenant_id).toArray()
          : [];
        if (cached.length > 0) {
          toast.warning("Offline — memakai daftar outlet tersimpan terakhir");
          setOutlets(cached);
          if (cached.length === 1) setSelectedOutletId(cached[0].id);
        } else {
          toast.error("Gagal memuat daftar outlet");
          setOutlets([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, user?.tenant_id]);

  const handleOpenShift = async () => {
    if (!selectedOutletId) {
      toast.error("Pilih outlet dulu sebelum membuka shift");
      return;
    }
    setSubmitting(true);
    try {
      // ULID MURNI, tanpa prefiks "sh_" — shifts.id di skema (migrations/00001)
      // adalah VARCHAR(26), pas untuk ULID 26 karakter. Prefiks membuatnya
      // 29 karakter dan INSERT gagal "value too long for type character
      // varying(26)" — ditemukan lewat sync push nyata yang diam-diam
      // ditolak server (client tidak menampilkan error, item cuma tertahan
      // di antrean lokal selamanya).
      const shiftId = ulid();
      const tenantId = user?.tenant_id || "tenant_default";
      const outletId = selectedOutletId;

      const cash = Number.parseFloat(openingCash) || 0;

      const shiftData = {
        id: shiftId,
        tenant_id: tenantId,
        outlet_id: outletId,
        cashier_id: user?.id || "cashier",
        opened_at: new Date().toISOString(),
        opening_cash: cash.toString(),
        status: "open" as const,
      };

      // Simpan ke db.shifts
      await db.shifts.put(shiftData);

      // Masukkan ke queue untuk disinkronisasi
      await enqueueOfflineAction({
        tenantId,
        outletId,
        type: "shift_open",
        payload: shiftData,
      });

      toast.success("Shift berhasil dibuka!");
      onClose();
    } catch (err) {
      toast.error("Gagal membuka shift");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-main/60 p-4 backdrop-blur-md">
      <div className="w-full max-w-md rounded-[32px] border-2 border-card-border bg-white p-8 shadow-hard-lg text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-4 border-card-border bg-sweet-custard shadow-hard-sm mb-6">
          <Coffee className="h-10 w-10 text-main" />
        </div>

        <h2 className="font-display text-2xl font-black text-main">Toko Belum Dibuka</h2>
        <p className="mt-2 font-sans text-sm text-muted">
          Anda harus memulai shift kasir sebelum dapat melakukan transaksi penjualan.
        </p>

        {outlets && outlets.length > 1 && (
          <div className="mt-8 text-left">
            <span className="font-sans text-xs font-bold uppercase tracking-wider text-muted">
              Pilih Outlet
            </span>
            <div className="mt-2 grid gap-2">
              {outlets.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setSelectedOutletId(o.id)}
                  className={`flex items-center gap-3 rounded-xl border-2 p-3 text-left font-sans font-bold transition-all ${
                    selectedOutletId === o.id
                      ? "border-card-border bg-sweet-custard text-main"
                      : "border-card-border bg-white text-muted hover:bg-gray-50"
                  }`}
                >
                  <Store className="h-5 w-5 shrink-0" />
                  <span>{o.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {outlets && outlets.length === 0 && (
          <p className="mt-6 rounded-xl border-2 border-red-200 bg-red-50 p-3 font-sans text-sm font-bold text-red-600">
            Anda belum ditugaskan ke outlet mana pun. Hubungi owner/manager.
          </p>
        )}

        <div className="mt-8 text-left">
          <label
            htmlFor="modal_awal"
            className="font-sans text-xs font-bold uppercase tracking-wider text-muted"
          >
            Modal Awal Kasir (Uang Kembalian Laci)
          </label>
          <div className="mt-2 flex gap-2">
            <span className="flex items-center rounded-l-xl border-2 border-r-0 border-card-border bg-base px-4 font-mono font-bold">
              Rp
            </span>
            <input
              type="number"
              value={openingCash}
              onChange={(e) => setOpeningCash(e.target.value)}
              className="flex-1 rounded-r-xl border-2 border-card-border bg-white p-3 font-mono text-lg font-bold outline-none focus:ring-2 focus:ring-sweet-strawberry"
              id="modal_awal"
              placeholder="100000"
            />
          </div>
        </div>

        <div className="mt-8 grid gap-3">
          <Button
            variant="primary"
            className="w-full h-12 text-base shadow-hard-sm"
            onClick={handleOpenShift}
            disabled={submitting || !selectedOutletId}
          >
            {submitting ? "Membuka..." : "Buka Shift Sekarang"}
          </Button>
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              window.location.href = "/dashboard";
            }}
          >
            <Lock className="mr-2 h-4 w-4" /> Kembali ke Dasbor
          </Button>
        </div>
      </div>
    </div>
  );
}
