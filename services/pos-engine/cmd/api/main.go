// Perintah api menjalankan pos-engine — jalur checkout + shift HTTP.
package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/endabean3/ionowu-sweet/services/pos-engine/internal/config"
	"github.com/endabean3/ionowu-sweet/services/pos-engine/internal/dbconn"
	"github.com/endabean3/ionowu-sweet/services/pos-engine/internal/httpapi"
)

func main() {
	// `api healthcheck` — dipakai HEALTHCHECK di Dockerfile. Diperiksa SEBELUM
	// config.Load(): pemeriksaan kesehatan tidak boleh ikut gagal hanya
	// karena proses kecil ini tidak perlu membaca kunci JWT atau URL database.
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		port := os.Getenv("PORT")
		if port == "" {
			port = "8080"
		}
		os.Exit(cekKesehatan("http://127.0.0.1:" + port + "/health/ready"))
	}

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("konfigurasi tidak valid: %v", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	pool, err := dbconn.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("gagal terhubung ke database: %v", err)
	}
	defer pool.Close()

	router := httpapi.NewRouter(pool, cfg.JWTPublicKey, cfg.JWTPrivateKey, cfg.AllowedOrigins, cfg.AuthPerMinute)
	server := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           router,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		log.Printf("pos-engine mendengarkan di :%s", cfg.Port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server berhenti: %v", err)
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Printf("gagal shutdown rapi: %v", err)
	}
}

// cekKesehatan memanggil endpoint kesiapan dan mengembalikan kode keluar
// untuk Docker: 0 = sehat, 1 = tidak.
//
// Kenapa subperintah di biner yang sama, bukan `curl`: image ini distroless —
// tidak ada shell, wget, maupun curl, dan menambahkannya membatalkan alasan
// distroless dipilih (ADR-0008). Tanpa HEALTHCHECK, Swarm menganggap tugas
// baru "sehat" begitu prosesnya jalan; versi dengan DATABASE_URL salah tetap
// menerima trafik dan rollback otomatis (DEP-07) tidak pernah terpicu.
//
// Yang diperiksa /health/ready (mem-ping Postgres lewat PgBouncer), bukan
// /health/live: tujuan utamanya menolak versi baru yang tidak bisa melayani.
// Harganya, saat database mati sesaat Swarm ikut memulai ulang replika —
// diredam oleh --retries di Dockerfile, dan kasir tetap berjualan offline.
func cekKesehatan(url string) int {
	client := http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get(url) //nolint:noctx // proses sekali jalan, batas waktu ada di client
	if err != nil {
		fmt.Fprintln(os.Stderr, "healthcheck:", err)
		return 1
	}
	defer resp.Body.Close() //nolint:errcheck // hanya kode status yang dibaca
	if resp.StatusCode != http.StatusOK {
		fmt.Fprintf(os.Stderr, "healthcheck: status %d\n", resp.StatusCode)
		return 1
	}
	return 0
}
