package httpapi

import (
	"encoding/base64"
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

func TestCekLogoNota(t *testing.T) {
	// 16×2 titik = 16/8*2 = 4 byte.
	sah := "16,2," + base64.StdEncoding.EncodeToString([]byte{0xff, 0x00, 0x0f, 0xf0})
	if msg := cekLogoNota(sah); msg != "" {
		t.Fatalf("logo sah ditolak: %s", msg)
	}
	rusak := map[string]string{
		"tanpa koma":         "abc",
		"ukuran bukan angka": "x,y,AAAA",
		"nol":                "0,2,AAAA",
		"terlalu lebar":      "584,2," + base64.StdEncoding.EncodeToString(make([]byte, 584/8*2)),
		"terlalu tinggi":     "16,241," + base64.StdEncoding.EncodeToString(make([]byte, 16/8*241)),
		"lebar bukan 8":      "12,2,AAAA",
		"base64 rusak":       "16,2,bukan base64!!",
		// Yang paling berbahaya: ukuran benar, data kurang — printer
		// memuntahkan sampah sepanjang gulungan kertas.
		"data kependekan":  "16,2," + base64.StdEncoding.EncodeToString([]byte{0xff, 0x00}),
		"data kepanjangan": "16,2," + base64.StdEncoding.EncodeToString(make([]byte, 8)),
	}
	for nama, v := range rusak {
		if cekLogoNota(v) == "" {
			t.Errorf("%s: seharusnya ditolak", nama)
		}
	}

	// Lewat normalize: "" berarti hapus logo, dan itu sah.
	if msg := (&patchOutletRequest{ReceiptLogo: ptr("")}).normalize(); msg != "" {
		t.Fatalf("hapus logo harus sah: %s", msg)
	}
	if (&patchOutletRequest{ReceiptLogo: ptr("16,2,AA")}).normalize() == "" {
		t.Fatal("logo rusak harus ditolak lewat normalize")
	}
}
