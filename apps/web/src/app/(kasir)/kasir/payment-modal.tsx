"use client";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { MoneyInput } from "@/components/ui/money-input";
import type { MoneyTotal } from "@/lib/money/calc";
import { naikMasukTegas } from "@/lib/motion/tokens";
import { m } from "framer-motion";
import { Banknote, CreditCard, QrCode } from "lucide-react";
import React, { useState } from "react";

/** Rincian uang yang dihitung modal ini — diteruskan ke server APA ADANYA
 * lewat payload sync, supaya server tidak perlu (dan tidak bisa) menebak
 * subtotal/pajak dari nominal pembayaran saja. */
export interface PaymentBreakdown {
  subtotal: string;
  /** Diskon transaksi; ikut dicetak di nota dan dikirim ke server. */
  discountTotal: string;
  taxTotal: string;
  grandTotal: string;
  /** Uang yang benar-benar diserahkan pembeli. Berbeda dari nominal yang
   *  DIBEBANKAN ke tagihan (lihat catatan di tombol bayar): untuk tunai ia
   *  bisa lebih besar, dan selisihnya adalah kembalian. Hanya dipakai untuk
   *  struk — payload penjualan tetap memakai grandTotal. */
  givenAmount: number;
}

interface PaymentModalProps {
  /** Dihitung SEKALI di halaman kasir. Modal ini TIDAK boleh menghitung
   * ulang: angka yang dilihat kasir di keranjang dan yang ditagihkan di
   * sini wajib berasal dari perhitungan yang sama persis. */
  totals: MoneyTotal;
  onClose: () => void;
  onPay: (
    method: string,
    appliedAmount: number,
    breakdown: PaymentBreakdown,
  ) => void | Promise<void>;
}

export function PaymentModal({ totals, onClose, onPay }: PaymentModalProps) {
  const [method, setMethod] = useState("cash");
  const [givenAmount, setGivenAmount] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

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
    <Modal title="Pembayaran" onClose={onClose}>
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
                aria-pressed={isSelected}
                className={`pos-touch-target flex flex-col items-center gap-2 rounded-2xl border-2 p-3 font-sans font-bold transition-all shadow-hard-sm ${
                  isSelected
                    ? `border-card-border ${m.color} text-main scale-105`
                    : "border-card-border bg-surface text-main hover:bg-main/5"
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
              <label htmlFor="given_amount" className="font-sans text-sm font-bold text-main">
                Uang Diterima
              </label>
              <MoneyInput
                id="given_amount"
                className="mt-1"
                value={givenAmount}
                onChange={(e) => setGivenAmount(e.target.value)}
                placeholder="0"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => setGivenAmount(s.toString())}
                  className="mochi-button h-11 rounded-pill border-2 border-card-border bg-surface px-4 font-mono text-sm font-bold text-main shadow-hard-sm"
                >
                  Rp {s.toLocaleString("id-ID")}
                </button>
              ))}
            </div>

            {givenNum > 0 && (
              <m.div
                variants={naikMasukTegas}
                initial="sembunyi"
                animate="tampil"
                aria-live="polite"
                className={`mt-4 rounded-xl border-2 border-card-border p-4 text-center ${change >= 0 ? "bg-sweet-matcha/40" : "bg-red-100"}`}
              >
                <p className="font-sans text-sm font-bold uppercase text-main/70">
                  {change >= 0 ? "Kembalian" : "Kurang Bayar"}
                </p>
                <p className="font-mono text-2xl font-black tabular-nums text-main mt-1">
                  Rp {Math.abs(change).toLocaleString("id-ID")}
                </p>
              </m.div>
            )}
          </div>
        )}
      </div>

      <div className="sticky bottom-0 border-t-2 border-card-border bg-surface p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
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
                discountTotal: totals.discountTotal.toString(),
                taxTotal: totals.taxTotal.toString(),
                grandTotal: totals.grandTotal.toString(),
                // Non-tunai tidak punya kembalian: yang diserahkan persis
                // sebesar tagihan.
                givenAmount: method === "cash" ? givenNum : grandTotal,
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
    </Modal>
  );
}
