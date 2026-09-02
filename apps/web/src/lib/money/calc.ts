import Decimal from "decimal.js";

// Konfigurasi presisi Decimal.js untuk perhitungan uang
// ROUND_HALF_UP (4) adalah pembulatan standar away-from-zero (sesuai Go shopspring/decimal)
Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -9,
  toExpPos: 28,
});

export class RefundExceedsTotalError extends Error {
  constructor(message = "Nominal refund melebihi total transaksi yang tersisa") {
    super(message);
    this.name = "RefundExceedsTotalError";
  }
}

export interface MoneyItem {
  quantity: string | number | Decimal;
  unitPrice: string | number | Decimal;
  discount?: string | number | Decimal;
}

export interface MoneyInput {
  items: MoneyItem[];
  discount?: string | number | Decimal; // diskon keranjang
  taxRate?: string | number | Decimal; // misal 0.11 untuk 11%
}

export interface MoneyTotal {
  subtotal: Decimal;
  discountTotal: Decimal;
  taxTotal: Decimal;
  grandTotal: Decimal;
}

/**
 * calculateCart menghitung total keranjang kasir dengan paritas 100%
 * terhadap implementasi Go (services/pos-engine/internal/money/calc.go).
 */
export function calculateCart(input: MoneyInput): MoneyTotal {
  let subtotal = new Decimal(0);
  let lineDiscounts = new Decimal(0);

  for (const it of input.items || []) {
    const qty = new Decimal(it.quantity || 0);
    const unitPrice = new Decimal(it.unitPrice || 0);
    const lineDiscount = new Decimal(it.discount || 0);

    subtotal = subtotal.plus(unitPrice.times(qty));
    lineDiscounts = lineDiscounts.plus(lineDiscount);
  }

  const cartDiscount = new Decimal(input.discount || 0);
  const discountTotal = lineDiscounts.plus(cartDiscount);

  let taxable = subtotal.minus(discountTotal);
  if (taxable.isNegative()) {
    taxable = new Decimal(0);
  }

  const taxRate = new Decimal(input.taxRate || 0);
  const taxTotal = taxable.times(taxRate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const grandTotal = taxable.plus(taxTotal).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  return {
    subtotal: subtotal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    discountTotal: discountTotal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    taxTotal,
    grandTotal,
  };
}

/**
 * sumPayments menjumlahkan seluruh item pembayaran (split payments FR-22).
 */
export function sumPayments(payments: Array<string | number | Decimal>): Decimal {
  let sum = new Decimal(0);
  for (const p of payments) {
    sum = sum.plus(new Decimal(p || 0));
  }
  return sum;
}

/**
 * matchesTotal membandingkan total pembayaran terhadap grand total.
 */
export function matchesTotal(
  payments: Array<string | number | Decimal>,
  grandTotal: string | number | Decimal,
): boolean {
  return sumPayments(payments).equals(new Decimal(grandTotal));
}

/**
 * remainingRefundable menghitung sisa dana yang dapat direfund dari sebuah transaksi.
 */
export function remainingRefundable(
  grandTotal: string | number | Decimal,
  alreadyRefunded: string | number | Decimal,
  requested: string | number | Decimal,
): Decimal {
  const gTotal = new Decimal(grandTotal);
  const refunded = new Decimal(alreadyRefunded);
  const req = new Decimal(requested);

  const remaining = gTotal.minus(refunded);
  if (req.greaterThan(remaining)) {
    throw new RefundExceedsTotalError();
  }
  return remaining.minus(req);
}
