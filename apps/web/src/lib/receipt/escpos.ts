import Decimal from "decimal.js";
import {
  METHOD_LABEL,
  type ReceiptData,
  formatWaktu,
  lineDiscount,
  lineGross,
  receiptFooter,
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
  return (
    text
      .replace(/\s/gu, " ")
      // NFKD, bukan NFD: selain menurunkan aksen, ia juga membuka bentuk
      // "kompatibilitas" — ① → 1, ² → 2, ﬁ → fi. Katalog Warung Wangi punya
      // "Tutup ①" s.d. "Tutup ⑨"; dengan NFD kesembilannya tercetak
      // "Tutup ?" dan kasir tak bisa tahu tutup mana yang terjual.
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .replace(/×/g, "x")
      .replace(/[\u2010-\u2015\u2212]/gu, "-") // tanda pisah & minus
      .replace(/[\u2018\u2019\u201A\u2032]/gu, "'")
      .replace(/[\u201C\u201D\u201E\u2033]/gu, '"')
      .replace(/\u2044/gu, "/") // garis pecahan dari ½ → 1⁄2
      .replace(/\u2026/gu, "...")
      .replace(/[^\x20-\x7e]/gu, "?")
  );
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
  if (data.outletAddress?.trim()) out.lines(wrap(t(data.outletAddress), w));
  if (data.outletPhone?.trim()) out.lines(wrap(t(`Telp/WA ${data.outletPhone}`), w));
  out.lines(wrap(t(formatWaktu(data.occurredAt)), w));
  out.lines(wrap(t(`Kasir: ${data.cashierName}`), w));
  out.align("left").line(sep);

  for (const l of data.lines) {
    out.lines(wrap(t(l.name), w));
    // Satuan ikut dicetak untuk barang curah: "30 ml x Rp 500". Tanpa itu
    // struk parfum refill hanya berbunyi "30 x Rp 500" dan pembeli tidak
    // bisa memastikan ia ditagih untuk 30 ml, bukan 30 botol.
    // "pcs" TIDAK dicetak: "1 x Rp 4.000" sudah jelas, dan "1 pcs x" hanya
    // memakan kolom di kertas 58 mm.
    const satuan = l.uom && l.uom !== "pcs" ? ` ${t(l.uom)}` : "";
    out.lines(row(`${l.quantity}${satuan} x ${rupiah(l.unitPrice)}`, rupiah(lineGross(l)), w));
    const diskon = lineDiscount(l);
    if (diskon.gt(0)) out.lines(row("Diskon", `-${rupiah(diskon)}`, w));
  }

  out.line(sep);
  // Subtotal & pajak hanya bila ada pajak — tanpa pajak, Subtotal sama
  // persis dengan TOTAL dan hanya menambah satu baris kertas.
  if (new Decimal(data.taxTotal || "0").gt(0)) {
    out.lines(row("Subtotal", rupiah(data.subtotal), w));
    out.lines(row("Pajak", rupiah(data.taxTotal), w));
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
  out.lines(wrap(t(receiptFooter(data)), w)).align("left");

  // ESC d 4 — dorong kertas melewati gigi sobek; GS V B 0 — potong. Printer
  // tanpa pisau (mayoritas 58mm) mengabaikan perintah potong.
  out.cmd(ESC, 0x64, 4);
  out.cmd(GS, 0x56, 0x42, 0x00);

  return out.build();
}

/**
 * Halaman cetak uji: membuktikan printer tersambung DAN lebar kertasnya
 * benar sebelum pembeli pertama menunggu.
 *
 * Penggaris angka selebar tepat satu baris adalah intinya. Bila lebar yang
 * dipilih lebih besar dari kertas sebenarnya (80 mm pada printer 58 mm),
 * penggaris patah ke baris kedua — dan setiap struk nanti akan berantakan
 * dengan cara yang sama. Kasir melihatnya di sini, bukan di depan pembeli.
 */
export function encodeTestPage(paper: PaperWidth, printerName: string): Uint8Array {
  const w = COLUMNS[paper];
  const ruler = Array.from({ length: w }, (_, i) => String((i + 1) % 10)).join("");
  const out = new EscPosBuilder();

  out.cmd(ESC, 0x40);
  out.align("center").bold(true).line("CETAK UJI").bold(false);
  out.lines(wrap(toPrinterText(printerName), w));
  out.line(`Kertas ${paper} mm - ${w} kolom`);
  out.align("left").line("-".repeat(w));
  out.line(ruler);
  out.line("-".repeat(w));
  out.lines(
    wrap(
      "Angka di atas harus muat TEPAT satu baris. Bila patah ke baris kedua, pilih lebar kertas yang lebih kecil.",
      w,
    ),
  );
  out.cmd(ESC, 0x64, 4);
  out.cmd(GS, 0x56, 0x42, 0x00);
  return out.build();
}

/**
 * Teks yang BENAR-BENAR tercetak dari byte ESC/POS: perintah yang dipakai
 * encoder ini dilompati — `ESC @` (2 byte), `ESC a|E|d n` (3 byte), dan
 * `GS V B n` (4 byte) — karena argumennya bisa berupa byte cetak seperti
 * 'a' atau 'E'. (Versi pertama menganggap SEMUA perintah ESC 3 byte; reset
 * `ESC @` lalu menelan byte ESC berikutnya dan huruf 'a' dari `ESC a 1`
 * muncul di depan nama toko pada pratinjau.) Dipakai pratinjau struk di Pengaturan — pratinjau
 * disusun dari byte yang sama persis dengan yang dikirim ke printer, jadi
 * tidak mungkin berbeda dari hasil cetak.
 */
export function printedText(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === ESC) i += bytes[i + 1] === 0x40 ? 1 : 2;
    else if (bytes[i] === GS) i += 3;
    else out += String.fromCharCode(bytes[i]);
  }
  return out;
}
