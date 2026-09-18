package httpapi

import "github.com/shopspring/decimal"

// stockDeduction mengubah jumlah dalam SATUAN JUAL menjadi jumlah dalam
// SATUAN STOK (ADR-0012).
//
// Warung Wangi menjual bibit parfum per ml, tetapi stok bibitnya dihitung
// dalam gram — yang ditimbang saat opname. Penjualan 30 ml dengan faktor
// 1 g/ml mengurangi stok 30 g; nota tetap berbunyi "30 ml", dan ledger
// stock_events mencatat "-30 g".
//
// Tanpa konversi (stockUom kosong / faktor 0 / satuannya sama), jumlahnya
// dikembalikan apa adanya — perilaku semua barang lain tidak berubah.
// Hasil dibulatkan ke 3 desimal, presisi kolom stock_quantity DECIMAL(14,3).
func stockDeduction(qty decimal.Decimal, sellUom, stockUom string, factor decimal.Decimal) (decimal.Decimal, string) {
	if stockUom == "" || stockUom == sellUom || !factor.IsPositive() {
		return qty, sellUom
	}
	return qty.Mul(factor).Round(3), stockUom
}

// stockFactorString: "" bila tidak ada konversi, supaya klien tidak menerima
// faktor "0" yang menyesatkan.
func stockFactorString(stockUom string, factor decimal.Decimal) string {
	if stockUom == "" || !factor.IsPositive() {
		return ""
	}
	return factor.String()
}
