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
  /** Satuan stok — gram untuk bibit yang dijual per ml (ADR-0012). */
  stockUom: string;
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
  // Stok berjalan dalam SATUAN STOK: bibit Warung Wangi dijual per ml tetapi
  // stoknya gram (ADR-0012), jadi kartunya berbunyi "Aman · 250 g".
  const satuanStokBeda = product.stockUom !== product.uom;
  const presisiStok = satuanStokBeda ? 1 : product.uomPrecision;
  const stokTampil = new Decimal(product.stock || 0)
    .toDecimalPlaces(presisiStok)
    .toNumber()
    .toLocaleString("id-ID", { maximumFractionDigits: presisiStok });
  const level = stockLevel(product.stock, product.minStockAlert);
  const curah = isCurah(product.uomPrecision);
  const teksStok = `${level.label} · ${stokTampil}${
    satuanStokBeda ? ` ${product.stockUom}` : curah ? ` ${product.uom}` : ""
  }`;

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={
        curah
          ? `${product.name}, isi jumlah dalam ${product.uom}`
          : `Tambah ${product.name} ke keranjang`
      }
      // Ponsel (< sm): BARIS DAFTAR — nama selebar layar, harga di kanan.
      // Dua kolom kartu di 360 px menyisakan ~130 px untuk nama, jadi
      // "Bibit Parfum Baccarat Rouge 540" terpotong jadi "Bibit Parfum
      // Baccarat Rouge…" dan kasir tidak bisa membedakan bibit yang mirip.
      // Baris juga lebih pendek: ±9 produk per layar, bukan 6.
      className="mochi-button pos-touch-target flex items-center gap-3 rounded-squircle-sm border-2 border-card-border bg-card px-3 py-2.5 text-left shadow-hard-sm transition-all hover:bg-sweet-custard/30 sm:flex-col sm:items-stretch sm:justify-between sm:p-4 sm:shadow-hard"
    >
      <div className="min-w-0 flex-1 sm:flex-none">
        {/* Ikon kotak dekoratif dihapus: di layar 360px ia merebut ruang dari
           lencana stok, yang lalu patah dua baris. */}
        <span
          className={`hidden w-fit max-w-full items-center gap-1 whitespace-nowrap rounded-pill border border-card-border px-2 py-0.5 font-sans text-xs font-bold text-main sm:flex ${level.badge}`}
        >
          {level.Icon ? (
            <level.Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
          ) : (
            <Package className="h-3 w-3 shrink-0" aria-hidden="true" />
          )}
          <span className="truncate">{teksStok}</span>
        </span>

        {/* DUA baris, bukan satu: "Bibit Parfum Vanilla" dan "Bibit Parfum
           Ocean" sama-sama terpotong jadi "Bibit Parfum…" di satu baris —
           kasir tidak bisa membedakan dua produk yang harganya berbeda.
           min-h (layar lebar) menjaga harga semua kartu tetap sejajar. */}
        <h3 className="line-clamp-2 font-sans text-sm font-bold leading-5 text-main sm:mt-3 sm:min-h-[2.5rem]">
          {product.name}
        </h3>

        {/* Stok versi ponsel: teks kecil di bawah nama, dengan titik warna +
           ikon + label — warna tetap tidak berdiri sendiri. */}
        <span className="mt-0.5 flex items-center gap-1 font-sans text-xs font-semibold text-main sm:hidden">
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-pill border border-card-border ${level.badge}`}
            aria-hidden="true"
          />
          {level.Icon && <level.Icon className="h-3 w-3 shrink-0" aria-hidden="true" />}
          <span className="truncate">{teksStok}</span>
        </span>
      </div>

      <p className="shrink-0 text-right font-mono text-base font-extrabold tabular-nums text-main sm:mt-1 sm:text-left">
        Rp {formattedPrice}
        {curah && <span className="font-sans text-xs font-bold text-muted">/{product.uom}</span>}
      </p>
    </button>
  );
}
