"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Struk untuk dicetak.
 *
 * Seluruh isinya berasal dari data yang SUDAH ada di perangkat saat transaksi
 * terjadi — keranjang, hitungan uang, shift, dan sesi login. Tidak ada satu
 * pun panggilan jaringan: struk wajib bisa dicetak saat kasir offline
 * (CLAUDE.md §6.2), justru karena itulah momen ia paling dibutuhkan.
 *
 * Dicetak lewat `window.print()` dan @media print, bukan lewat Web Bluetooth
 * ke printer termal: dialog cetak bawaan sistem sudah menjangkau printer yang
 * terpasang, dan di ponsel ia menyediakan "Simpan sebagai PDF" atau bagikan —
 * yang berarti struk tetap berguna di warung yang belum punya printer sama
 * sekali. Mengejar ESC/POS langsung akan mengunci fitur ini pada perangkat
 * dan merek printer tertentu.
 */

export interface ReceiptLine {
  name: string;
  quantity: number;
  unitPrice: string;
  discount: string;
}

export interface ReceiptData {
  transactionId: string;
  occurredAt: string;
  outletName: string;
  cashierName: string;
  lines: ReceiptLine[];
  subtotal: string;
  taxTotal: string;
  grandTotal: string;
  method: string;
  givenAmount: number;
  /** Kembalian; 0 untuk metode non-tunai. */
  changeAmount: number;
  /** true bila transaksi masih mengantre (dibuat saat offline). */
  pending: boolean;
}

const METHOD_LABEL: Record<string, string> = {
  cash: "Tunai",
  qris: "QRIS",
  card: "Kartu",
  transfer: "Transfer",
};

function rupiah(n: number | string): string {
  const v = typeof n === "string" ? Number(n) : n;
  return `Rp ${Math.round(v).toLocaleString("id-ID")}`;
}

export function Receipt({ data }: { data: ReceiptData }) {
  const waktu = new Date(data.occurredAt);

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
        <div className="receipt-center receipt-small">
          {waktu.toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}
        </div>
        <div className="receipt-center receipt-small">Kasir: {data.cashierName}</div>
        <div className="receipt-sep" />

        {data.lines.map((l) => {
          const bruto = Number(l.unitPrice) * l.quantity;
          const diskon = Number(l.discount || "0");
          return (
            <div key={`${l.name}-${l.unitPrice}-${l.quantity}`} className="receipt-item">
              <div>{l.name}</div>
              <div className="receipt-row receipt-small">
                <span>
                  {l.quantity} × {rupiah(l.unitPrice)}
                </span>
                <span>{rupiah(bruto)}</span>
              </div>
              {diskon > 0 && (
                <div className="receipt-row receipt-small">
                  <span>Diskon</span>
                  <span>-{rupiah(diskon)}</span>
                </div>
              )}
            </div>
          );
        })}

        <div className="receipt-sep" />
        <div className="receipt-row">
          <span>Subtotal</span>
          <span>{rupiah(data.subtotal)}</span>
        </div>
        {Number(data.taxTotal) > 0 && (
          <div className="receipt-row">
            <span>PPN</span>
            <span>{rupiah(data.taxTotal)}</span>
          </div>
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
        <div className="receipt-center receipt-small">Terima kasih 🙏</div>
      </div>
    </div>,
    document.body,
  );
}
