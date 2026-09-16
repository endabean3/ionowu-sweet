package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCekKesehatan(t *testing.T) {
	kasus := []struct {
		nama   string
		status int
		ingin  int
	}{
		{"siap", http.StatusOK, 0},
		// /health/ready mengembalikan 503 saat Postgres tak terjangkau —
		// itulah yang harus membuat Swarm menolak versi baru.
		{"database mati", http.StatusServiceUnavailable, 1},
		{"galat server", http.StatusInternalServerError, 1},
	}
	for _, k := range kasus {
		t.Run(k.nama, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(k.status)
			}))
			defer srv.Close()
			if got := cekKesehatan(srv.URL); got != k.ingin {
				t.Errorf("status %d → kode keluar %d, ingin %d", k.status, got, k.ingin)
			}
		})
	}
}

func TestCekKesehatan_ProsesTidakJalan(t *testing.T) {
	// Port tertutup = kontainer belum/tidak melayani apa pun.
	srv := httptest.NewServer(http.NotFoundHandler())
	url := srv.URL
	srv.Close()
	if got := cekKesehatan(url); got != 1 {
		t.Errorf("server mati → kode keluar %d, ingin 1", got)
	}
}
