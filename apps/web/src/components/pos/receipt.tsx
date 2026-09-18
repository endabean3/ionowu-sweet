"use client";

import { formatQuantity } from "@/lib/catalog/quantity";
import {
  METHOD_LABEL,
  type ReceiptData,
  formatWaktu,
  lineDiscount,
  lineGross,
  receiptFooter,
  rupiah,
} from "@/lib/receipt/format";
import Decimal from "decimal.js";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export type { ReceiptData, ReceiptLine } from "@/lib/receipt/format";

/**
 * Struk untuk dicetak lewat `window.print()` dan @media print.
 *
 * Seluruh isinya berasal dari data yang SUDAH ada di perangkat saat transaksi
 * terjadi — keranjang, hitungan uang, shift, dan sesi login. Tidak ada satu
 * pun panggilan jaringan: struk wajib bisa dicetak saat kasir offline
 * (CLAUDE.md §6.2), justru karena itulah momen ia paling dibutuhkan.
 *
 * Ini jalur cetak PWA/browser: dialog cetak bawaan sistem menjangkau printer
 * yang terpasang dan menyediakan "Simpan sebagai PDF", jadi tetap berguna di
 * warung tanpa printer. Di APK, WebView Android mengabaikan `window.print()`;
 * di sana struk dikirim sebagai ESC/POS ke printer termal Bluetooth
 * (lib/receipt/escpos.ts, ADR-0010). Keduanya memakai lib/receipt/format.ts
 * supaya angka di kedua hasil cetak identik.
 */
export function Receipt({ data }: { data: ReceiptData }) {
  // Dipasang langsung sebagai anak <body> lewat portal. Aturan cetaknya
  // menyembunyikan seluruh saudara <body> — kalau struk ikut tersarang di
  // dalam pohon halaman, leluhurnya yang ikut tersembunyi akan menyeretnya
  // hilang juga, dan hasil cetak keluar sebagai halaman KOSONG meski
  // markup-nya benar. Ditemukan lewat uji @media print, bukan dari membaca
  // CSS-nya.
  const [siap, setSiap] = useState(false);
  useEffect(() => setSiap(true), []);
  if (!siap) return null;

  return createPortal(
    // Hanya tampil saat dicetak. Di layar ia disembunyikan lewat CSS
    // (#receipt-print-root) supaya tidak mengganggu layar kasir.
    <div id="receipt-print-root" aria-hidden="true">
      <div className="receipt">
        <div className="receipt-center receipt-bold">{data.outletName}</div>
        {data.outletAddress?.trim() && (
          <div className="receipt-center receipt-small">{data.outletAddress}</div>
        )}
        {data.outletPhone?.trim() && (
          <div className="receipt-center receipt-small">Telp/WA {data.outletPhone}</div>
        )}
        <div className="receipt-center receipt-small">{formatWaktu(data.occurredAt)}</div>
        <div className="receipt-center receipt-small">Kasir: {data.cashierName}</div>
        <div className="receipt-sep" />

        {data.lines.map((l) => {
          const diskon = lineDiscount(l);
          return (
            <div key={`${l.name}-${l.unitPrice}-${l.quantity}`} className="receipt-item">
              <div>{l.name}</div>
              <div className="receipt-row receipt-small">
                <span>
                  {l.uom && l.uom !== "pcs" ? formatQuantity(l.quantity, l.uom) : l.quantity} ×{" "}
                  {rupiah(l.unitPrice)}
                </span>
                <span>{rupiah(lineGross(l))}</span>
              </div>
              {diskon.gt(0) && (
                <div className="receipt-row receipt-small">
                  <span>Diskon</span>
                  <span>-{rupiah(diskon)}</span>
                </div>
              )}
            </div>
          );
        })}

        <div className="receipt-sep" />
        {new Decimal(data.taxTotal || "0").gt(0) && (
          <>
            <div className="receipt-row">
              <span>Subtotal</span>
              <span>{rupiah(data.subtotal)}</span>
            </div>
            <div className="receipt-row">
              <span>Pajak</span>
              <span>{rupiah(data.taxTotal)}</span>
            </div>
          </>
        )}
        <div className="receipt-row receipt-bold">
          <span>TOTAL</span>
          <span>{rupiah(data.grandTotal)}</span>
        </div>

        <div className="receipt-sep" />
        <div className="receipt-row">
          <span>{METHOD_LABEL[data.method] ?? data.method}</span>
          <span>{rupiah(data.givenAmount)}</span>
        </div>
        {data.changeAmount > 0 && (
          <div className="receipt-row receipt-bold">
            <span>Kembali</span>
            <span>{rupiah(data.changeAmount)}</span>
          </div>
        )}

        <div className="receipt-sep" />
        <div className="receipt-center receipt-small">No. {data.transactionId}</div>
        {/* Ditandai terang-terangan: struk dari transaksi offline sudah sah bagi
            pembeli, tetapi belum tentu terlihat di laporan pemilik sampai
            antreannya terkirim. Menyembunyikan ini membuat selisih laporan
            terasa seperti kehilangan uang. */}
        {data.pending && (
          <div className="receipt-center receipt-small">(belum tersinkronisasi)</div>
        )}
        <div className="receipt-center receipt-small">{receiptFooter(data)}</div>
      </div>
    </div>,
    document.body,
  );
}
