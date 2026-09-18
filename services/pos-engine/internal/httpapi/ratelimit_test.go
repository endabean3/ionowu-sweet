package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestRateLimiterBucket(t *testing.T) {
	now := time.Date(2026, 9, 18, 10, 0, 0, 0, time.UTC)
	l := NewRateLimiter(10)
	l.now = func() time.Time { return now }

	for i := 0; i < 10; i++ {
		if ok, _ := l.Allow("1.2.3.4"); !ok {
			t.Fatalf("permintaan ke-%d ditolak, padahal kuota 10", i+1)
		}
	}
	ok, wait := l.Allow("1.2.3.4")
	if ok {
		t.Fatal("permintaan ke-11 lolos")
	}
	if wait <= 0 || wait > 6*time.Second {
		t.Fatalf("Retry-After tidak masuk akal: %v (10/menit → satu token tiap 6 detik)", wait)
	}

	// IP lain punya kuota sendiri.
	if ok, _ := l.Allow("5.6.7.8"); !ok {
		t.Fatal("IP lain ikut terblokir")
	}

	// Setelah 6 detik tepat satu token kembali — bukan seluruh kuota.
	now = now.Add(6 * time.Second)
	if ok, _ := l.Allow("1.2.3.4"); !ok {
		t.Fatal("token tidak terisi ulang setelah 6 detik")
	}
	if ok, _ := l.Allow("1.2.3.4"); ok {
		t.Fatal("terisi ulang lebih dari satu token dalam 6 detik")
	}
}

func TestRateLimiterSweepKeepsBehaviour(t *testing.T) {
	now := time.Date(2026, 9, 18, 10, 0, 0, 0, time.UTC)
	l := NewRateLimiter(10)
	l.now = func() time.Time { return now }

	l.Allow("1.2.3.4")
	now = now.Add(2 * time.Minute)
	l.Allow("5.6.7.8") // memicu sweep
	if _, ada := l.buckets["1.2.3.4"]; ada {
		t.Fatal("bucket yang sudah penuh kembali tidak dibuang — peta akan tumbuh tanpa batas")
	}
}

func TestClientIPTakesRightmostForwardedFor(t *testing.T) {
	cases := []struct {
		name   string
		xff    []string
		remote string
		want   string
	}{
		{"tanpa proxy", nil, "10.0.0.9:5555", "10.0.0.9"},
		{"traefik saja", []string{"203.0.113.7"}, "10.0.1.2:80", "203.0.113.7"},
		// Penyerang mengirim XFF palsu; Traefik menambahkan IP aslinya di kanan.
		{"xff palsu dari klien", []string{"1.1.1.1, 203.0.113.7"}, "10.0.1.2:80", "203.0.113.7"},
		{"header berulang", []string{"1.1.1.1", "203.0.113.7"}, "10.0.1.2:80", "203.0.113.7"},
	}
	for _, c := range cases {
		r := httptest.NewRequest(http.MethodPost, "/auth/login", nil)
		r.RemoteAddr = c.remote
		for _, v := range c.xff {
			r.Header.Add("X-Forwarded-For", v)
		}
		if got := clientIP(r); got != c.want {
			t.Errorf("%s: dapat %q, mau %q", c.name, got, c.want)
		}
	}
}

func TestRateLimitMiddlewareResponds429(t *testing.T) {
	l := NewRateLimiter(1)
	h := l.Middleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	send := func() *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodPost, "/auth/login", nil)
		r.Header.Set("X-Forwarded-For", "203.0.113.7")
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w
	}

	if w := send(); w.Code != http.StatusOK {
		t.Fatalf("permintaan pertama: %d", w.Code)
	}
	w := send()
	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("permintaan kedua: %d, mau 429", w.Code)
	}
	if w.Header().Get("Retry-After") == "" {
		t.Fatal("429 tanpa Retry-After — klien tak tahu kapan boleh mencoba lagi")
	}
}
