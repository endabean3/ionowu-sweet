import Decimal from "decimal.js";
import {
  METHOD_LABEL,
  type ReceiptData,
  formatWaktu,
  lineDiscount,
  lineGross,
  rupiah,
} from "./format";

/**
 * Menyusun struk menjadi byte ESC/POS untuk printer termal.
 *
 * Fungsi murni tanpa akses perangkat: yang mengirim byte ke printer adalah
 * plugin native ThermalPrinter (android/.../printer/ThermalPrinterPlugin.java).
 * Dipisah supaya tata letak struk bisa diuji di vitest tanpa printer sungguhan.
 *
 * Hanya memakai perintah yang didukung hampir semua printer termal murah
 * (ESC @, ESC a, ESC E, ESC d, GS V). Font diperbesar sengaja TIDAK dipakai:
 * lebar ganda mengacaukan hitungan kolom dan dukungannya tidak seragam.
 */

export type PaperWidth = 58 | 80;

/** Karakter per baris dengan font A bawaan (12×24 titik). */
export const COLUMNS: Record<PaperWidth, number> = { 58: 32, 80: 48 };

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

/**
 * Teks aman untuk code page bawaan printer (PC437). Byte di luar ASCII
 * dicetak sebagai simbol acak yang berbeda antar-merek, jadi huruf beraksen
 * diturunkan ke huruf dasarnya dan sisanya (emoji, dll.) menjadi "?" —
 * terlihat salah, bukan diam-diam hilang.
 */
export function toPrinterText(text: string): string {
  return text
    .replace(/\s/gu, " ")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/×/g, "x")
    .replace(/[^\x20-\x7e]/gu, "?");
}

/** Bungkus per kata; kata yang lebih panjang dari satu baris dipotong paksa. */
export function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(" ").filter(Boolean)) {
    let rest = word;
    while (rest.length > width) {
      if (current) {
        lines.push(current);
        current = "";
      }
      lines.push(rest.slice(0, width));
      rest = rest.slice(width);
    }
    if (!rest) continue;
    if (!current) {
      current = rest;
    } else if (current.length + 1 + rest.length <= width) {
      current += ` ${rest}`;
    } else {
      lines.push(current);
      current = rest;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

/**
 * Label rata kiri, angka rata kanan. Bila tidak muat satu baris, label
 * dibungkus dan angka pindah ke baris sendiri — angka TIDAK PERNAH terpotong,
 * karena nominal yang terpotong di struk adalah sengketa dengan pembeli.
 */
export function row(left: string, right: string, width: number): string[] {
  const gap = width - left.length - right.length;
  if (gap >= 1) return [left + " ".repeat(gap) + right];
  return [...wrap(left, width), right.padStart(width)];
}

class EscPosBuilder {
  private readonly bytes: number[] = [];

  cmd(...bytes: number[]): this {
    this.bytes.push(...bytes);
    return this;
  }

  line(text = ""): this {
    for (const ch of toPrinterText(text)) this.bytes.push(ch.charCodeAt(0));
    this.bytes.push(LF);
    return this;
  }

  lines(texts: string[]): this {
    for (const t of texts) this.line(t);
    return this;
  }

  align(pos: "left" | "center"): this {
    return this.cmd(ESC, 0x61, pos === "center" ? 1 : 0);
  }

  bold(on: boolean): this {
    return this.cmd(ESC, 0x45, on ? 1 : 0);
  }

  build(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

export function encodeReceipt(data: ReceiptData, paper: PaperWidth = 58): Uint8Array {
  const w = COLUMNS[paper];
  const t = toPrinterText;
  const sep = "-".repeat(w);
  const out = new EscPosBuilder();

  // ESC @ — reset, supaya sisa format (tebal/rata tengah) dari cetakan
  // sebelumnya yang terputus tidak ikut terbawa ke struk ini.
  out.cmd(ESC, 0x40);

  out
    .align("center")
    .bold(true)
    .lines(wrap(t(data.outletName), w))
    .bold(false);
  out.lines(wrap(t(formatWaktu(data.occurredAt)), w));
  out.lines(wrap(t(`Kasir: ${data.cashierName}`), w));
  out.align("left").line(sep);

  for (const l of data.lines) {
    out.lines(wrap(t(l.name), w));
    out.lines(row(`${l.quantity} x ${rupiah(l.unitPrice)}`, rupiah(lineGross(l)), w));
    const diskon = lineDiscount(l);
    if (diskon.gt(0)) out.lines(row("Diskon", `-${rupiah(diskon)}`, w));
  }

  out.line(sep);
  out.lines(row("Subtotal", rupiah(data.subtotal), w));
  if (new Decimal(data.taxTotal || "0").gt(0)) {
    out.lines(row("PPN", rupiah(data.taxTotal), w));
  }
  out
    .bold(true)
    .lines(row("TOTAL", rupiah(data.grandTotal), w))
    .bold(false);

  out.line(sep);
  out.lines(row(t(METHOD_LABEL[data.method] ?? data.method), rupiah(data.givenAmount), w));
  if (data.changeAmount > 0) {
    out
      .bold(true)
      .lines(row("Kembali", rupiah(data.changeAmount), w))
      .bold(false);
  }

  out.line(sep).align("center");
  out.lines(wrap(`No. ${t(data.transactionId)}`, w));
  // Lihat catatan sejenis di receipt.tsx: struk offline sah bagi pembeli,
  // tetapi belum terlihat di laporan pemilik sampai antreannya terkirim.
  if (data.pending) out.line("(belum tersinkronisasi)");
  out.line("Terima kasih").align("left");

  // ESC d 4 — dorong kertas melewati gigi sobek; GS V B 0 — potong. Printer
  // tanpa pisau (mayoritas 58mm) mengabaikan perintah potong.
  out.cmd(ESC, 0x64, 4);
  out.cmd(GS, 0x56, 0x42, 0x00);

  return out.build();
}
