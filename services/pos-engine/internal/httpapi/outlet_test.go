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

func TestCekNotaWebURL(t *testing.T) {
	for _, ok := range []string{"https://warungwangi.ionowu.com/nota", "https://toko.id"} {
		if msg := cekNotaWebURL(ok); msg != "" {
			t.Errorf("%s: %s", ok, msg)
		}
	}
	for _, rusak := range []string{
		"http://warungwangi.ionowu.com/nota", // bukan https
		"warungwangi.ionowu.com/nota",        // tanpa skema
		"https://a.b/nota?x=1",               // query
		"https://user:pw@a.b/nota",           // kredensial
		"javascript:alert(1)",
	} {
		if cekNotaWebURL(rusak) == "" {
			t.Errorf("%q harus ditolak", rusak)
		}
	}
	p := patchOutletRequest{NotaWebURL: ptr(" https://warungwangi.ionowu.com/nota/ ")}
	if msg := p.normalize(); msg != "" || *p.NotaWebURL != "https://warungwangi.ionowu.com/nota" {
		t.Fatalf("msg=%q url=%q", msg, *p.NotaWebURL)
	}
	kosong := patchOutletRequest{NotaWebURL: ptr("")}
	if msg := kosong.normalize(); msg != "" {
		t.Fatalf("kosong = matikan QR, harus sah: %s", msg)
	}
}
