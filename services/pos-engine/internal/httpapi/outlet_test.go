package httpapi

import (
	"strings"
	"testing"
)

func strp(s string) *string { return &s }

func TestPatchOutletNormalize(t *testing.T) {
	r := patchOutletRequest{
		Name:          strp("  Warung Wangi Dongko  "),
		ReceiptFooter: strp("  Terima kasih, selamat wangi! \n"),
	}
	if msg := r.normalize(); msg != "" {
		t.Fatalf("payload sah ditolak: %s", msg)
	}
	if *r.Name != "Warung Wangi Dongko" || *r.ReceiptFooter != "Terima kasih, selamat wangi!" {
		t.Fatalf("spasi tidak dirapikan: %q / %q", *r.Name, *r.ReceiptFooter)
	}

	// Mengosongkan alamat/penutup adalah tindakan sah (hapus isian).
	if msg := (&patchOutletRequest{Address: strp(""), ReceiptFooter: strp("   ")}).normalize(); msg != "" {
		t.Fatalf("mengosongkan kolom opsional ditolak: %s", msg)
	}

	ditolak := map[string]patchOutletRequest{
		"nama kosong":       {Name: strp("   ")},
		"penutup kepanjang": {ReceiptFooter: strp(strings.Repeat("é", maxOutletFooter+1))},
		"alamat kepanjang":  {Address: strp(strings.Repeat("a", maxOutletAddr+1))},
		"telepon kepanjang": {Phone: strp(strings.Repeat("1", maxOutletPhone+1))},
	}
	for nama, r := range ditolak {
		if msg := r.normalize(); msg == "" {
			t.Errorf("%s: diterima, seharusnya ditolak", nama)
		}
	}

	// Batas dihitung per HURUF, bukan byte: 200 huruf beraksen tetap sah.
	if msg := (&patchOutletRequest{ReceiptFooter: strp(strings.Repeat("é", maxOutletFooter))}).normalize(); msg != "" {
		t.Fatalf("200 huruf beraksen ditolak: %s", msg)
	}
}

func TestPatchOutletGaransi(t *testing.T) {
	hari := func(n int16) *int16 { return &n }
	for _, sah := range []int16{0, 7, 365} {
		if msg := (&patchOutletRequest{WarrantyDays: hari(sah)}).normalize(); msg != "" {
			t.Errorf("%d hari ditolak: %s", sah, msg)
		}
	}
	for _, salah := range []int16{-1, 366} {
		if msg := (&patchOutletRequest{WarrantyDays: hari(salah)}).normalize(); msg == "" {
			t.Errorf("%d hari diterima", salah)
		}
	}
}

func TestPatchOutletRacikan(t *testing.T) {
	persen := func(n int16) *int16 { return &n }
	for _, sah := range []int16{0, 65, 100} {
		if msg := (&patchOutletRequest{BibitPercent: persen(sah)}).normalize(); msg != "" {
			t.Errorf("%d%% ditolak: %s", sah, msg)
		}
	}
	for _, salah := range []int16{-1, 101} {
		if msg := (&patchOutletRequest{BibitPercent: persen(salah)}).normalize(); msg == "" {
			t.Errorf("%d%% diterima", salah)
		}
	}
}
