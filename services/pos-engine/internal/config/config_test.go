package config

import (
	"crypto/ed25519"
	"encoding/base64"
	"testing"
)

func setWajib(t *testing.T) {
	t.Helper()
	pub, priv, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("IONOWU_SWEET_DATABASE_URL", "postgres://x@localhost/x")
	t.Setenv("IONOWU_SWEET_JWT_PUBLIC_KEY", base64.StdEncoding.EncodeToString(pub))
	t.Setenv("IONOWU_SWEET_JWT_PRIVATE_KEY", base64.StdEncoding.EncodeToString(priv))
	t.Setenv("IONOWU_SWEET_CORS_ORIGINS", "http://localhost:3000")
}

func TestAuthRateBawaan10(t *testing.T) {
	setWajib(t)
	t.Setenv("IONOWU_SWEET_AUTH_RATE_PER_MINUTE", "")
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.AuthPerMinute != 10 {
		t.Fatalf("bawaan %d, mau 10 (API-GUIDELINES §6)", cfg.AuthPerMinute)
	}
}

func TestAuthRateBisaDinaikkanUntukCI(t *testing.T) {
	setWajib(t)
	t.Setenv("IONOWU_SWEET_AUTH_RATE_PER_MINUTE", "1000")
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.AuthPerMinute != 1000 {
		t.Fatalf("dapat %d, mau 1000", cfg.AuthPerMinute)
	}
}

// Tidak ada nilai yang mematikan rate limit: salah ketik di panel Dokploy
// harus membuat layanan gagal start, bukan diam-diam membuka brute-force.
func TestAuthRateTidakBisaDimatikan(t *testing.T) {
	for _, v := range []string{"0", "-5", "sepuluh", "10.5"} {
		setWajib(t)
		t.Setenv("IONOWU_SWEET_AUTH_RATE_PER_MINUTE", v)
		if _, err := Load(); err == nil {
			t.Errorf("%q diterima, seharusnya ditolak", v)
		}
	}
}
