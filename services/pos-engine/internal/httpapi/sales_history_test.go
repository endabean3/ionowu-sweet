package httpapi

import (
	"testing"
	"time"
)

func TestRentangRiwayat(t *testing.T) {
	// 20 Sep 2026 10:00 WIB = 03:00 UTC.
	now := time.Date(2026, 9, 20, 3, 0, 0, 0, time.UTC)

	// Bawaan: 30 hari terakhir, berakhir di AKHIR hari ini (WIB) — transaksi
	// yang baru saja terjadi harus ikut terlihat.
	mulai, akhir, msg := rentangRiwayat("", "", now)
	if msg != "" {
		t.Fatal(msg)
	}
	if got := akhir.Sub(mulai).Hours() / 24; got != 30 {
		t.Fatalf("rentang bawaan %v hari", got)
	}
	if !akhir.After(now) {
		t.Fatal("akhir rentang harus melewati waktu sekarang")
	}

	// "sampai" inklusif: transaksi pukul 23:30 WIB pada tanggal itu ikut.
	_, akhir, msg = rentangRiwayat("2026-09-01", "2026-09-20", now)
	if msg != "" {
		t.Fatal(msg)
	}
	malam := time.Date(2026, 9, 20, 16, 30, 0, 0, time.UTC) // 23:30 WIB
	if !malam.Before(akhir) {
		t.Fatal("hari terakhir harus ikut penuh")
	}

	for _, c := range [][2]string{{"20-09-2026", ""}, {"", "bukan tanggal"}, {"2026-09-20", "2026-09-01"}} {
		if _, _, msg := rentangRiwayat(c[0], c[1], now); msg == "" {
			t.Errorf("%v harus ditolak", c)
		}
	}
}

func TestBatasRiwayat(t *testing.T) {
	cases := map[string]int32{"": 50, "abc": 50, "0": 50, "-5": 50, "10": 10, "500": 200}
	for in, want := range cases {
		if got := batasRiwayat(in); got != want {
			t.Errorf("batasRiwayat(%q) = %d, mau %d", in, got, want)
		}
	}
}
