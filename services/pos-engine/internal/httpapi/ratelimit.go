package httpapi

import (
	"math"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

// RateLimiter adalah token bucket per kunci (API-GUIDELINES.md §6) yang
// disimpan di memori proses.
//
// Kenapa belum Redis seperti yang dirancang REDIS-STRATEGY §3: pos-engine
// belum punya klien Redis sama sekali, sementara produksi sudah publik dan
// /auth/login bisa ditebak tanpa batas. Versi in-process ini menutup lubang
// itu tanpa infra atau variabel lingkungan baru. Konsekuensi yang HARUS
// diingat: tiap replika menghitung sendiri, jadi batas efektif per IP adalah
// `perMenit × jumlah replika api` (produksi: 2). Itu tetap memangkas tebakan
// kata sandi dari tak terbatas menjadi puluhan per menit.
type RateLimiter struct {
	mu        sync.Mutex
	buckets   map[string]*bucket
	capacity  float64
	perSecond float64
	now       func() time.Time
	lastSweep time.Time
}

type bucket struct {
	tokens float64
	last   time.Time
}

// NewRateLimiter membuat limiter dengan kapasitas `perMinute` token yang
// terisi ulang merata sepanjang satu menit.
func NewRateLimiter(perMinute int) *RateLimiter {
	return &RateLimiter{
		buckets:   make(map[string]*bucket),
		capacity:  float64(perMinute),
		perSecond: float64(perMinute) / 60,
		now:       time.Now,
	}
}

// Allow mengambil satu token untuk `key`. Bila habis, mengembalikan false
// beserta lama tunggu sampai satu token tersedia lagi.
func (l *RateLimiter) Allow(key string) (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.now()
	l.sweep(now)

	b, ok := l.buckets[key]
	if !ok {
		b = &bucket{tokens: l.capacity, last: now}
		l.buckets[key] = b
	} else {
		b.tokens = math.Min(l.capacity, b.tokens+now.Sub(b.last).Seconds()*l.perSecond)
		b.last = now
	}

	if b.tokens >= 1 {
		b.tokens--
		return true, 0
	}
	wait := time.Duration((1 - b.tokens) / l.perSecond * float64(time.Second))
	return false, wait
}

// sweep membuang bucket yang sudah penuh kembali — bucket seperti itu identik
// dengan bucket baru, jadi menghapusnya tidak mengubah perilaku. Tanpa ini,
// peta tumbuh terus oleh setiap IP yang pernah mampir.
func (l *RateLimiter) sweep(now time.Time) {
	if now.Sub(l.lastSweep) < time.Minute {
		return
	}
	l.lastSweep = now
	full := time.Duration(l.capacity / l.perSecond * float64(time.Second))
	for k, b := range l.buckets {
		if now.Sub(b.last) >= full {
			delete(l.buckets, k)
		}
	}
}

// Middleware menolak permintaan dengan 429 RATE_LIMITED (ERROR-CATALOG.md)
// dan header Retry-After bila IP klien melampaui batas.
func (l *RateLimiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ok, wait := l.Allow(clientIP(r))
		if !ok {
			w.Header().Set("Retry-After", strconv.Itoa(int(math.Ceil(wait.Seconds()))))
			RespondError(w, http.StatusTooManyRequests, "RATE_LIMITED",
				"Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// clientIP mengambil entri PALING KANAN dari X-Forwarded-For — satu-satunya
// entri yang ditulis Traefik sendiri. Entri di kirinya dikirim klien dan bisa
// dipalsukan sesukanya; memakai entri paling kiri (seperti middleware.RealIP
// milik chi) berarti penyerang cukup mengganti header tiap permintaan untuk
// mendapat kuota baru. Tanpa header (dev lokal), jatuh ke RemoteAddr.
func clientIP(r *http.Request) string {
	if xff := r.Header.Values("X-Forwarded-For"); len(xff) > 0 {
		last := xff[len(xff)-1]
		if i := strings.LastIndexByte(last, ','); i >= 0 {
			last = last[i+1:]
		}
		if ip := strings.TrimSpace(last); ip != "" {
			return ip
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
