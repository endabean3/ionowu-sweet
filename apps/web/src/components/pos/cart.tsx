"use client";

import { Button } from "@/lib/../components/ui/button";
import { playPop, playSuccessChord } from "@/lib/audio/haptics";
import { type MoneyItem, calculateCart } from "@/lib/money/calc";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import React from "react";
import { toast } from "sonner";

export interface CartLine {
  id: string;
  variantId: string;
  name: string;
  unitPrice: string;
  quantity: number;
  discount: string;
}

interface POSCartProps {
  items: CartLine[];
  onUpdateQty: (variantId: string, delta: number) => void;
  onRemoveItem: (variantId: string) => void;
  onClearCart: () => void;
  onCheckout: () => void;
}

export function POSCart({
  items,
  onUpdateQty,
  onRemoveItem,
  onClearCart,
  onCheckout,
}: POSCartProps) {
  // Hitung total dengan library decimal.js (paritas penuh dengan Go)
  const moneyItems: MoneyItem[] = items.map((it) => ({
    quantity: it.quantity,
    unitPrice: it.unitPrice,
    discount: it.discount || "0",
  }));

  const totals = calculateCart({
    items: moneyItems,
    discount: "0",
    taxRate: "0.11", // PPN 11%
  });

  const handleCheckoutClick = () => {
    if (items.length === 0) {
      toast.error("Keranjang masih kosong!");
      return;
    }
    playSuccessChord();
    onCheckout();
  };

  return (
    <div className="milky-glass flex h-full flex-col justify-between rounded-squircle p-5">
      {/* Cart Header */}
      <div>
        <div className="flex items-center justify-between border-b-2 border-card-border pb-3">
          <div className="flex items-center gap-2 font-sans text-base font-bold text-main">
            <ShoppingBag className="h-5 w-5 text-sweet-strawberry" />
            <span>Keranjang Belanja</span>
            <span className="rounded-pill border border-card-border bg-sweet-custard px-2 py-0.5 font-mono text-xs">
              {items.reduce((acc, it) => acc + it.quantity, 0)} item
            </span>
          </div>
          {items.length > 0 && (
            <button
              type="button"
              onClick={() => {
                playPop();
                onClearCart();
              }}
              className="font-sans text-xs font-bold text-muted hover:text-red-500"
            >
              Kosongkan
            </button>
          )}
        </div>

        {/* Cart Item List */}
        <div className="mt-4 max-h-[42vh] space-y-3 overflow-y-auto pr-1">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <span className="text-4xl opacity-50">🛒</span>
              <p className="mt-2 font-sans text-sm font-semibold text-muted">
                Belum ada item dipilih
              </p>
              <p className="text-xs text-muted/70">Scan barcode atau klik menu di sebelah kiri</p>
            </div>
          ) : (
            items.map((it) => {
              const lineTotal = (Number(it.unitPrice) * it.quantity).toLocaleString("id-ID");
              return (
                <div
                  key={it.variantId}
                  className="flex items-center justify-between rounded-squircle-sm border border-card-border bg-card p-3 shadow-hard-sm"
                >
                  <div className="min-w-0 flex-1">
                    <h4 className="truncate font-sans text-sm font-bold text-main">{it.name}</h4>
                    <p className="font-mono text-xs text-muted">
                      Rp {Number(it.unitPrice).toLocaleString("id-ID")}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Qty Controls */}
                    <div className="flex items-center rounded-pill border border-card-border bg-base p-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          playPop();
                          onUpdateQty(it.variantId, -1);
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-pill hover:bg-black/5"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-7 text-center font-mono text-sm font-bold tabular-nums">
                        {it.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          playPop();
                          onUpdateQty(it.variantId, 1);
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-pill hover:bg-black/5"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>

                    {/* Line Total */}
                    <span className="w-20 text-right font-mono text-sm font-bold tabular-nums">
                      Rp {lineTotal}
                    </span>

                    {/* Delete */}
                    <button
                      type="button"
                      onClick={() => {
                        playPop();
                        onRemoveItem(it.variantId);
                      }}
                      className="text-muted hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Cart Summary & Checkout */}
      <div className="mt-4 border-t-2 border-card-border pt-4">
        <div className="space-y-1.5 font-sans text-sm">
          <div className="flex justify-between text-muted">
            <span>Subtotal</span>
            <span className="font-mono font-semibold tabular-nums">
              Rp {Number(totals.subtotal.toString()).toLocaleString("id-ID")}
            </span>
          </div>
          <div className="flex justify-between text-muted">
            <span>PPN (11%)</span>
            <span className="font-mono font-semibold tabular-nums">
              Rp {Number(totals.taxTotal.toString()).toLocaleString("id-ID")}
            </span>
          </div>
          <div className="flex items-center justify-between pt-2">
            <span className="text-base font-extrabold text-main">Total Bayar</span>
            <span className="font-mono text-2xl font-black tabular-nums text-main">
              Rp {Number(totals.grandTotal.toString()).toLocaleString("id-ID")}
            </span>
          </div>
        </div>

        {/* 64px Checkout Button (pos-lg per pages/kasir.md) */}
        <Button
          onClick={handleCheckoutClick}
          size="pos-lg"
          variant="primary"
          className="mt-4 w-full text-xl shadow-hard"
        >
          ⚡ Bayar Sekarang (Enter)
        </Button>
      </div>
    </div>
  );
}
