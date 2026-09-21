package httpapi

import "testing"

func TestPolaPin(t *testing.T) {
	// Angka saja, 4–8 digit: PIN diketik di mesin kasir dengan papan tik
	// numerik, sering sambil pembeli menunggu.
	for _, pin := range []string{"1234", "000000", "12345678"} {
		if !polaPin.MatchString(pin) {
			t.Errorf("%q harus diterima", pin)
		}
	}
	for _, pin := range []string{"123", "123456789", "12a4", "12 34", "", "1234\n"} {
		if polaPin.MatchString(pin) {
			t.Errorf("%q harus ditolak", pin)
		}
	}
}
