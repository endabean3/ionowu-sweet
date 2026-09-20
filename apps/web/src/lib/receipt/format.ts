import Decimal from "decimal.js";

/**
 * Data dan format struk yang dipakai BERSAMA oleh dua jalur cetak: struk HTML
 * (`window.print()`, components/pos/receipt.tsx) dan ESC/POS ke printer termal
 * Bluetooth (./escpos.ts). Satu sumber supaya angka dan label di kedua hasil
 * cetak tidak pernah berbeda.
 */

export interface ReceiptLine {
  name: string;
  /**
   * String desimal, BUKAN number: barang curah dijual 30 ml atau 0,5 kg
   * (lib/catalog/quantity.ts). `lineGross` di bawah menerimanya apa adanya
   * lewat Decimal, jadi tidak pernah melewati float.
   */
  quantity: string;
  unitPrice: string;
  discount: string;
  /** Satuan jual; dicetak di struk supaya "30" tidak ambigu. */
  uom?: string;
}

export interface ReceiptMember {
  code: string;
  name?: string;
  /** Bonus yang diberikan kasir, dicetak sebagai bukti (mis. "1 tester"). */
  bonuses: string[];
}

export interface ReceiptData {
  transactionId: string;
  occurredAt: string;
  outletName: string;
  /** Profil toko dari Pengaturan (outlets.address/phone/receipt_footer).
   *  Kosong = baris itu tidak dicetak; footer kosong = "Terima kasih". */
  outletAddress?: string | null;
  outletPhone?: string | null;
  footer?: string | null;
  /** Member yang ditempelkan kasir; kosong = transaksi tanpa member. */
  member?: ReceiptMember | null;
  /** Persen bibit racikan (Pengaturan); 0/kosong = tabel takaran tidak dicetak. */
  recipePercent?: number | null;
  /** Lama garansi (hari) dari Pengaturan; 0/kosong = tidak dicetak. */
  warrantyDays?: number | null;
  /** Tautan halaman nota publik (ADR-0013) yang dicetak sebagai QR;
   *  kosong = nota tanpa QR. Susun dengan `notaWebLink`. */
  notaUrl?: string | null;
  /** Logo kepala nota: bitmap 1-bit "<lebar>,<tinggi>,<base64>" dari
   *  Pengaturan (migrasi 00016). Kosong = nota tanpa logo. */
  logo?: string | null;
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

export const METHOD_LABEL: Record<string, string> = {
  cash: "Tunai",
  qris: "QRIS",
  card: "Kartu",
  transfer: "Transfer",
};

/**
 * Rupiah tanpa desimal, pemisah ribuan titik. Dibulatkan half-up lewat
 * Decimal, bukan `Math.round(Number(...))` — sama dengan asumsi pembulatan di
 * lib/money (CLAUDE.md §7), dan tidak melewati float (CLAUDE.md §6.3).
 */
export function rupiah(value: Decimal.Value): string {
  const bulat = new Decimal(value).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const digit = bulat
    .abs()
    .toFixed(0)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${bulat.isNegative() && !bulat.isZero() ? "-" : ""}Rp ${digit}`;
}

export function lineGross(line: ReceiptLine): Decimal {
  return new Decimal(line.unitPrice).mul(line.quantity);
}

export function lineDiscount(line: ReceiptLine): Decimal {
  return new Decimal(line.discount || "0");
}

export function formatWaktu(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" });
}

/** Penutup struk: isian pemilik, atau "Terima kasih" bila kosong. */
export function receiptFooter(data: Pick<ReceiptData, "footer">): string {
  return data.footer?.trim() || "Terima kasih";
}

/**
 * "Garansi s/d 26/09/2026" — tanggal beli + N hari, dalam zona waktu
 * perangkat (sama dengan jam di nota). null bila tanpa garansi.
 */
export function warrantyLine(
  data: Pick<ReceiptData, "occurredAt" | "warrantyDays">,
): string | null {
  const hari = data.warrantyDays ?? 0;
  if (!Number.isInteger(hari) || hari <= 0) return null;
  const sampai = new Date(new Date(data.occurredAt).getTime() + hari * 86_400_000);
  const tgl = sampai.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return `Garansi ${hari} hari s/d ${tgl}`;
}

/** Tabel takaran hanya relevan bila nota memuat bibit yang dijual per ml. */
export function adaBibitMl(data: Pick<ReceiptData, "lines">): boolean {
  return data.lines.some((l) => l.uom === "ml");
}

/**
 * Tautan halaman nota publik di web toko (ADR-0013):
 * `<nota_web_url>/<tenant_id>/<id nota>`. Id berupa PATH, bukan query:
 * lebih pendek (QR lebih kecil) dan rute web toko cukup `/nota/[t]/[i]`.
 * Kosong bila toko belum mengisi alamat web nota di Pengaturan.
 */
export function notaWebLink(
  base: string | null | undefined,
  tenantId: string | null | undefined,
  transactionId: string,
): string | null {
  const b = base?.trim().replace(/\/+$/, "");
  if (!b || !tenantId) return null;
  return `${b}/${tenantId}/${transactionId}`;
}

/** Judul blok QR: nota member tidak ditawari daftar member lagi. */
export function notaQrJudul(data: Pick<ReceiptData, "member">): string {
  return data.member ? "Cek garansi nota ini" : "Cek garansi & daftar member";
}

/**
 * Kode nota yang dicetak sebagai BARCODE 1D di nota: 6 karakter terakhir id
 * transaksi — sama dengan akhiran `receipt_number` di server
 * ("20260920063109-CVG6ZS"), jadi memindainya langsung menemukan notanya di
 * layar Riwayat.
 *
 * Kenapa bukan id penuh (26 karakter): CODE128 26 karakter butuh ±341 modul,
 * dan kertas 58 mm hanya 384 titik — modulnya jadi 1 titik (0,125 mm), di
 * bawah batas baca pemindai genggam murah. Enam karakter tercetak dengan
 * modul 2 titik (±33 mm) dan terbaca andal. Id penuh tetap dicetak sebagai
 * teks "No. …" di bawahnya.
 */
export function kodeNota(transactionId: string): string {
  return transactionId.slice(-6).toUpperCase();
}
