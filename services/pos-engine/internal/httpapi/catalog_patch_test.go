package httpapi

import "testing"

func str(s string) *string { return &s }

func TestPatchVariantNormalize(t *testing.T) {
	cases := []struct {
		nama  string
		req   patchVariantReq
		galat bool
	}{
		{"harga sah", patchVariantReq{Price: str("25000")}, false},
		{"harga desimal", patchVariantReq{Price: str(" 1500.50 ")}, false},
		// Dulu diabaikan diam-diam (200 OK tanpa perubahan).
		{"titik ribuan ditolak", patchVariantReq{Price: str("25.000.00")}, true},
		{"bukan angka", patchVariantReq{Price: str("dua ribu")}, true},
		{"negatif", patchVariantReq{Price: str("-1")}, true},
		{"tiga desimal uang", patchVariantReq{Price: str("1.005")}, true},
		{"uang terlalu besar", patchVariantReq{Price: str("1000000000000")}, true},
		{"uang batas atas", patchVariantReq{Price: str("999999999999.99")}, false},
		{"HPP negatif", patchVariantReq{CostPrice: str("-5")}, true},
		{"stok minimum 3 desimal", patchVariantReq{MinStockAlert: str("12.345")}, false},
		{"stok minimum 4 desimal", patchVariantReq{MinStockAlert: str("1.2345")}, true},
		{"barcode kosong = hapus", patchVariantReq{Barcode: str("  ")}, false},
	}
	for _, c := range cases {
		t.Run(c.nama, func(t *testing.T) {
			if got := c.req.normalize() != ""; got != c.galat {
				t.Fatalf("galat = %v, mau %v", got, c.galat)
			}
		})
	}

	r := patchVariantReq{Price: str(" 1500.50 "), Barcode: str("  899 "), Name: str("  30 ml ")}
	if msg := r.normalize(); msg != "" {
		t.Fatal(msg)
	}
	if !r.price.Valid || r.price.Decimal.String() != "1500.5" {
		t.Fatalf("price = %v", r.price)
	}
	if *r.Barcode != "899" || *r.Name != "30 ml" {
		t.Fatalf("tidak dirapikan: %q %q", *r.Barcode, *r.Name)
	}
	kosong := patchVariantReq{Barcode: str("  ")}
	kosong.normalize()
	if *kosong.Barcode != "" {
		t.Fatalf("barcode spasi harus jadi \"\" (= NULL di SQL), dapat %q", *kosong.Barcode)
	}
}

func TestPatchProductNormalize(t *testing.T) {
	if (&patchProductReq{Name: str("   ")}).normalize() == "" {
		t.Fatal("nama kosong harus ditolak")
	}
	r := patchProductReq{Name: str(" Bibit Parfum Lili Spicy ")}
	if msg := r.normalize(); msg != "" || *r.Name != "Bibit Parfum Lili Spicy" {
		t.Fatalf("msg=%q name=%q", msg, *r.Name)
	}
}

func TestBolehUbahKatalog(t *testing.T) {
	cases := []struct {
		role      string
		ubahHarga bool
		boleh     bool
	}{
		{"owner", true, true},
		{"owner", false, true},
		{"manager", false, true},
		{"manager", true, false},
		{"cashier", false, false},
		{"warehouse", false, false},
		{"", false, false},
	}
	for _, c := range cases {
		if got := bolehUbahKatalog(c.role, c.ubahHarga) == ""; got != c.boleh {
			t.Errorf("role=%q ubahHarga=%v: boleh=%v, mau %v", c.role, c.ubahHarga, got, c.boleh)
		}
	}
}
