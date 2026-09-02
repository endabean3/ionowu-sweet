"use client";

import { playPop } from "@/lib/audio/haptics";
import React from "react";

export interface MacaronProduct {
  id: string;
  name: string;
  category: string;
  price: string;
  stock: string;
  emoji?: string;
}

interface MacaronItemProps {
  product: MacaronProduct;
  onSelect: (product: MacaronProduct) => void;
}

export function MacaronItem({ product, onSelect }: MacaronItemProps) {
  const handleClick = () => {
    playPop();
    onSelect(product);
  };

  const formattedPrice = Number(product.price).toLocaleString("id-ID");

  return (
    <button
      type="button"
      onClick={handleClick}
      className="mochi-button flex flex-col justify-between rounded-squircle-sm border-2 border-card-border bg-card p-4 text-left shadow-hard transition-all hover:bg-sweet-custard/30 pos-touch-target"
    >
      <div className="flex items-start justify-between">
        <span className="text-3xl">{product.emoji || "☕"}</span>
        <span className="rounded-pill border border-card-border bg-base px-2 py-0.5 font-mono text-xs font-semibold text-muted">
          Stok: {product.stock}
        </span>
      </div>

      <div className="mt-3">
        <h3 className="font-sans text-sm font-bold text-main line-clamp-1">{product.name}</h3>
        <p className="mt-1 font-mono text-base font-extrabold tabular-nums text-main">
          Rp {formattedPrice}
        </p>
      </div>
    </button>
  );
}
