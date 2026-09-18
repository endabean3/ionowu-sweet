"use client";

import { playPop } from "@/lib/audio/haptics";
import { isCurah } from "@/lib/catalog/quantity";
import Decimal from "decimal.js";
import { AlertTriangle, Package, PackageX } from "lucide-react";
import React from "react";

export interface MacaronProduct {
  id: string;
  name: string;
  category: string;
  price: string;
  stock: string;
  minStockAlert: string;
  /** Satuan jual varian: pcs, ml, g, kg… (migrasi 00003). */
  uom: string;
  /** 0 = dijual utuh; > 0 = curah/timbang dan butuh input jumlah. */
  uomPrecision: number;
}

interface MacaronItemProps {
  product: MacaronProduct;
  onSelect: (product: MacaronProduct) => void;
}

// FR-14 (Pengingat Bahan Menipis): indikator stok berbasis warna —
// Matcha = Aman, Custard = Sedang, Strawberry = Kritis. Warna TIDAK berdiri
// sendiri (README §"Batasan yang Berlaku" #3 — pasangan tersulit bagi
// penglihatan buta warna merah-hijau), jadi setiap level juga punya ikon dan
// label teks berbeda.
function stockLevel(stock: string, minStockAlert: string) {
  const qty = Number(stock);
  const min = Number(minStockAlert);
  if (qty <= 0) {
    return { label: "Habis", badge: "bg-sweet-strawberry", Icon: PackageX };
  }
  if (qty <= min) {
    return { label: "Menipis", badge: "bg-sweet-custard", Icon: AlertTriangle };
  }
  return { label: "Aman", badge: "bg-sweet-matcha", Icon: null };
}

export function MacaronItem({ product, onSelect }: MacaronItemProps) {
  const handleClick = () => {
    playPop();
    onSelect(product);
  };

  const formattedPrice = Number(product.price).toLocaleString("id-ID");
  // Stok dari Decimal, bukan Number: "25000.000" gram tampil "25.000", dan
  // pecahan ml tidak berubah jadi 4999.999999.
  const stokTampil = new Decimal(product.stock || 0)
    .toDecimalPlaces(product.uomPrecision)
    .toNumber()
    .toLocaleString("id-ID", { maximumFractionDigits: product.uomPrecision });
  const level = stockLevel(product.stock, product.minStockAlert);
  const curah = isCurah(product.uomPrecision);

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={
        curah
          ? `${product.name}, isi jumlah dalam ${product.uom}`
          : `Tambah ${product.name} ke keranjang`
      }
      className="mochi-button flex flex-col justify-between rounded-squircle-sm border-2 border-card-border bg-card p-3 text-left shadow-hard transition-all hover:bg-sweet-custard/30 pos-touch-target sm:p-4"
    >
      {/* Ikon kotak dekoratif dihapus: di layar 360px ia merebut ruang dari
         lencana stok, yang lalu patah dua baris. */}
      <span
        className={`flex w-fit max-w-full items-center gap-1 whitespace-nowrap rounded-pill border border-card-border px-2 py-0.5 font-sans text-xs font-bold text-main ${level.badge}`}
      >
        {level.Icon ? (
          <level.Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
        ) : (
          <Package className="h-3 w-3 shrink-0" aria-hidden="true" />
        )}
        <span className="truncate">
          {level.label} · {stokTampil}
          {curah ? ` ${product.uom}` : ""}
        </span>
      </span>

      <div className="mt-3">
        {/* DUA baris, bukan satu: "Bibit Parfum Vanilla" dan "Bibit Parfum
           Ocean" sama-sama terpotong jadi "Bibit Parfum…" di satu baris —
           kasir tidak bisa membedakan dua produk yang harganya berbeda.
           min-h menjaga harga semua kartu tetap sejajar. */}
        <h3 className="min-h-[2.5rem] font-sans text-sm font-bold leading-5 text-main line-clamp-2">
          {product.name}
        </h3>
        <p className="mt-1 font-mono text-base font-extrabold tabular-nums text-main">
          Rp {formattedPrice}
          {curah && (
            <span className="font-sans text-xs font-bold text-muted"> / {product.uom}</span>
          )}
        </p>
      </div>
    </button>
  );
}
