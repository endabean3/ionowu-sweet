package money

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"
)

// Fixture JSON dibaca, bukan di-hardcode di Go, supaya berkas yang sama bisa
// dipakai mirror TypeScript nanti saat apps/web ada (TESTING-STRATEGY.md §3A:
// "kedua hasil wajib identik, termasuk pembulatan"). Mirror TS itu sendiri
// TIDAK dikerjakan di sesi ini.

type cartTotalFixture struct {
	Name  string `json:"name"`
	Items []struct {
		Quantity  string `json:"quantity"`
		UnitPrice string `json:"unit_price"`
		Discount  string `json:"discount"`
	} `json:"items"`
	Discount            string `json:"discount"`
	TaxRate             string `json:"tax_rate"`
	ExpectSubtotal      string `json:"expect_subtotal"`
	ExpectDiscountTotal string `json:"expect_discount_total"`
	ExpectTaxTotal      string `json:"expect_tax_total"`
	ExpectGrandTotal    string `json:"expect_grand_total"`
}

func loadFixtures[T any](t *testing.T, path string) []T {
	t.Helper()
	raw, err := os.ReadFile(path)
	require.NoError(t, err)
	var cases []T
	require.NoError(t, json.Unmarshal(raw, &cases))
	return cases
}

func dec(t *testing.T, s string) decimal.Decimal {
	t.Helper()
	d, err := decimal.NewFromString(s)
	require.NoError(t, err)
	return d
}

// TestCalculate menutup dua dari empat kasus tepi wajib TESTING-STRATEGY.md §4:
// pembulatan .005 dan diskon 100%.
func TestCalculate(t *testing.T) {
	for _, tc := range loadFixtures[cartTotalFixture](t, "fixtures/cart_totals.json") {
		t.Run(tc.Name, func(t *testing.T) {
			in := Input{
				Discount: dec(t, tc.Discount),
				TaxRate:  dec(t, tc.TaxRate),
			}
			for _, it := range tc.Items {
				in.Items = append(in.Items, Item{
					Quantity:  dec(t, it.Quantity),
					UnitPrice: dec(t, it.UnitPrice),
					Discount:  dec(t, it.Discount),
				})
			}

			got := Calculate(in)

			require.True(t, dec(t, tc.ExpectSubtotal).Equal(got.Subtotal), "subtotal: want %s got %s", tc.ExpectSubtotal, got.Subtotal)
			require.True(t, dec(t, tc.ExpectDiscountTotal).Equal(got.DiscountTotal), "discount_total: want %s got %s", tc.ExpectDiscountTotal, got.DiscountTotal)
			require.True(t, dec(t, tc.ExpectTaxTotal).Equal(got.TaxTotal), "tax_total: want %s got %s", tc.ExpectTaxTotal, got.TaxTotal)
			require.True(t, dec(t, tc.ExpectGrandTotal).Equal(got.GrandTotal), "grand_total: want %s got %s", tc.ExpectGrandTotal, got.GrandTotal)
		})
	}
}

type splitPaymentFixture struct {
	Name          string   `json:"name"`
	GrandTotal    string   `json:"grand_total"`
	Payments      []string `json:"payments"`
	ExpectMatches bool     `json:"expect_matches"`
}

// TestSumPayments menutup kasus tepi wajib "pembayaran gabungan" (FR-22 split
// payment).
func TestSumPayments(t *testing.T) {
	for _, tc := range loadFixtures[splitPaymentFixture](t, "fixtures/split_payments.json") {
		t.Run(tc.Name, func(t *testing.T) {
			var payments []decimal.Decimal
			for _, p := range tc.Payments {
				payments = append(payments, dec(t, p))
			}
			got := MatchesTotal(payments, dec(t, tc.GrandTotal))
			require.Equal(t, tc.ExpectMatches, got)
		})
	}
}

type refundFixture struct {
	Name            string `json:"name"`
	GrandTotal      string `json:"grand_total"`
	AlreadyRefunded string `json:"already_refunded"`
	Requested       string `json:"requested"`
	ExpectRemaining string `json:"expect_remaining"`
	ExpectError     bool   `json:"expect_error"`
}

// TestRemainingRefundable menutup kasus tepi wajib "refund parsial".
func TestRemainingRefundable(t *testing.T) {
	for _, tc := range loadFixtures[refundFixture](t, "fixtures/refunds.json") {
		t.Run(tc.Name, func(t *testing.T) {
			remaining, err := RemainingRefundable(dec(t, tc.GrandTotal), dec(t, tc.AlreadyRefunded), dec(t, tc.Requested))
			if tc.ExpectError {
				require.ErrorIs(t, err, ErrRefundExceedsTotal)
				return
			}
			require.NoError(t, err)
			require.True(t, dec(t, tc.ExpectRemaining).Equal(remaining), "remaining: want %s got %s", tc.ExpectRemaining, remaining)
		})
	}
}
