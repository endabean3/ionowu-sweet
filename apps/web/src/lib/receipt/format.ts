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
