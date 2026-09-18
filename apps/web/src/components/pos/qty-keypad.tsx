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
import { ml, takaranRacikan } from "@/lib/receipt/recipe";
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
  racikanPersen,
  onClose,
  onConfirm,
}: {
  namaProduk: string;
  uom: string;
  uomPrecision: number;
  hargaSatuan: string;
  /** Diisi saat MENGUBAH baris keranjang; kosong saat menambah baru. */
  nilaiAwal?: string;
  /** Persen bibit racikan toko; > 0 → pintasan per ukuran botol untuk ml. */
  racikanPersen?: number | null;
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

  // Racikan (Warung Wangi 65:35): untuk bibit per ml, pintasan berupa UKURAN
  // BOTOL — "Botol 30 ml" mengisi 19,5 ml bibit. Kasir tidak perlu menghitung
  // sendiri berapa ml bibit untuk botol yang diminta pembeli. Hanya takaran
  // yang sah untuk presisi satuannya (bibit 1 desimal butuh presisi ≥ 1).
  const racikan =
    uom === "ml"
      ? takaranRacikan(racikanPersen).filter(
          (t) => (t.bibit.split(".")[1]?.length ?? 0) <= uomPrecision,
        )
      : [];
  const pintasan = racikan.length > 0 ? [] : quickQuantities(uom);

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

        {racikan.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 font-sans text-xs font-bold text-main">
              Bibit untuk botol ({racikanPersen}% bibit : {100 - (racikanPersen ?? 0)}% pelarut)
            </p>
            <div className="grid grid-cols-3 gap-2">
              {racikan.map((t) => (
                <Button
                  key={t.botol}
                  type="button"
                  size="pos"
                  variant="custard"
                  className="h-auto flex-col px-1 py-2 leading-tight"
                  aria-label={`Botol ${t.botol} ml: ${ml(t.bibit)} ml bibit, ${ml(t.pelarut)} ml pelarut`}
                  onClick={() => {
                    setTeks(ml(t.bibit));
                    setError(null);
                    inputRef.current?.focus();
                  }}
                >
                  <span className="font-sans text-xs">Botol {t.botol} ml</span>
                  <span className="font-mono text-sm font-black">{ml(t.bibit)} ml</span>
                </Button>
              ))}
            </div>
          </div>
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
