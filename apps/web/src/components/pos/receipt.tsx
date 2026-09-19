"use client";

import { code128Bars } from "@/lib/barcode/code128";
import { qrSvgPath } from "@/lib/barcode/qr";
import { formatQuantity } from "@/lib/catalog/quantity";
import {
  METHOD_LABEL,
  type ReceiptData,
  adaBibitMl,
  formatWaktu,
  lineDiscount,
  lineGross,
  notaQrJudul,
  receiptFooter,
  rupiah,
  warrantyLine,
} from "@/lib/receipt/format";
import { ml, takaranRacikan } from "@/lib/receipt/recipe";
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

        {adaBibitMl(data) && takaranRacikan(data.recipePercent).length > 0 && (
          <>
            <div className="receipt-sep" />
            <div className="receipt-center receipt-bold">
              Racikan {data.recipePercent}% bibit : {100 - (data.recipePercent ?? 0)}% pelarut
            </div>
            {takaranRacikan(data.recipePercent).map((t) => (
              <div key={t.botol} className="receipt-row receipt-small">
                <span>Botol {t.botol} ml</span>
                <span>
                  {ml(t.bibit)} + {ml(t.pelarut)} ml
                </span>
              </div>
            ))}
          </>
        )}

        {data.member && (
          <>
            <div className="receipt-sep" />
            <div className="receipt-center receipt-bold">
              Member {data.member.code}
              {data.member.name ? ` (${data.member.name})` : ""}
            </div>
            {data.member.bonuses.map((b) => (
              <div key={b} className="receipt-center receipt-small">
                Bonus: {b}
              </div>
            ))}
            <BarcodeMember kode={data.member.code} />
          </>
        )}

        {data.notaUrl && (
          <>
            <div className="receipt-sep" />
            <div className="receipt-center receipt-bold">{notaQrJudul(data)}</div>
            <div className="receipt-center receipt-small">Scan QR dengan kamera HP</div>
            <QrNota url={data.notaUrl} />
          </>
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
        {warrantyLine(data) && (
          <div className="receipt-center receipt-bold">{warrantyLine(data)}</div>
        )}
        <div className="receipt-center receipt-small">{receiptFooter(data)}</div>
      </div>
    </div>,
    document.body,
  );
}

/** QR halaman nota publik (ADR-0013) — matriks sama dengan versi printer. */
function QrNota({ url }: { url: string }) {
  let q: ReturnType<typeof qrSvgPath>;
  try {
    q = qrSvgPath(url);
  } catch {
    return null; // tautan terlalu panjang untuk QR: nota tetap tercetak
  }
  return (
    <svg
      className="receipt-qr"
      viewBox={`0 0 ${q.size} ${q.size}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="QR cek garansi dan daftar member"
    >
      <rect width={q.size} height={q.size} fill="#fff" />
      <path d={q.d} fill="#000" />
    </svg>
  );
}

/**
 * Barcode CODE128 kode member untuk nota browser/PWA — printer termal
 * menggambar barcode sendiri (ESC/POS), jalur ini untuk semua cetakan lain,
 * supaya pelanggan selalu bisa memindai kodenya dari nota.
 * Zona tenang 10 modul di kiri-kanan: tanpa itu banyak pemindai gagal membaca.
 */
function BarcodeMember({ kode }: { kode: string }) {
  let hasil: ReturnType<typeof code128Bars>;
  try {
    hasil = code128Bars(kode);
  } catch {
    return null; // kode aneh: teks "Member …" di atas tetap tercetak
  }
  const tenang = 10;
  const lebar = hasil.total + tenang * 2;
  return (
    <svg
      className="receipt-barcode"
      viewBox={`0 0 ${lebar} 40`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Barcode member ${kode}`}
    >
      <rect x="0" y="0" width={lebar} height="40" fill="#fff" />
      {hasil.bars.map((b) => (
        <rect key={b.x} x={b.x + tenang} y="0" width={b.w} height="40" fill="#000" />
      ))}
    </svg>
  );
}
