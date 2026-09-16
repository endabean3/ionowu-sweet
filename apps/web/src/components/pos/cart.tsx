"use client";

import { Button } from "@/components/ui/button";
import { playPop, playSuccessChord } from "@/lib/audio/haptics";
import type { MoneyTotal } from "@/lib/money/calc";
import { naikMasukTegas } from "@/lib/motion/tokens";
import { AnimatePresence, m } from "framer-motion";
import { Minus, Plus, ShoppingBag, Trash2, Zap } from "lucide-react";
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
  /** Dihitung SEKALI di halaman kasir, bukan di sini. Sebelumnya cart dan
   * payment-modal masing-masing memanggil calculateCart dengan tarif PPN
   * yang sama-sama di-hardcode — dua sumber kebenaran untuk angka uang yang
   * sama, dan satu-satunya yang menjaga keduanya sinkron adalah kebetulan. */
  totals: MoneyTotal;
  onUpdateQty: (variantId: string, delta: number) => void;
  onRemoveItem: (variantId: string) => void;
  onClearCart: () => void;
  onCheckout: () => void;
}

export function POSCart({
  items,
  totals,
  onUpdateQty,
  onRemoveItem,
  onClearCart,
  onCheckout,
}: POSCartProps) {
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
              <ShoppingBag
                className="h-10 w-10 text-muted/50"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <p className="mt-2 font-sans text-sm font-semibold text-muted">
                Belum ada item dipilih
              </p>
              <p className="text-xs text-muted/70">Scan barcode atau klik menu di sebelah kiri</p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {items.map((it) => {
                const lineTotal = (Number(it.unitPrice) * it.quantity).toLocaleString("id-ID");
                return (
                  <m.div
                    key={it.variantId}
                    layout={false}
                    variants={naikMasukTegas}
                    initial="sembunyi"
                    animate="tampil"
                    exit="pergi"
                    className="flex flex-col gap-2 rounded-squircle-sm border border-card-border bg-card p-3 shadow-hard-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <h4 className="font-sans text-sm font-bold text-main sm:truncate">
                        {it.name}
                      </h4>
                      <p className="font-mono text-xs text-muted">
                        Rp {Number(it.unitPrice).toLocaleString("id-ID")}
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-1.5 sm:justify-end">
                      {/* Qty Controls — 44px minimum (WCAG 2.5.5 / UI-UX Pro Max
                       touch-target-size): kasir sering mengetuk cepat berulang
                       kali sambil terburu-buru, target 28px sebelumnya
                       menyebabkan salah pencet baris tetangga. */}
                      <div className="flex items-center rounded-pill border border-card-border bg-base p-0.5">
                        <button
                          type="button"
                          aria-label={`Kurangi qty ${it.name}`}
                          onClick={() => {
                            playPop();
                            onUpdateQty(it.variantId, -1);
                          }}
                          className="flex h-11 w-11 items-center justify-center rounded-pill hover:bg-black/5 active:scale-95"
                        >
                          <Minus className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <span className="w-7 text-center font-mono text-sm font-bold tabular-nums">
                          {it.quantity}
                        </span>
                        <button
                          type="button"
                          aria-label={`Tambah qty ${it.name}`}
                          onClick={() => {
                            playPop();
                            onUpdateQty(it.variantId, 1);
                          }}
                          className="flex h-11 w-11 items-center justify-center rounded-pill hover:bg-black/5 active:scale-95"
                        >
                          <Plus className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>

                      {/* Line Total */}
                      <span className="w-20 text-right font-mono text-sm font-bold tabular-nums">
                        Rp {lineTotal}
                      </span>

                      {/* Delete */}
                      <button
                        type="button"
                        aria-label={`Hapus ${it.name} dari keranjang`}
                        onClick={() => {
                          playPop();
                          onRemoveItem(it.variantId);
                        }}
                        className="flex h-11 w-11 items-center justify-center text-muted hover:text-red-600 active:scale-95"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </m.div>
                );
              })}
            </AnimatePresence>
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
        </div>

        {/* Blok --primary tinta hitam (pages/kasir.md §Warna): "Total belanja
           memakai blok --primary dengan tinta hitam, bukan teks pink" —
           sebelumnya cuma teks polos tanpa blok sama sekali, dan payment-modal
           memakai custard 30% opacity, dua treatment berbeda untuk angka yang
           sama. */}
        <div className="mt-3 flex items-center justify-between rounded-squircle-sm border-2 border-card-border bg-sweet-strawberry px-4 py-3">
          <span className="text-base font-extrabold text-main">Total Bayar</span>
          <span className="font-mono text-2xl font-black tabular-nums text-main">
            Rp {Number(totals.grandTotal.toString()).toLocaleString("id-ID")}
          </span>
        </div>

        {/* 64px Checkout Button (pos-lg per pages/kasir.md) */}
        <Button
          onClick={handleCheckoutClick}
          size="pos-lg"
          variant="primary"
          className="mt-4 w-full gap-2 text-xl shadow-hard"
        >
          <Zap className="h-5 w-5" fill="currentColor" aria-hidden="true" />
          Bayar Sekarang (Enter)
        </Button>
      </div>
    </div>
  );
}
