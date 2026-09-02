// Package money menghitung total keranjang, validasi split payment, dan sisa
// refund — jalur uang di TESTING-STRATEGY.md §3A ("rumus uang wajib 100% unit
// tested"). Semuanya lewat decimal.Decimal; float64 tidak pernah dipakai
// (CLAUDE.md §5, §6.3).
package money

import "github.com/shopspring/decimal"

// Item adalah satu baris keranjang: qty × unit_price, dikurangi diskon baris.
type Item struct {
	Quantity  decimal.Decimal `json:"quantity"`
	UnitPrice decimal.Decimal `json:"unit_price"`
	Discount  decimal.Decimal `json:"discount"`
}

// Input adalah keranjang lengkap sebelum dihitung.
type Input struct {
	Items    []Item          `json:"items"`
	Discount decimal.Decimal `json:"discount"` // diskon tingkat keranjang, nominal absolut
	TaxRate  decimal.Decimal `json:"tax_rate"` // mis. 0.11 untuk PPN 11%
}

// Total adalah hasil kalkulasi, cocok dengan kolom sales_transactions
// (subtotal, discount_total, tax_total, grand_total — semua DECIMAL(14,2)).
type Total struct {
	Subtotal      decimal.Decimal `json:"subtotal"`
	DiscountTotal decimal.Decimal `json:"discount_total"`
	TaxTotal      decimal.Decimal `json:"tax_total"`
	GrandTotal    decimal.Decimal `json:"grand_total"`
}

// Calculate menghitung total keranjang.
//
// CATATAN PEMBULATAN: tidak ada aturan pembulatan yang terdokumentasi di
// manapun di repo ini (dicek 30-data/DATA-MODEL.md, 00-product/,
// docs/60-quality/TESTING-STRATEGY.md — hanya kewajiban MENGUJI kasus `.005`,
// bukan aturan hasilnya harus apa). Implementasi ini memakai round-half-up
// (decimal.Decimal.Round, "away from zero") sebagai ASUMSI, bukan keputusan
// yang sudah diriset. Sesuai CLAUDE.md §8 ("jangan mengarang angka"), ini
// perlu dikonfirmasi lewat ADR terpisah sebelum dianggap final.
func Calculate(in Input) Total {
	subtotal := decimal.Zero
	lineDiscounts := decimal.Zero
	for _, it := range in.Items {
		subtotal = subtotal.Add(it.UnitPrice.Mul(it.Quantity))
		lineDiscounts = lineDiscounts.Add(it.Discount)
	}

	discountTotal := lineDiscounts.Add(in.Discount)
	taxable := subtotal.Sub(discountTotal)
	if taxable.IsNegative() {
		taxable = decimal.Zero
	}

	taxTotal := taxable.Mul(in.TaxRate).Round(2)
	grandTotal := taxable.Add(taxTotal).Round(2)

	return Total{
		Subtotal:      subtotal.Round(2),
		DiscountTotal: discountTotal.Round(2),
		TaxTotal:      taxTotal,
		GrandTotal:    grandTotal,
	}
}

// SumPayments menjumlahkan seluruh baris pembayaran (FR-22 split payment —
// mis. Rp 20.000 tunai + Rp 30.000 QRIS dalam satu transaksi).
func SumPayments(payments []decimal.Decimal) decimal.Decimal {
	sum := decimal.Zero
	for _, p := range payments {
		sum = sum.Add(p)
	}
	return sum
}

// MatchesTotal membandingkan jumlah pembayaran dengan grand_total. Dipakai
// checkout handler untuk menegakkan PAYMENT_AMOUNT_MISMATCH (ERROR-CATALOG §D).
func MatchesTotal(payments []decimal.Decimal, grandTotal decimal.Decimal) bool {
	return SumPayments(payments).Equal(grandTotal)
}

// RemainingRefundable menghitung sisa yang boleh di-refund dari sebuah
// transaksi. Mengembalikan error bila permintaan melebihi sisa
// (REFUND_EXCEEDS_TOTAL, ERROR-CATALOG §B).
func RemainingRefundable(grandTotal, alreadyRefunded, requested decimal.Decimal) (decimal.Decimal, error) {
	remaining := grandTotal.Sub(alreadyRefunded)
	if requested.GreaterThan(remaining) {
		return remaining, ErrRefundExceedsTotal
	}
	return remaining.Sub(requested), nil
}
