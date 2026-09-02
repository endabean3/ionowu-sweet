// Perintah seed mengisi database dev dengan dua tenant lengkap.
// Dipanggil lewat `make seed` — lihat docs/15-development/LOCAL-SETUP.md §4.
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/endabean3/docs-umkm-intelligence/services/pos-engine/internal/dbconn"
	"github.com/endabean3/docs-umkm-intelligence/services/pos-engine/internal/seed"
)

func main() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL wajib diisi")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	pool, err := dbconn.Open(ctx, dbURL)
	if err != nil {
		log.Fatalf("gagal terhubung ke database: %v", err)
	}
	defer pool.Close()

	report, err := seed.Run(ctx, pool)
	if err != nil {
		log.Fatalf("seed gagal: %v", err)
	}

	fmt.Println()
	fmt.Println("Seed selesai — dua tenant siap untuk uji isolasi:")
	for _, t := range report.Tenants {
		fmt.Printf("\n%s (tenant_id: %s)\n", t.Name, t.TenantID)
		fmt.Printf("  %d outlet, %d varian, %d hari riwayat\n", t.Outlets, t.Variants, 30)
		for _, u := range t.Users {
			fmt.Printf("  %-10s %-30s %s\n", u.Role, u.Email, u.Password)
		}
	}
	fmt.Println()
	fmt.Println("Password acak per-run — simpan sekarang bila perlu login manual.")
}
