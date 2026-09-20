package httpapi

import "testing"

// Tanpa I, L, O, U — abjad Crockford base32 yang dipakai ULID.
const ulidUji = "01K5V8QZ9E2RT6W3XY7JKNP0AB"

func TestBolehUbahStok(t *testing.T) {
	// RBAC-MODEL §Stok: terima barang, opname, dan barang rusak = owner,
	// manager, gudang. Kasir & sales hanya melihat.
	for _, role := range []string{"owner", "manager", "warehouse"} {
		if msg := bolehUbahStok(role); msg != "" {
			t.Errorf("%s harus boleh: %s", role, msg)
		}
	}
	for _, role := range []string{"cashier", "sales_floor", "", "admin"} {
		if bolehUbahStok(role) == "" {
			t.Errorf("%s TIDAK boleh mengubah stok", role)
		}
	}
}

func TestKuantitasStok(t *testing.T) {
	sah := []string{"0", "250", "0.5", "12.345", " 30 "}
	for _, v := range sah {
		if _, msg := kuantitasStok(v); msg != "" {
			t.Errorf("%q harus sah: %s", v, msg)
		}
	}
	rusak := []string{"", "abc", "-1", "1.2345", "100000000000", "1,5"}
	for _, v := range rusak {
		if _, msg := kuantitasStok(v); msg == "" {
			t.Errorf("%q harus ditolak", v)
		}
	}
}

func TestMutasiStokNormalize(t *testing.T) {
	// restock menambah, waste mengurangi — arah datang dari event_type,
	// bukan dari tanda yang diketik pengguna.
	masuk := mutasiStokReq{OutletID: ulidUji, VariantID: ulidUji, EventType: "restock", Quantity: "250"}
	if msg := masuk.normalize(); msg != "" {
		t.Fatal(msg)
	}
	if masuk.delta.String() != "250" {
		t.Fatalf("restock delta = %s", masuk.delta)
	}
	rusak := mutasiStokReq{OutletID: ulidUji, VariantID: ulidUji, EventType: "waste", Quantity: "12.5"}
	if msg := rusak.normalize(); msg != "" {
		t.Fatal(msg)
	}
	if rusak.delta.String() != "-12.5" {
		t.Fatalf("waste delta = %s", rusak.delta)
	}

	tolak := map[string]mutasiStokReq{
		"jenis tak dikenal": {OutletID: ulidUji, VariantID: ulidUji, EventType: "sale", Quantity: "1"},
		"opname lewat sini": {OutletID: ulidUji, VariantID: ulidUji, EventType: "opname_adjust", Quantity: "1"},
		"jumlah nol":        {OutletID: ulidUji, VariantID: ulidUji, EventType: "restock", Quantity: "0"},
		"outlet bukan ULID": {OutletID: "outlet_kemang", VariantID: ulidUji, EventType: "restock", Quantity: "1"},
		"varian bukan ULID": {OutletID: ulidUji, VariantID: "x", EventType: "restock", Quantity: "1"},
		"jumlah negatif":    {OutletID: ulidUji, VariantID: ulidUji, EventType: "restock", Quantity: "-5"},
	}
	for nama, req := range tolak {
		r := req
		if r.normalize() == "" {
			t.Errorf("%s: seharusnya ditolak", nama)
		}
	}
}

func TestOpnameNormalize(t *testing.T) {
	lain := "01K5V8QZ9E2RT6W3XY7JKNP0AC"
	ok := opnameInput{OutletID: ulidUji, Items: []opnameItemInput{
		{VariantID: ulidUji, CountedQuantity: "248.5"},
		{VariantID: lain, CountedQuantity: "0"},
	}}
	if msg := ok.normalize(); msg != "" {
		t.Fatal(msg)
	}
	if ok.Items[0].counted.String() != "248.5" || !ok.Items[1].counted.IsZero() {
		t.Fatalf("counted tidak terbaca: %v", ok.Items)
	}

	ganda := opnameInput{OutletID: ulidUji, Items: []opnameItemInput{
		{VariantID: ulidUji, CountedQuantity: "1"},
		{VariantID: ulidUji, CountedQuantity: "2"},
	}}
	if ganda.normalize() == "" {
		t.Error("barang ganda harus ditolak")
	}
	kosong := opnameInput{OutletID: ulidUji}
	if kosong.normalize() == "" {
		t.Error("opname tanpa barang harus ditolak")
	}
	if (&opnameInput{OutletID: "outlet_kemang", Items: ok.Items}).normalize() == "" {
		t.Error("outlet bukan ULID harus ditolak")
	}
}
