"use client";

import { playPop } from "@/lib/audio/haptics";
import { isCurah } from "@/lib/catalog/quantity";
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
      className="mochi-button flex flex-col justify-between rounded-squircle-sm border-2 border-card-border bg-card p-4 text-left shadow-hard transition-all hover:bg-sweet-custard/30 pos-touch-target"
    >
      <div className="flex items-start justify-between">
        <span className="flex h-11 w-11 items-center justify-center rounded-pill border-2 border-card-border bg-base">
          <Package className="h-5 w-5 text-main" strokeWidth={2} aria-hidden="true" />
        </span>
        <span
          className={`flex items-center gap-1 rounded-pill border border-card-border px-2 py-0.5 font-mono text-xs font-semibold text-main ${level.badge}`}
        >
          {level.Icon && <level.Icon className="h-3 w-3" aria-hidden="true" />}
          {level.label} · {product.stock}
        </span>
      </div>

      <div className="mt-3">
        <h3 className="font-sans text-sm font-bold text-main line-clamp-1">{product.name}</h3>
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
