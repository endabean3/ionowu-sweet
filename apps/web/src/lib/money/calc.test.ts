import fs from "node:fs";
import path from "node:path";
import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { RefundExceedsTotalError, calculateCart, matchesTotal, remainingRefundable } from "./calc";

const FIXTURES_DIR = path.resolve(
  __dirname,
  "../../../../../services/pos-engine/internal/money/fixtures",
);

function loadFixture<T>(filename: string): T {
  const filePath = path.join(FIXTURES_DIR, filename);
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
}

interface CartTotalFixture {
  name: string;
  items: Array<{
    quantity: string;
    unit_price: string;
    discount: string;
  }>;
  discount: string;
  tax_rate: string;
  expect_subtotal: string;
  expect_discount_total: string;
  expect_tax_total: string;
  expect_grand_total: string;
}

interface SplitPaymentFixture {
  name: string;
  grand_total: string;
  payments: string[];
  expect_matches: boolean;
}

interface RefundFixture {
  name: string;
  grand_total: string;
  already_refunded: string;
  requested: string;
  expect_remaining: string;
  expect_error: boolean;
}

describe("Money Calculation Parity Test Suite (Go ↔ TypeScript)", () => {
  it("passes all cart totals fixture cases (pembulatan .005 & diskon 100%)", () => {
    const cases = loadFixture<CartTotalFixture[]>("cart_totals.json");
    for (const tc of cases) {
      const result = calculateCart({
        items: tc.items.map((it) => ({
          quantity: it.quantity,
          unitPrice: it.unit_price,
          discount: it.discount,
        })),
        discount: tc.discount,
        taxRate: tc.tax_rate,
      });

      expect(result.subtotal.toFixed(2)).toBe(tc.expect_subtotal);
      expect(result.discountTotal.toFixed(2)).toBe(tc.expect_discount_total);
      expect(result.taxTotal.toFixed(2)).toBe(tc.expect_tax_total);
      expect(result.grandTotal.toFixed(2)).toBe(tc.expect_grand_total);
    }
  });

  it("passes all split payments fixture cases (FR-22 split payment)", () => {
    const cases = loadFixture<SplitPaymentFixture[]>("split_payments.json");
    for (const tc of cases) {
      const isMatch = matchesTotal(tc.payments, tc.grand_total);
      expect(isMatch).toBe(tc.expect_matches);
    }
  });

  it("passes all refund fixture cases (partial refund & limit check)", () => {
    const cases = loadFixture<RefundFixture[]>("refunds.json");
    for (const tc of cases) {
      if (tc.expect_error) {
        expect(() =>
          remainingRefundable(tc.grand_total, tc.already_refunded, tc.requested),
        ).toThrow(RefundExceedsTotalError);
      } else {
        const remaining = remainingRefundable(tc.grand_total, tc.already_refunded, tc.requested);
        expect(remaining.toString()).toBe(tc.expect_remaining);
      }
    }
  });
});
