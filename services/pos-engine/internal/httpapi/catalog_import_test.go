package httpapi

import (
	"strings"
	"testing"
)

func baris(csvLine string) []string { return strings.Split(csvLine, ",") }

func TestParseBarisImpor_BarisSah(t *testing.T) {
	b, alasan := parseBarisImpor(baris("Bibit Vanilla,Stok lama,,,1000,,ml,1,,stock"))
	if alasan != "" {
		t.Fatalf("baris sah ditolak: %s", alasan)
	}
	if b.uom != "ml" || b.uomPrecision != 1 {
		t.Errorf("satuan = %s/%d, ingin ml/1", b.uom, b.uomPrecision)
	}
	if !b.stockQty.IsZero() {
		t.Errorf("stok kosong harus jadi 0, dapat %s", b.stockQty)
	}
	if b.barcode != nil || b.sku != nil {
		t.Error("SKU/barcode kosong harus NULL, bukan string kosong")
	}
}

// ⭐ Inti perbaikan: harga kosong dulunya menjadi Rp 0 dan barangnya bisa
// terjual gratis.
func TestParseBarisImpor_HargaKosongDitolak(t *testing.T) {
	for _, line := range []string{
		"Menyan Putih,Reguler,,,,,pcs,0,1,stock",
		"Menyan Putih,Reguler,,,-,,pcs,0,1,stock",
		"Menyan Putih,Reguler,,,abc,,pcs,0,1,stock",
	} {
		if _, alasan := parseBarisImpor(baris(line)); alasan == "" {
			t.Errorf("harga tidak sah diterima: %q", line)
		}
	}
}

func TestParseBarisImpor_HargaNolEksplisitDiterima(t *testing.T) {
	// "0" yang DITULIS berbeda dari kolom kosong — itu keputusan sadar.
	if _, alasan := parseBarisImpor(baris("Sampel Gratis,Reguler,,,0,,pcs,0,5,stock")); alasan != "" {
		t.Errorf("harga 0 eksplisit ditolak: %s", alasan)
	}
}

func TestParseBarisImpor_StokNegatifDiterima(t *testing.T) {
	// Invarian #4: transaksi offline boleh membuat stok negatif.
	b, alasan := parseBarisImpor(baris("Tutup,Reguler,,,1000,,pcs,0,-3,stock"))
	if alasan != "" {
		t.Fatalf("stok negatif ditolak: %s", alasan)
	}
	if b.stockQty.String() != "-3" {
		t.Errorf("stok = %s, ingin -3", b.stockQty)
	}
}

func TestParseBarisImpor_Penolakan(t *testing.T) {
	kasus := map[string]string{
		"kolom kurang":             "Nama,Varian,,,1000",
		"nama kosong":              ",Varian,,,1000,,pcs,0,1,stock",
		"presisi di luar 0-3":      "Bibit,Varian,,,1000,,ml,5,,stock",
		"stok bukan angka":         "Tutup,Reguler,,,1000,,pcs,0,banyak,stock",
		"desimal melebihi presisi": "Tutup,Reguler,,,1000,,pcs,0,1.5,stock",
		"jenis barang asing":       "Tutup,Reguler,,,1000,,pcs,0,1,barang",
		"harga modal rusak":        "Tutup,Reguler,,,1000,murah,pcs,0,1,stock",
	}
	for nama, line := range kasus {
		if _, alasan := parseBarisImpor(baris(line)); alasan == "" {
			t.Errorf("%s: seharusnya ditolak", nama)
		}
	}
}

func TestParseBarisImpor_DesimalSesuaiPresisiDiterima(t *testing.T) {
	if _, alasan := parseBarisImpor(baris("Bibit,Varian,,,1000,,ml,1,237.5,stock")); alasan != "" {
		t.Errorf("237.5 ml dengan presisi 1 ditolak: %s", alasan)
	}
}

func TestParseBarisImpor_SatuanStokGram(t *testing.T) {
	// Bibit dijual per ml, stoknya gram (ADR-0012). Stok 250.5 g sah
	// walaupun presisi JUAL-nya 1 desimal.
	b, alasan := parseBarisImpor(baris("Macbrame Scandal Vica,Reguler,WW-084,,1000,,ml,1,250.55,stock,g,0.92"))
	if alasan != "" {
		t.Fatalf("baris sah ditolak: %s", alasan)
	}
	if b.stockUom != "g" || b.stockFactor.String() != "0.92" || b.stockQty.String() != "250.55" {
		t.Fatalf("satuan stok salah: %q %s %s", b.stockUom, b.stockFactor, b.stockQty)
	}

	// Faktor kosong = 1 g per ml.
	b, _ = parseBarisImpor(baris("Laverne Vanilla Lucy,Reguler,,,2000,,ml,1,100,stock,g,"))
	if b.stockFactor.String() != "1" {
		t.Fatalf("faktor bawaan %s, mau 1", b.stockFactor)
	}

	// Satuan stok sama dengan satuan jual = tanpa konversi.
	b, _ = parseBarisImpor(baris("Dupa,Reguler,,,2000,,pack,0,45,stock,pack,"))
	if b.stockUom != "" {
		t.Fatalf("satuan sama tetap dikonversi: %q", b.stockUom)
	}

	for _, line := range []string{
		"Bibit,Reguler,,,1000,,ml,1,100,stock,g,0",
		"Bibit,Reguler,,,1000,,ml,1,100,stock,g,-1",
		"Bibit,Reguler,,,1000,,ml,1,100,stock,g,satu",
		"Bibit,Reguler,,,1000,,ml,1,100.0001,stock,g,1",
	} {
		if _, alasan := parseBarisImpor(baris(line)); alasan == "" {
			t.Errorf("seharusnya ditolak: %s", line)
		}
	}
}
