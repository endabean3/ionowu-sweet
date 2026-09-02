// Perintah api menjalankan pos-engine — jalur checkout + shift HTTP.
package main

import (
	"context"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"github.com/endabean3/docs-umkm-intelligence/services/pos-engine/internal/config"
	"github.com/endabean3/docs-umkm-intelligence/services/pos-engine/internal/dbconn"
	"github.com/endabean3/docs-umkm-intelligence/services/pos-engine/internal/httpapi"
)

func main() {
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

	router := httpapi.NewRouter(pool, cfg.JWTPublicKey, cfg.JWTPrivateKey)
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
