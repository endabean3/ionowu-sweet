"use client";

import type { CartLine } from "@/components/pos/cart";
import { Button } from "@/components/ui/button";
import { type MoneyItem, calculateCart } from "@/lib/money/calc";
import { Banknote, CreditCard, QrCode, X } from "lucide-react";
import React, { useState } from "react";

/** Rincian uang yang dihitung modal ini — diteruskan ke server APA ADANYA
 * lewat payload sync, supaya server tidak perlu (dan tidak bisa) menebak
 * subtotal/pajak dari nominal pembayaran saja. */
export interface PaymentBreakdown {
  subtotal: string;
  taxTotal: string;
  grandTotal: string;
}

interface PaymentModalProps {
  cartItems: CartLine[];
  onClose: () => void;
  onPay: (
    method: string,
    appliedAmount: number,
    breakdown: PaymentBreakdown,
  ) => void | Promise<void>;
}

export function PaymentModal({ cartItems, onClose, onPay }: PaymentModalProps) {
  const [method, setMethod] = useState("cash");
  const [givenAmount, setGivenAmount] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const moneyItems: MoneyItem[] = cartItems.map((it) => ({
    quantity: it.quantity,
    unitPrice: it.unitPrice,
    discount: it.discount || "0",
  }));

  const totals = calculateCart({
    items: moneyItems,
    discount: "0",
    taxRate: "0.11",
  });

  const grandTotal = Number(totals.grandTotal);

  // Quick cash amounts
  const suggestions = [
    grandTotal,
    Math.ceil(grandTotal / 50000) * 50000,
    Math.ceil(grandTotal / 100000) * 100000,
  ].filter((v, i, a) => a.indexOf(v) === i);

  const givenNum = givenAmount === "" ? 0 : Number(givenAmount);
  const change = givenNum - grandTotal;
  const isEnough = givenNum >= grandTotal || method !== "cash";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-main/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-[32px] border-2 border-card-border bg-base shadow-hard-lg overflow-hidden flex flex-col">
        <div className="flex items-center justify-between border-b-2 border-card-border bg-white px-6 py-4">
          <h2 className="font-display text-xl font-bold text-main">Pembayaran</h2>
          <button type="button" onClick={onClose} className="rounded-pill p-2 hover:bg-black/5">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          {/* Blok --primary tinta hitam (pages/kasir.md §Warna) — sama
             seperti blok Total Bayar di sidebar keranjang, supaya kasir
             melihat angka yang identik dengan treatment visual yang identik
             di sepanjang alur checkout. Label pakai text-main, bukan
             text-muted: abu-abu hilang di bawah silau matahari (kasir.md). */}
          <div className="mb-6 rounded-2xl border-2 border-card-border bg-sweet-strawberry p-4 text-center">
            <p className="font-sans text-sm font-bold text-main uppercase">Total Tagihan</p>
            <p className="font-mono text-4xl font-black tabular-nums text-main mt-1">
              Rp {grandTotal.toLocaleString("id-ID")}
            </p>
          </div>

          <div className="mb-6 grid grid-cols-3 gap-3">
            {[
              { id: "cash", label: "Tunai", icon: Banknote, color: "bg-sweet-matcha" },
              { id: "qris", label: "QRIS", icon: QrCode, color: "bg-sweet-sky" },
              { id: "card", label: "Kartu", icon: CreditCard, color: "bg-sweet-taro" },
            ].map((m) => {
              const Icon = m.icon;
              const isSelected = method === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMethod(m.id)}
                  className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-3 font-sans font-bold transition-all shadow-hard-sm ${
                    isSelected
                      ? `border-card-border ${m.color} text-main scale-105`
                      : "border-card-border bg-white text-muted hover:bg-gray-50"
                  }`}
                >
                  <Icon className="h-6 w-6" />
                  <span>{m.label}</span>
                </button>
              );
            })}
          </div>

          {method === "cash" && (
            <div className="space-y-4">
              <div>
                <label htmlFor="given_amount" className="font-sans text-sm font-bold text-muted">
                  Uang Diterima
                </label>
                <div className="mt-1 flex gap-2">
                  <span className="flex items-center rounded-l-xl border-2 border-r-0 border-card-border bg-white px-4 font-mono font-bold">
                    Rp
                  </span>
                  <input
                    id="given_amount"
                    type="number"
                    value={givenAmount}
                    onChange={(e) => setGivenAmount(e.target.value)}
                    className="flex-1 rounded-r-xl border-2 border-card-border bg-white p-3 font-mono text-lg font-bold outline-none focus:ring-2 focus:ring-sweet-strawberry"
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button
                    type="button"
                    key={s}
                    onClick={() => setGivenAmount(s.toString())}
                    className="rounded-pill border-2 border-card-border bg-white px-4 py-2 font-mono text-sm font-bold text-main hover:bg-sweet-custard/50 shadow-hard-sm"
                  >
                    Rp {s.toLocaleString("id-ID")}
                  </button>
                ))}
              </div>

              {givenNum > 0 && (
                <div
                  className={`mt-4 rounded-xl border-2 border-card-border p-4 text-center ${change >= 0 ? "bg-sweet-matcha/40" : "bg-red-100"}`}
                >
                  <p className="font-sans text-sm font-bold uppercase text-main/70">
                    {change >= 0 ? "Kembalian" : "Kurang Bayar"}
                  </p>
                  <p className="font-mono text-2xl font-black tabular-nums text-main mt-1">
                    Rp {Math.abs(change).toLocaleString("id-ID")}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t-2 border-card-border bg-white p-6">
          <Button
            variant="primary"
            className="w-full h-14 text-lg shadow-hard"
            onClick={async () => {
              // Guard submit-ganda. Dua ketukan cepat pada tombol ini
              // SEBELUMNYA menghasilkan DUA transaksi dengan ULID berbeda —
              // pelanggan ter-charge dua kali dan idempotensi server tidak
              // bisa menolongnya (ULID-nya memang beda). Terbukti lewat
              // dua klik sinkron nyata di browser, bukan dugaan.
              if (submitting) return;
              setSubmitting(true);
              try {
                // grandTotal, BUKAN givenNum — jumlah pembayaran yang dicatat
                // harus nominal yang DITERAPKAN ke tagihan. givenNum (uang
                // tunai diterima kasir) bisa lebih besar karena ada kembalian
                // (mis. bayar Rp 50.000 untuk tagihan Rp 27.750); mengirim
                // givenNum sebagai payments[0].amount membuat server menolak
                // PAYMENT_AMOUNT_MISMATCH karena jumlah pembayaran ≠ total.
                await onPay(method, grandTotal, {
                  subtotal: totals.subtotal.toString(),
                  taxTotal: totals.taxTotal.toString(),
                  grandTotal: totals.grandTotal.toString(),
                });
              } finally {
                setSubmitting(false);
              }
            }}
            disabled={!isEnough || submitting}
          >
            {submitting ? "Memproses…" : "Selesaikan Pembayaran"}
          </Button>
        </div>
      </div>
    </div>
  );
}
