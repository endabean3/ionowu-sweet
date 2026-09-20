"use client";

import { JaringanError } from "@/lib/auth/api";
import { useAuth } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { type StockEventRow, type StockSummaryRow, fetchStockEvents } from "@/lib/stock/api";
import Decimal from "decimal.js";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Download, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

/** Label jenis mutasi; "sale" negatif = barang keluar karena terjual. */
const JENIS: Record<string, string> = {
  sale: "Terjual",
  refund: "Refund (kembali)",
  void: "Void (kembali)",
  restock: "Stok masuk",
  waste: "Rusak/hilang",
  opname_adjust: "Koreksi opname",
  transfer_in: "Transfer masuk",
  transfer_out: "Transfer keluar",
  repack_in: "Repack masuk",
  repack_out: "Repack keluar",
};

const RENTANG = [
  { label: "Hari ini", hari: 0 },
  { label: "7 hari", hari: 6 },
  { label: "30 hari", hari: 29 },
] as const;

const tglISO = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(d);

const waktu = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(new Date(iso));

const angka = (v: string) =>
  new Decimal(v || 0).toDecimalPlaces(3).toNumber().toLocaleString("id-ID", {
    maximumFractionDigits: 3,
  });

/**
 * Laporan pergerakan stok: berapa yang terjual, masuk, rusak, dan dikoreksi —
 * dalam SATUAN STOK, jadi bibit dilaporkan dalam gram (ADR-0012) meski
 * dijual per ml. Sumbernya ledger `stock_events`, bukan selisih angka stok.
 */
export default function LaporanStokPage() {
  const { accessToken } = useAuth();
  const outlets = useLiveQuery(() => db.outlets.toArray(), []);
  const outlet = outlets?.[0];

  const [hari, setHari] = useState<number>(6);
  const [rows, setRows] = useState<StockEventRow[] | null>(null);
  const [ringkasan, setRingkasan] = useState<StockSummaryRow[]>([]);
  const [galat, setGalat] = useState<string | null>(null);
  const [memuat, setMemuat] = useState(false);

  const muat = useCallback(async () => {
    if (!accessToken || !outlet?.id) return;
    setMemuat(true);
    setGalat(null);
    try {
      const sekarang = new Date();
      const awal = new Date(sekarang.getTime() - hari * 86400000);
      const { events, summary } = await fetchStockEvents(accessToken, outlet.id, {
        dari: tglISO(awal),
        sampai: tglISO(sekarang),
        limit: 200,
      });
      setRows(events);
      setRingkasan(summary);
    } catch (err) {
      setGalat(
        err instanceof JaringanError
          ? "Tidak bisa menghubungi server. Laporan butuh koneksi."
          : err instanceof Error
            ? err.message
            : "Gagal memuat laporan",
      );
    } finally {
      setMemuat(false);
    }
  }, [accessToken, outlet?.id, hari]);

  useEffect(() => {
    void muat();
  }, [muat]);

  /** Unduh CSV untuk dibuka di Excel / dikirim ke pemilik. */
  const unduhCsv = () => {
    const baris = [
      ["waktu", "barang", "jenis", "jumlah", "satuan", "saldo", "oleh", "catatan"],
      ...(rows ?? []).map((e) => [
        waktu(e.created_at),
        e.product_name,
        JENIS[e.event_type] ?? e.event_type,
        e.quantity_delta,
        e.uom,
        e.balance_after,
        e.actor_name ?? "",
        (e.note ?? "").replace(/[\r\n]+/g, " "),
      ]),
    ];
    const csv = baris
      .map((r) => r.map((sel) => `"${String(sel).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `laporan-stok-${tglISO(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Yang paling ditunggu pemilik: total keluar (terjual + rusak) vs masuk.
  const total = (jenis: string[]) =>
    ringkasan
      .filter((s) => jenis.includes(s.event_type))
      .map((s) => `${angka(new Decimal(s.total).abs().toString())} ${s.uom}`)
      .join(" · ");

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
            Laporan stok
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

        <div className="flex gap-2" role="tablist" aria-label="Rentang laporan">
          {RENTANG.map((r) => (
            <button
              key={r.label}
              type="button"
              role="tab"
              aria-selected={hari === r.hari}
              onClick={() => setHari(r.hari)}
              className={`mochi-button pos-touch-target flex-1 rounded-pill border-2 border-card-border px-3 font-sans text-sm font-bold text-main shadow-hard-sm ${
                hari === r.hari ? "bg-sweet-strawberry" : "bg-card"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {galat && (
          <output className="block rounded-2xl border-2 border-card-border bg-sweet-custard p-3 font-sans text-sm font-semibold text-main">
            {galat}
          </output>
        )}

        <dl className="grid grid-cols-2 gap-2">
          {[
            ["Keluar terjual", total(["sale"])],
            ["Rusak/hilang", total(["waste"])],
            ["Stok masuk", total(["restock"])],
            ["Koreksi opname", total(["opname_adjust"])],
          ].map(([judul, nilai]) => (
            <div
              key={judul}
              aria-label={`Ringkasan ${judul}`}
              className="rounded-squircle-sm border-2 border-card-border bg-card p-3 shadow-hard-sm"
            >
              <dt className="font-sans text-xs font-bold text-muted">{judul}</dt>
              <dd className="font-mono text-base font-black tabular-nums text-main">
                {nilai || "—"}
              </dd>
            </div>
          ))}
        </dl>

        <div className="flex items-center justify-between gap-2">
          <p className="font-sans text-sm font-bold text-main">
            {rows === null ? "Memuat…" : `${rows.length} pergerakan`}
          </p>
          <button
            type="button"
            onClick={unduhCsv}
            disabled={!rows || rows.length === 0}
            className="mochi-button pos-touch-target flex items-center gap-1.5 rounded-pill border-2 border-card-border bg-card px-4 font-sans text-sm font-bold text-main shadow-hard-sm disabled:opacity-50"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Unduh CSV
          </button>
        </div>

        <ul aria-label="Pergerakan stok" className="flex flex-col gap-2">
          {rows && rows.length === 0 ? (
            <li className="rounded-squircle border-2 border-dashed border-card-border p-10 text-center font-bold text-muted">
              Belum ada pergerakan stok pada rentang ini.
            </li>
          ) : (
            (rows ?? []).map((e) => {
              const delta = new Decimal(e.quantity_delta || 0);
              return (
                <li
                  key={e.id}
                  className="flex items-center gap-3 rounded-squircle-sm border-2 border-card-border bg-card px-3 py-2.5 shadow-hard-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 font-sans text-sm font-bold leading-5 text-main">
                      {e.product_name}
                    </p>
                    <p className="font-sans text-xs text-main">
                      {waktu(e.created_at)} · {JENIS[e.event_type] ?? e.event_type}
                      {e.actor_name ? ` · ${e.actor_name}` : ""}
                    </p>
                    {e.note && <p className="font-sans text-xs text-muted">{e.note}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={`font-mono text-sm font-bold tabular-nums ${
                        delta.isNegative() ? "text-red-700" : "text-main"
                      }`}
                    >
                      {delta.isNegative() ? "−" : "+"}
                      {angka(delta.abs().toString())} {e.uom}
                    </p>
                    <p className="font-mono text-xs text-muted">sisa {angka(e.balance_after)}</p>
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}
