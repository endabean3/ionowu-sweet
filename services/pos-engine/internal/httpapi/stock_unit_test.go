package httpapi

import (
	"testing"

	"github.com/shopspring/decimal"
)

func TestStockDeduction(t *testing.T) {
	d := decimal.RequireFromString
	cases := []struct {
		nama              string
		qty, factor       string
		sell, stock       string
		mauQty, mauSatuan string
	}{
		{"bibit 30 ml, 1 g/ml", "30", "1", "ml", "g", "30", "g"},
		{"bibit 30 ml, 0.92 g/ml", "30", "0.92", "ml", "g", "27.6", "g"},
		{"pecahan ml dibulatkan 3 desimal", "12.5", "0.9333", "ml", "g", "11.666", "g"},
		{"tanpa konversi: botol pcs", "2", "0", "pcs", "", "2", "pcs"},
		{"satuan sama: tak dikonversi", "5", "1", "g", "g", "5", "g"},
		{"faktor tidak sah diabaikan", "5", "-1", "ml", "g", "5", "ml"},
	}
	for _, c := range cases {
		q, u := stockDeduction(d(c.qty), c.sell, c.stock, d(c.factor))
		if !q.Equal(d(c.mauQty)) || u != c.mauSatuan {
			t.Errorf("%s: dapat %s %s, mau %s %s", c.nama, q, u, c.mauQty, c.mauSatuan)
		}
	}
}
