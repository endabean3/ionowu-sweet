"use client";

import { PrinterPicker } from "@/components/pos/printer-picker";
import { Receipt } from "@/components/pos/receipt";
import { DetailTransaksi } from "@/components/sales/detail-transaksi";
import { JaringanError } from "@/lib/auth/api";
import { useAuth } from "@/lib/auth/context";
import { profilTerakhir } from "@/lib/auth/profile";
import { db } from "@/lib/db";
import { useReceiptPrinter } from "@/lib/printer/use-receipt-printer";
import type { ReceiptData } from "@/lib/receipt/format";
import { type SaleDetail, type SaleRow, fetchSale, fetchSales } from "@/lib/sales/api";
import Decimal from "decimal.js";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

const rupiah = (v: string) =>
  `Rp ${new Decimal(v || 0).toDecimalPlaces(0).toNumber().toLocaleString("id-ID")}`;

const jam = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(new Date(iso));

/**
 * Riwayat transaksi: mencari nota lama untuk klaim garansi, cetak ulang,
 * refund, dan void.
 *
 * Dibaca dari SERVER, bukan dari Dexie: riwayat harus memuat transaksi dari
 * perangkat kasir lain juga, dan refund/void mengubah angka bersama. Layar
 * kasir tetap bisa berjualan offline seperti biasa.
 */
export default function RiwayatPage() {
  const { user, accessToken } = useAuth();
  const identitas = user ?? profilTerakhir();
  const printer = useReceiptPrinter();

  const outlets = useLiveQuery(() => db.outlets.toArray(), []);
  const outlet = outlets?.[0];

  const [cari, setCari] = useState("");
  const [rows, setRows] = useState<SaleRow[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [detail, setDetail] = useState<SaleDetail | null>(null);
  const [notaCetak, setNotaCetak] = useState<ReceiptData | null>(null);

  const muat = useCallback(async () => {
    if (!accessToken || !outlet?.id) return;
    setMemuat(true);
    setGalat(null);
    try {
      setRows(await fetchSales(accessToken, outlet.id, { cari: cari.trim() || undefined }));
    } catch (err) {
      setGalat(
        err instanceof JaringanError
          ? "Tidak bisa menghubungi server. Riwayat butuh koneksi."
          : err instanceof Error
            ? err.message
            : "Gagal memuat riwayat",
      );
    } finally {
      setMemuat(false);
    }
  }, [accessToken, outlet?.id, cari]);

  // Muat saat masuk dan saat kata pencarian berhenti diketik.
  useEffect(() => {
    const t = setTimeout(() => void muat(), cari ? 350 : 0);
    return () => clearTimeout(t);
  }, [muat, cari]);

  const bukaDetail = async (id: string) => {
    if (!accessToken) return;
    try {
      setDetail(await fetchSale(accessToken, id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal memuat nota");
    }
  };

  const cetakUlang = (data: ReceiptData) => {
    // Nama toko & penutup diambil dari cache outlet supaya cetak ulang sama
    // persis dengan nota aslinya.
    const lengkap: ReceiptData = {
      ...data,
      outletName: outlet?.name ?? "Toko",
      outletAddress: outlet?.address,
      outletPhone: outlet?.phone,
      footer: outlet?.receipt_footer,
      warrantyDays: outlet?.warranty_days,
      recipePercent: outlet?.bibit_percent,
    };
    setNotaCetak(lengkap);
    void printer.cetak(lengkap);
  };

  return (
    <div className="min-h-[100dvh] bg-base p-3 sm:p-4 md:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:gap-4">
        <header className="sticky top-0 z-30 -mx-3 -mt-3 flex items-center gap-3 bg-base/95 px-3 py-2 backdrop-blur sm:static sm:m-0 sm:bg-transparent sm:p-0">
          <Link
            href="/dashboard"
            aria-label="Kembali ke dasbor"
            className="mochi-button flex h-11 w-11 shrink-0 items-center justify-center rounded-pill border-2 border-card-border bg-card text-main shadow-hard-sm"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </Link>
          <h1 className="flex-1 font-display text-xl font-bold text-main sm:text-2xl">Riwayat</h1>
          <button
            type="button"
            onClick={() => void muat()}
            disabled={memuat}
            aria-label="Muat ulang riwayat"
            className="mochi-button flex h-11 w-11 items-center justify-center rounded-pill border-2 border-card-border bg-card text-main shadow-hard-sm disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${memuat ? "animate-spin" : ""}`} aria-hidden="true" />
          </button>
        </header>

        <div className="milky-glass flex items-center gap-2 rounded-squircle p-2">
          <Search className="ml-2 h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
          <input
            type="text"
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            placeholder="Cari nomor nota"
            aria-label="Cari nomor nota"
            className="pos-touch-target h-11 flex-1 bg-transparent px-1 font-sans text-base font-bold text-main outline-none placeholder:text-muted"
          />
        </div>

        {galat && (
          <output className="block rounded-2xl border-2 border-card-border bg-sweet-custard p-3 font-sans text-sm font-semibold text-main">
            {galat}
          </output>
        )}

        <ul aria-label="Daftar transaksi" className="flex flex-col gap-2">
          {rows === null && !galat ? (
            <li className="py-10 text-center font-bold text-muted">Memuat riwayat…</li>
          ) : rows && rows.length === 0 ? (
            <li className="rounded-squircle border-2 border-dashed border-card-border p-10 text-center font-bold text-muted">
              {cari ? `Tidak ada nota dengan nomor "${cari}".` : "Belum ada transaksi 30 hari ini."}
            </li>
          ) : (
            (rows ?? []).map((s) => {
              const direfund = new Decimal(s.refunded_total || 0).gt(0);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => void bukaDetail(s.id)}
                    className="mochi-button flex w-full items-center gap-3 rounded-squircle-sm border-2 border-card-border bg-card px-3 py-2.5 text-left shadow-hard-sm hover:bg-sweet-custard/30"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-sm font-bold text-main">
                        {s.receipt_number}
                      </span>
                      <span className="block font-sans text-xs text-main">
                        {jam(s.sold_at)} · {s.item_count} barang
                        {s.member_code ? ` · ${s.member_code}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-mono text-sm font-bold tabular-nums text-main">
                        {rupiah(s.grand_total)}
                      </span>
                      {s.payment_status === "void" ? (
                        <span className="mt-0.5 inline-block rounded-pill border border-card-border bg-sweet-taro px-2 py-0.5 font-sans text-[11px] font-bold text-main">
                          Void
                        </span>
                      ) : direfund ? (
                        <span className="mt-0.5 inline-block rounded-pill border border-card-border bg-sweet-custard px-2 py-0.5 font-sans text-[11px] font-bold text-main">
                          Refund {rupiah(s.refunded_total)}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>

      {detail && (
        <DetailTransaksi
          key={detail.sale.id}
          detail={detail}
          accessToken={accessToken}
          role={identitas?.role}
          onClose={() => setDetail(null)}
          onSelesai={() => void muat()}
          onCetak={cetakUlang}
          mencetak={printer.printing}
        />
      )}

      {/* Tak terlihat di layar; hanya muncul di hasil cetak browser. */}
      {notaCetak && <Receipt data={notaCetak} />}
      {printer.pickerOpen && <PrinterPicker rp={printer} />}
    </div>
  );
}
