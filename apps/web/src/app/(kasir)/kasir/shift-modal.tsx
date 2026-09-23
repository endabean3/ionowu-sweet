"use client";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { MoneyInput } from "@/components/ui/money-input";
import { useAuth } from "@/lib/auth/context";
import { profilTerakhir } from "@/lib/auth/profile";
import { db } from "@/lib/db";
import { type OutletRow, cacheOutlets } from "@/lib/outlet/api";
import { adopsiShiftTerbuka } from "@/lib/sync/engine";
import { enqueueOfflineAction } from "@/lib/sync/queue";
import { Clock, Coffee, Lock, Store } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ulid } from "ulid";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export function ShiftModal({ onClose }: { onClose: () => void }) {
  const [openingCash, setOpeningCash] = useState("");
  const { user, accessToken } = useAuth();
  /**
   * Sesi hidup bila ada; kalau tidak, identitas terakhir di perangkat ini.
   * Kasir yang membuka aplikasi saat toko offline punya `user === null` —
   * tanpa cadangan ini, cache outlet tak terbaca dan shift-nya dibuat dengan
   * tenant tebakan.
   */
  const identitas = user ?? profilTerakhir();
  const [submitting, setSubmitting] = useState(false);
  const openingRef = useRef(false);
  const [outlets, setOutlets] = useState<OutletRow[] | null>(null);
  const [selectedOutletId, setSelectedOutletId] = useState<string>("");
  /**
   * DARI MANA daftar outlet itu datang. Tanpa ini, "server tidak bisa
   * dihubungi" dan "Anda memang belum ditugaskan ke outlet" berakhir di layar
   * yang sama persis — dan pesannya menyuruh pemilik warung menghubungi
   * manajer padahal yang mati adalah servernya. Terlihat saat membuka APK di
   * ponsel sungguhan sebelum backend dideploy.
   */
  const [sumberOutlet, setSumberOutlet] = useState<"server" | "cache" | "gagal" | null>(null);
  const [memuatUlang, setMemuatUlang] = useState(0);

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
  // biome-ignore lint/correctness/useExhaustiveDependencies: memuatUlang sengaja dipakai sebagai pemicu tombol "Coba lagi"
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
        setSumberOutlet("server");
        const rows = data ?? [];
        setOutlets(rows);
        if (rows.length === 1) {
          setSelectedOutletId(rows[0].id);
        }
        if (identitas?.tenant_id) await cacheOutlets(identitas.tenant_id, rows);
      } catch {
        if (cancelled) return;
        const cached = identitas?.tenant_id
          ? await db.outlets.where("tenant_id").equals(identitas.tenant_id).toArray()
          : [];
        if (cached.length > 0) {
          toast.warning("Offline — memakai daftar outlet tersimpan terakhir");
          setSumberOutlet("cache");
          setOutlets(cached);
          if (cached.length === 1) setSelectedOutletId(cached[0].id);
        } else {
          toast.error("Gagal menghubungi server");
          setSumberOutlet("gagal");
          setOutlets([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, identitas?.tenant_id, memuatUlang]);

  const handleOpenShift = async () => {
    if (!selectedOutletId) {
      toast.error("Pilih outlet dulu sebelum membuka shift");
      return;
    }
    // Ref, bukan state `submitting`: dua ketukan sinkron sama-sama membaca
    // state lama sebelum re-render, sehingga dua shift ikut terbuat (yang
    // kedua pasti ditolak server oleh idx_shifts_one_open, tapi terlanjur
    // mengotori db lokal + antrean sync). Ref berubah seketika.
    if (openingRef.current) return;
    openingRef.current = true;
    setSubmitting(true);
    try {
      // ULID MURNI, tanpa prefiks "sh_" — shifts.id di skema (migrations/00001)
      // adalah VARCHAR(26), pas untuk ULID 26 karakter. Prefiks membuatnya
      // 29 karakter dan INSERT gagal "value too long for type character
      // varying(26)" — ditemukan lewat sync push nyata yang diam-diam
      // ditolak server (client tidak menampilkan error, item cuma tertahan
      // di antrean lokal selamanya).
      const shiftId = ulid();
      // TIDAK ADA lagi fallback "tenant_default". Shift bertenant palsu lebih
      // buruk daripada shift yang gagal dibuat: ia menumpuk di perangkat,
      // ditolak server saat sync, dan angkanya tidak pernah muncul di laporan
      // pemilik — kegagalan yang diam.
      const tenantId = identitas?.tenant_id;
      if (!tenantId) {
        toast.error("Sesi perangkat ini tidak dikenal. Login ulang saat ada internet.");
        return;
      }
      const outletId = selectedOutletId;

      // Kasir yang sama mungkin MASIH punya shift terbuka di server —
      // perangkat ini cuma kehilangan catatannya (dipasang ulang, cache
      // dibersihkan, ganti HP). Membuka shift baru di atasnya ditolak indeks
      // `idx_shifts_one_open`, dan setiap penjualan yang menunjuk shift baru
      // itu ikut ditolak dengan pelanggaran foreign key — persis yang
      // memblokir toko selama tiga hari pada 19-22 Sep 2026.
      //
      // Jadi tanya server dulu, dan pakai yang sudah ada bila memang ada.
      if (accessToken && tenantId) {
        const diadopsi = await adopsiShiftTerbuka(accessToken, tenantId, outletId).catch(
          () => false,
        );
        if (diadopsi) {
          toast.success("Shift yang masih terbuka di server dipakai lagi");
          onClose();
          return;
        }
      }

      const cash = Number.parseFloat(openingCash) || 0;

      const shiftData = {
        id: shiftId,
        tenant_id: tenantId,
        outlet_id: outletId,
        cashier_id: identitas?.id ?? "",
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
      openingRef.current = false;
    }
  };

  return (
    <Modal ariaLabel="Buka shift kasir" onClose={onClose} dismissible={false} size="md">
      <div className="bg-surface p-8 text-center">
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
                  aria-pressed={selectedOutletId === o.id}
                  className={`pos-touch-target flex items-center gap-3 rounded-xl border-2 p-3 text-left font-sans font-bold transition-all ${
                    selectedOutletId === o.id
                      ? "border-card-border bg-sweet-custard text-main"
                      : "border-card-border bg-surface text-muted hover:bg-main/5"
                  }`}
                >
                  <Store className="h-5 w-5 shrink-0" />
                  <span>{o.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {sumberOutlet === "gagal" && (
          <div
            role="alert"
            className="mt-6 rounded-xl border-2 border-red-300 bg-red-50 p-3 text-left font-sans text-sm text-red-800"
          >
            <p className="font-bold">Tidak bisa menghubungi server.</p>
            <p className="mt-1">
              Periksa koneksi internet perangkat ini. Bila internetnya normal, kemungkinan server
              sedang tidak aktif — hubungi yang memasang aplikasi.
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() => {
                setSumberOutlet(null);
                setOutlets(null);
                setMemuatUlang((n) => n + 1);
              }}
            >
              Coba lagi
            </Button>
          </div>
        )}

        {sumberOutlet === "server" && outlets?.length === 0 && (
          <p
            role="alert"
            className="mt-6 rounded-xl border-2 border-red-300 bg-red-50 p-3 font-sans text-sm font-bold text-red-800"
          >
            Anda belum ditugaskan ke outlet mana pun. Hubungi owner/manager.
          </p>
        )}

        <div className="mt-8 text-left">
          <label htmlFor="modal_awal" className="font-sans text-sm font-bold text-main">
            Modal awal di laci
          </label>
          <p className="font-sans text-xs text-main">Uang kembalian yang ada sebelum toko buka.</p>
          <MoneyInput
            id="modal_awal"
            className="mt-2"
            value={openingCash}
            onChange={(e) => setOpeningCash(e.target.value)}
            placeholder="100000"
          />
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
            <Lock className="mr-2 h-4 w-4" aria-hidden="true" /> Kembali ke Dasbor
          </Button>
        </div>
      </div>
    </Modal>
  );
}
