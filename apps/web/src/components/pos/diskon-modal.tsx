"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { BATAS_DISKON_KASIR, DiskonError, bacaDiskon, persenDiskon } from "@/lib/pos/diskon";
import Decimal from "decimal.js";
import { useState } from "react";

const rupiah = (v: Decimal.Value) =>
  `Rp ${new Decimal(v).toDecimalPlaces(0).toNumber().toLocaleString("id-ID")}`;

/** Potongan yang paling sering dipakai di warung, plus batas kasir. */
const CEPAT = ["5%", "10%", `${BATAS_DISKON_KASIR}%`];

/**
 * Diskon seluruh transaksi.
 *
 * Menerima nominal ("5000") maupun persen ("10%") di kolom yang sama: kasir
 * mengetik apa yang diucapkan pembeli, bukan menerjemahkannya dulu.
 */
export function DiskonModal({
  subtotal,
  nilaiAwal,
  perluPersetujuan,
  onClose,
  onSimpan,
}: {
  subtotal: Decimal;
  /** Nominal rupiah yang sedang berlaku; "0" = belum ada diskon. */
  nilaiAwal: string;
  /** true bila nominal ini akan butuh PIN manager — untuk memberi tahu kasir
   *  SEBELUM ia menekan Simpan, bukan sesudahnya. */
  perluPersetujuan: (nominal: Decimal) => boolean;
  onClose: () => void;
  onSimpan: (nominal: Decimal) => void;
}) {
  const [teks, setTeks] = useState(
    new Decimal(nilaiAwal || 0).isZero() ? "" : new Decimal(nilaiAwal).toString(),
  );

  let nominal: Decimal | null = null;
  let galat: string | null = null;
  try {
    nominal = bacaDiskon(teks, subtotal);
  } catch (err) {
    galat = err instanceof DiskonError ? err.message : "Diskon tidak valid";
  }

  const persen = nominal ? persenDiskon(nominal, subtotal) : new Decimal(0);
  const butuhPin = nominal !== null && perluPersetujuan(nominal);

  return (
    <Modal
      title="Diskon transaksi"
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <Button size="pos" variant="ghost" className="border-card-border" onClick={onClose}>
            Batal
          </Button>
          <Button
            size="pos"
            variant="primary"
            className="flex-1"
            disabled={nominal === null}
            onClick={() => nominal && onSimpan(nominal)}
          >
            {butuhPin ? "Minta PIN manager" : "Simpan diskon"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 p-4 sm:p-6">
        <p className="font-sans text-sm text-main">
          Belanja {rupiah(subtotal)}. Isi nominal rupiah (5000) atau persen (10%).
        </p>

        <Input
          label="Diskon"
          value={teks}
          onChange={(e) => setTeks(e.target.value)}
          inputMode="decimal"
          autoComplete="off"
          autoFocus
          placeholder="0"
          error={galat ?? undefined}
          hint={
            nominal && !nominal.isZero()
              ? `Potongan ${rupiah(nominal)} (${persen.toDecimalPlaces(1)}%) — bayar ${rupiah(
                  subtotal.minus(nominal),
                )}`
              : undefined
          }
        />

        <div className="flex gap-2">
          {CEPAT.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setTeks(c)}
              className="mochi-button pos-touch-target flex-1 rounded-pill border-2 border-card-border bg-card px-3 font-sans text-sm font-bold text-main shadow-hard-sm"
            >
              {c}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setTeks("")}
            className="mochi-button pos-touch-target flex-1 rounded-pill border-2 border-card-border bg-card px-3 font-sans text-sm font-bold text-main shadow-hard-sm"
          >
            Hapus
          </button>
        </div>

        {butuhPin && (
          <output className="block rounded-2xl border-2 border-card-border bg-sweet-custard p-3 font-sans text-sm font-semibold text-main">
            Diskon di atas {BATAS_DISKON_KASIR}% butuh PIN manager. PIN diperiksa di server, jadi
            perangkat harus online.
          </output>
        )}
      </div>
    </Modal>
  );
}
