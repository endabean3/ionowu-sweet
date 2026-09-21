"use client";

import { JaringanError } from "@/lib/auth/api";
import { useAuth } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { useReceiptPrinter } from "@/lib/printer/use-receipt-printer";
import { COLUMNS } from "@/lib/receipt/escpos";
import { rupiah } from "@/lib/receipt/format";
import { type LaporanHarian, fetchLaporanHarian } from "@/lib/reports/api";
import { type KepalaLaporan, barisZReport, teksZReport } from "@/lib/reports/zreport";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Printer, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

/** Tanggal YYYY-MM-DD di zona toko — bukan UTC, yang menggeser hari
 *  sebelum pukul 07.00 WIB ke tanggal kemarin. */
const tglISO = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(d);

const geser = (hari: number) => tglISO(new Date(Date.now() + hari * 86400000));

/**
 * Laporan penjualan harian (tutup buku / Z-Report).
 *
 * Hanya owner & manager (RBAC-MODEL §"Laporan & BI"); server menolak peran
 * lain dengan 403, dan pesan itulah yang ditampilkan di sini — bukan layar
 * kosong yang terlihat seperti aplikasi rusak.
 *
 * Butuh koneksi. Laporan menjumlahkan transaksi SEMUA perangkat kasir, jadi
 * menghitungnya dari IndexedDB satu ponsel akan melaporkan omzet yang lebih
 * kecil dari yang sebenarnya — angka salah yang terlihat meyakinkan.
 */
export default function LaporanHarianPage() {
  const { accessToken, user } = useAuth();
  const outlets = useLiveQuery(() => db.outlets.toArray(), []);
  const outlet = outlets?.[0];
  const printer = useReceiptPrinter();

  const [tanggal, setTanggal] = useState<string>(() => tglISO(new Date()));
  const [data, setData] = useState<LaporanHarian | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [memuat, setMemuat] = useState(false);

  const muat = useCallback(async () => {
    if (!accessToken || !outlet?.id) return;
    setMemuat(true);
    setGalat(null);
    // Data lama DIBUANG sebelum memuat, bukan dibiarkan sampai jawaban baru
    // tiba. Tanpa ini, mengganti tanggal menampilkan angka kemarin di bawah
    // judul hari ini selama sepersekian detik — persis kelas kesalahan yang
    // paling mahal di laporan: angka salah yang terlihat meyakinkan.
    setData(null);
    try {
      setData(await fetchLaporanHarian(accessToken, outlet.id, { dari: tanggal, sampai: tanggal }));
    } catch (err) {
      setData(null);
      setGalat(
        err instanceof JaringanError
          ? "Tidak bisa menghubungi server. Laporan butuh koneksi karena menjumlahkan transaksi semua perangkat."
          : err instanceof Error
            ? err.message
            : "Gagal memuat laporan",
      );
    } finally {
      setMemuat(false);
    }
  }, [accessToken, outlet?.id, tanggal]);

  useEffect(() => {
    void muat();
  }, [muat]);

  const kepala: KepalaLaporan = useMemo(
    () => ({
      namaToko: outlet?.name ?? "Toko",
      alamat: outlet?.address,
      dicetakOleh: user?.name ?? "Pengguna",
      // Dihitung sekali per pemuatan, bukan tiap render: jam pada pratinjau
      // tidak boleh berdetak sendiri sementara kertasnya menyebut satu waktu.
      dicetakPada: new Date().toISOString(),
    }),
    [outlet?.name, outlet?.address, user?.name],
  );

  // Pratinjau memakai lebar kertas printer yang benar-benar terpasang, jadi
  // yang terlihat di layar persis yang keluar dari mesin.
  const lebar = COLUMNS[printer.printer?.paper ?? 58];
  const pratinjau = useMemo(
    () => (data ? teksZReport(barisZReport(data, kepala, lebar), lebar) : ""),
    [data, kepala, lebar],
  );

  const cetak = () => {
    if (!data) return;
    void printer.cetakLaporan((p) => barisZReport(data, kepala, COLUMNS[p]));
  };

  const r = data?.ringkasan;

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
          <h1 className="flex-1 font-display text-xl font-bold text-main sm:text-2xl">
            Tutup buku
          </h1>
          <button
            type="button"
            onClick={() => void muat()}
            disabled={memuat}
            aria-label="Muat ulang laporan"
            className="mochi-button flex h-11 w-11 items-center justify-center rounded-pill border-2 border-card-border bg-card text-main shadow-hard-sm disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${memuat ? "animate-spin" : ""}`} aria-hidden="true" />
          </button>
        </header>

        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="tanggal-laporan" className="font-sans text-sm font-bold text-main">
            Tanggal
          </label>
          <input
            id="tanggal-laporan"
            type="date"
            value={tanggal}
            max={tglISO(new Date())}
            onChange={(e) => setTanggal(e.target.value)}
            className="pos-touch-target rounded-pill border-2 border-card-border bg-card px-4 font-sans text-sm font-bold text-main"
          />
          <button
            type="button"
            onClick={() => setTanggal(geser(-1))}
            className="mochi-button pos-touch-target rounded-pill border-2 border-card-border bg-card px-4 font-sans text-sm font-bold text-main shadow-hard-sm"
          >
            Kemarin
          </button>
          <button
            type="button"
            onClick={() => setTanggal(tglISO(new Date()))}
            className="mochi-button pos-touch-target rounded-pill border-2 border-card-border bg-card px-4 font-sans text-sm font-bold text-main shadow-hard-sm"
          >
            Hari ini
          </button>
        </div>

        {galat && (
          <output className="block rounded-2xl border-2 border-card-border bg-sweet-custard p-3 font-sans text-sm font-semibold text-main">
            {galat}
          </output>
        )}

        {r && (
          <dl className="grid grid-cols-2 gap-2">
            {[
              ["Penjualan bersih", rupiah(r.penjualan_bersih)],
              ["Transaksi", String(r.transaksi)],
              ["Tunai di laci", rupiah(data?.kas.tunai ?? "0")],
              ["Void & refund", `${r.void_jumlah + r.refund_jumlah}`],
            ].map(([judul, nilai]) => (
              <div
                key={judul}
                aria-label={`Ringkasan ${judul}`}
                className="rounded-squircle-sm border-2 border-card-border bg-card p-3 shadow-hard-sm"
              >
                <dt className="font-sans text-xs font-bold text-muted">{judul}</dt>
                <dd className="font-mono text-base font-black tabular-nums text-main">{nilai}</dd>
              </div>
            ))}
          </dl>
        )}

        {/* Transaksi terlambat ditonjolkan DI LAYAR, bukan hanya di kertas:
            pemilik yang melihat totalnya tidak cocok dengan catatan kasir
            harus menemukan alasannya tanpa bertanya ke siapa pun. */}
        {data && data.terlambat.jumlah > 0 && (
          <output className="block rounded-2xl border-2 border-card-border bg-sweet-custard p-3 font-sans text-sm font-semibold text-main">
            {data.terlambat.jumlah} transaksi ({rupiah(data.terlambat.nilai)}) tiba setelah shift
            ditutup dan TIDAK termasuk angka di atas — laporan yang sudah dicetak tidak pernah
            berubah.
          </output>
        )}

        <div className="flex items-center justify-between gap-2">
          <p className="font-sans text-sm font-bold text-main">
            {memuat ? "Memuat…" : data ? "Pratinjau cetak" : "—"}
          </p>
          <button
            type="button"
            onClick={cetak}
            disabled={!data || printer.printing}
            className="mochi-button pos-touch-target flex items-center gap-1.5 rounded-pill border-2 border-card-border bg-sweet-strawberry px-4 font-sans text-sm font-bold text-main shadow-hard-sm disabled:opacity-50"
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            Cetak laporan
          </button>
        </div>

        {/* Pratinjau = hasil cetak: keduanya disusun barisZReport dengan lebar
            kolom yang sama (lib/reports/zreport.ts). */}
        {data && (
          <pre
            aria-label="Pratinjau laporan tutup buku"
            className="overflow-x-auto rounded-squircle-sm border-2 border-card-border bg-card p-3 font-mono text-xs leading-snug text-main shadow-hard-sm"
          >
            {pratinjau}
          </pre>
        )}
      </div>

      {/* Jalur cetak browser/PWA (tanpa printer Bluetooth): hanya elemen ini
          yang tersisa saat window.print() — lihat @media print di globals.css. */}
      {data && (
        <div id="receipt-print-root" aria-hidden="true">
          <pre className="receipt receipt-pre">{pratinjau}</pre>
        </div>
      )}
    </div>
  );
}
