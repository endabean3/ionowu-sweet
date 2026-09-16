"use client";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { playPop } from "@/lib/audio/haptics";
import {
  QuantityError,
  formatQuantity,
  parseQuantity,
  quickQuantities,
  toQuantityString,
} from "@/lib/catalog/quantity";
import type Decimal from "decimal.js";
import { useEffect, useRef, useState } from "react";

/**
 * Memasukkan jumlah untuk barang curah — 30 ml parfum, 250 g bahan kue.
 *
 * Hanya muncul untuk varian berpresisi > 0. Barang satuan (`pcs`) tidak pernah
 * melewati dialog ini: satu ketuk tetap berarti satu item, tanpa langkah
 * tambahan di jalur tersibuk kasir.
 *
 * Keyboard-first sesuai pages/kasir.md: kolom langsung terfokus, Enter
 * mengonfirmasi, Escape membatalkan (ditangani Modal). Memakai <input>
 * inputMode="decimal", bukan papan tik angka buatan sendiri — papan tik
 * bawaan sistem sudah dikenal kasir, dan pemindai barcode maupun keyboard
 * fisik tetap bisa mengetik ke sini.
 */
export function QtyKeypad({
  namaProduk,
  uom,
  uomPrecision,
  hargaSatuan,
  nilaiAwal,
  onClose,
  onConfirm,
}: {
  namaProduk: string;
  uom: string;
  uomPrecision: number;
  hargaSatuan: string;
  /** Diisi saat MENGUBAH baris keranjang; kosong saat menambah baru. */
  nilaiAwal?: string;
  onClose: () => void;
  onConfirm: (quantity: string) => void;
}) {
  const [teks, setTeks] = useState(nilaiAwal ? nilaiAwal.replace(".", ",") : "");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // Pratinjau harga dihitung dari nilai yang SAH saja. Angka setengah jadi
  // ("0,") tidak menampilkan total menyesatkan.
  let pratinjau: Decimal | null = null;
  try {
    pratinjau = parseQuantity(teks, uomPrecision).times(hargaSatuan || "0");
  } catch {
    pratinjau = null;
  }

  const kirim = () => {
    try {
      const qty = parseQuantity(teks, uomPrecision);
      playPop();
      onConfirm(toQuantityString(qty));
    } catch (err) {
      setError(err instanceof QuantityError ? err.message : "Jumlah tidak valid");
      inputRef.current?.focus();
    }
  };

  const pintasan = quickQuantities(uom);

  return (
    <Modal title="Jumlah" onClose={onClose} size="md">
      <form
        className="p-6"
        onSubmit={(e) => {
          e.preventDefault();
          kirim();
        }}
      >
        <p className="font-sans text-sm font-bold text-main">{namaProduk}</p>
        <p className="font-mono text-xs text-muted">
          Rp {Number(hargaSatuan).toLocaleString("id-ID")} per {uom}
        </p>

        <div className="mt-4 flex items-center gap-2">
          <input
            ref={inputRef}
            // decimal, bukan numeric: papan tik Android memunculkan tombol
            // koma hanya pada "decimal", dan tanpa itu kasir tidak bisa
            // mengetik 0,5 kg sama sekali.
            inputMode="decimal"
            autoComplete="off"
            aria-label={`Jumlah dalam ${uom}`}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "qty-error" : undefined}
            value={teks}
            onChange={(e) => {
              setTeks(e.target.value);
              setError(null);
            }}
            placeholder="0"
            className="pos-touch-target w-full flex-1 rounded-2xl border-2 border-card-border bg-surface px-4 py-3 text-right font-mono text-3xl font-black tabular-nums text-main outline-none focus:ring-2 focus:ring-sweet-strawberry"
          />
          <span className="font-sans text-lg font-bold text-main">{uom}</span>
        </div>

        {error ? (
          <p id="qty-error" role="alert" className="mt-2 font-sans text-sm font-bold text-red-700">
            {error}
          </p>
        ) : (
          <p className="mt-2 font-mono text-sm text-muted">
            {pratinjau
              ? `= Rp ${pratinjau.toDecimalPlaces(0).toNumber().toLocaleString("id-ID")}`
              : " "}
          </p>
        )}

        {pintasan.length > 0 && (
          <div className="mt-4 grid grid-cols-4 gap-2">
            {pintasan.map((q) => (
              <Button
                key={q}
                type="button"
                size="pos"
                variant="custard"
                className="px-2 font-mono text-sm"
                onClick={() => {
                  setTeks(q.replace(".", ","));
                  setError(null);
                  inputRef.current?.focus();
                }}
              >
                {formatQuantity(q, uom)}
              </Button>
            ))}
          </div>
        )}

        <Button type="submit" size="pos-lg" variant="primary" className="mt-6 w-full shadow-hard">
          Masukkan ke Keranjang
        </Button>
      </form>
    </Modal>
  );
}
