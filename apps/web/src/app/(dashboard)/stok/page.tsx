"use client";

import { UbahStok } from "@/components/stock/ubah-stok";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/context";
import { profilTerakhir } from "@/lib/auth/profile";
import { type LocalVariant, db } from "@/lib/db";
import Decimal from "decimal.js";
import { useLiveQuery } from "dexie-react-hooks";
import { AlertTriangle, ArrowLeft, PackageX, Pencil, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Layar Stok: berapa sisa tiap barang, dan jalan untuk mengubahnya — barang
 * masuk, barang rusak/hilang, dan opname (hasil timbang).
 *
 * Angkanya SELALU dalam satuan stok: bibit Warung Wangi dijual per ml tetapi
 * ditimbang dalam gram (ADR-0012), dan layar ini adalah layar orang yang
 * sedang memegang timbangan.
 *
 * Daftarnya dibaca dari Dexie supaya tetap terbuka saat offline; mengubah
 * stok tetap butuh koneksi (lihat lib/stock/api.ts).
 */
export default function StokPage() {
  const { user, accessToken } = useAuth();
  const identitas = user ?? profilTerakhir();
  // RBAC-MODEL §Stok: owner, manager, gudang. Kasir & sales hanya melihat.
  const bolehUbah =
    identitas?.role === "owner" || identitas?.role === "manager" || identitas?.role === "warehouse";

  const [cari, setCari] = useState("");
  const [dipilih, setDipilih] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const cek = () => setOffline(!navigator.onLine);
    cek();
    window.addEventListener("online", cek);
    window.addEventListener("offline", cek);
    return () => {
      window.removeEventListener("online", cek);
      window.removeEventListener("offline", cek);
    };
  }, []);

  const products = useLiveQuery(() => db.products.toArray(), []);
  const variants = useLiveQuery(() => db.variants.toArray(), []);
  const outlets = useLiveQuery(() => db.outlets.toArray(), []);
  const outletId = outlets?.[0]?.id ?? "";

  if (!products || !variants) {
    return <div className="p-8 text-center font-bold text-muted">Memuat stok…</div>;
  }

  const namaProduk = new Map(products.map((p) => [p.id, p.name]));
  const variantPerProduk = new Map<string, number>();
  for (const v of variants) {
    variantPerProduk.set(v.product_id, (variantPerProduk.get(v.product_id) ?? 0) + 1);
  }

  const nama = (v: LocalVariant) => {
    const produk = namaProduk.get(v.product_id) ?? "Tanpa nama";
    return (variantPerProduk.get(v.product_id) ?? 0) > 1 ? `${produk} - ${v.name}` : produk;
  };

  const kunci = cari.trim().toLowerCase();
  const baris = variants
    .filter((v) => v.is_active !== false)
    .map((v) => {
      const stok = new Decimal(v.stock_quantity || 0);
      const min = new Decimal(v.min_stock_alert || 0);
      return {
        v,
        nama: nama(v),
        stok,
        satuan: v.stock_uom || v.uom,
        // 0 = habis, 1 = menipis, 2 = aman. Yang butuh tindakan di atas.
        level: stok.lte(0) ? 0 : stok.lte(min) ? 1 : 2,
      };
    })
    .filter((b) => !kunci || b.nama.toLowerCase().includes(kunci))
    .sort((a, b) => a.level - b.level || a.nama.localeCompare(b.nama, "id"));

  const perluTindakan = baris.filter((b) => b.level < 2).length;
  const target = dipilih ? baris.find((b) => b.v.id === dipilih) : undefined;

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
          <h1 className="font-display text-xl font-bold text-main sm:text-2xl">Stok</h1>
        </header>

        {perluTindakan > 0 && (
          <output className="flex items-center gap-2 rounded-2xl border-2 border-card-border bg-sweet-custard p-3 font-sans text-sm font-bold text-main">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {perluTindakan} barang habis atau menipis
          </output>
        )}

        <div className="milky-glass flex items-center gap-2 rounded-squircle p-2">
          <Search className="ml-2 h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
          <input
            type="text"
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            placeholder="Cari barang"
            aria-label="Cari barang"
            className="pos-touch-target h-11 flex-1 bg-transparent px-1 font-sans text-base font-bold text-main outline-none placeholder:text-muted"
          />
        </div>

        <ul aria-label="Daftar stok" className="flex flex-col gap-2">
          {baris.length === 0 ? (
            <li className="rounded-squircle border-2 border-dashed border-card-border p-10 text-center font-bold text-muted">
              {kunci ? `Tidak ada barang cocok dengan "${cari}".` : "Belum ada barang berstok."}
            </li>
          ) : (
            baris.map((b) => (
              <li
                key={b.v.id}
                className="flex items-center gap-3 rounded-squircle-sm border-2 border-card-border bg-card px-3 py-2.5 shadow-hard-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 font-sans text-sm font-bold leading-5 text-main">
                    {b.nama}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 font-mono text-xs font-semibold text-main">
                    <span
                      aria-hidden="true"
                      className={`h-2.5 w-2.5 shrink-0 rounded-pill border border-card-border ${
                        b.level === 0
                          ? "bg-sweet-strawberry"
                          : b.level === 1
                            ? "bg-sweet-custard"
                            : "bg-sweet-matcha"
                      }`}
                    />
                    {b.level === 0 && <PackageX className="h-3 w-3 shrink-0" aria-hidden="true" />}
                    {b.level === 1 && (
                      <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
                    )}
                    {b.stok
                      .toDecimalPlaces(3)
                      .toNumber()
                      .toLocaleString("id-ID", { maximumFractionDigits: 3 })}{" "}
                    {b.satuan}
                    {b.level === 0 ? " · habis" : b.level === 1 ? " · menipis" : ""}
                  </p>
                </div>
                {bolehUbah && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="pos-touch-target shrink-0 gap-1.5 shadow-hard-sm"
                    aria-label={`Ubah stok ${b.nama}`}
                    onClick={() => setDipilih(b.v.id)}
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                    Ubah
                  </Button>
                )}
              </li>
            ))
          )}
        </ul>

        {!bolehUbah && (
          <p className="font-sans text-sm text-main">
            Hanya owner, manager, atau gudang yang bisa mengubah stok.
          </p>
        )}
      </div>

      {target && outletId && (
        <UbahStok
          key={target.v.id}
          variant={target.v}
          namaBarang={target.nama}
          outletId={outletId}
          accessToken={accessToken}
          offline={offline}
          onClose={() => setDipilih(null)}
        />
      )}
    </div>
  );
}
