"use client";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { enqueueOfflineAction } from "@/lib/sync/queue";
import { Clock, Coffee, Lock } from "lucide-react";
import React, { useState } from "react";
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

  const handleOpenShift = async () => {
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

      // Literal "outlet_kemang" SEBELUMNYA dipakai untuk semua tenant —
      // OpenShift akan selalu gagal foreign-key violation begitu server
      // benar-benar menulisnya (outlets.id sungguhan berupa ULID, bukan
      // string itu). Diambil dari outlet nyata milik tenant ini lewat
      // GET /outlets. TODO: ini masih memilih outlet PERTAMA — belum ada
      // pemilihan outlet eksplisit untuk kasir multi-cabang
      // (MULTI-OUTLET.md §3), lihat catatan follow-up.
      const outletsRes = await fetch(`${API_URL}/outlets`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!outletsRes.ok) {
        throw new Error("Gagal memuat daftar outlet");
      }
      const { data: outlets }: { data: OutletRow[] } = await outletsRes.json();
      if (!outlets || outlets.length === 0) {
        throw new Error("Tenant ini belum punya outlet");
      }
      const outletId = outlets[0].id;

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
            disabled={submitting}
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
