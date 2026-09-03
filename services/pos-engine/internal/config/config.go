// Package config membaca variabel lingkungan sesuai .env.example.
package config

import (
	"crypto/ed25519"
	"encoding/base64"
	"fmt"
	"os"
	"strings"
)

// Config menyimpan semua konfigurasi runtime pos-engine.
type Config struct {
	DatabaseURL    string
	Port           string
	JWTPublicKey   ed25519.PublicKey
	JWTPrivateKey  ed25519.PrivateKey // dibutuhkan oleh AuthHandler untuk signing
	AllowedOrigins []string           // CORS — lihat Load() untuk alasan wajib diisi
}

// Load membaca konfigurasi dari environment.
//
// Prefiks IONOWU_SWEET_ (CFG-06, fondasi-server-ionowu.md §2.6) dipakai
// untuk konfigurasi khusus aplikasi ini — persis pola
// IONOWU_<APP>_DATABASE_URL di templat referensi standar §4.5b. PORT
// dibiarkan tanpa prefiks: itu konvensi platform (Dokploy/PaaS umumnya
// meng-inject PORT polos), bukan konfigurasi khusus aplikasi.
//
// Kunci JWT:
//   - IONOWU_SWEET_JWT_PUBLIC_KEY  : base64(32 byte public key Ed25519)  — wajib
//   - IONOWU_SWEET_JWT_PRIVATE_KEY : base64(64 byte private key Ed25519) — wajib untuk /auth/*
//
// Format base64 standar, bukan URL-safe (SECURITY.md §4B).
func Load() (Config, error) {
	dbURL := os.Getenv("IONOWU_SWEET_DATABASE_URL")
	if dbURL == "" {
		return Config{}, fmt.Errorf("IONOWU_SWEET_DATABASE_URL wajib diisi")
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	rawPub := os.Getenv("IONOWU_SWEET_JWT_PUBLIC_KEY")
	if rawPub == "" {
		return Config{}, fmt.Errorf("IONOWU_SWEET_JWT_PUBLIC_KEY wajib diisi (.env.example)")
	}
	pubBytes, err := base64.StdEncoding.DecodeString(rawPub)
	if err != nil {
		return Config{}, fmt.Errorf("IONOWU_SWEET_JWT_PUBLIC_KEY bukan base64 valid: %w", err)
	}
	if len(pubBytes) != ed25519.PublicKeySize {
		return Config{}, fmt.Errorf("IONOWU_SWEET_JWT_PUBLIC_KEY harus %d byte, dapat %d", ed25519.PublicKeySize, len(pubBytes))
	}

	rawPriv := os.Getenv("IONOWU_SWEET_JWT_PRIVATE_KEY")
	if rawPriv == "" {
		return Config{}, fmt.Errorf("IONOWU_SWEET_JWT_PRIVATE_KEY wajib diisi (.env.example)")
	}
	privBytes, err := base64.StdEncoding.DecodeString(rawPriv)
	if err != nil {
		return Config{}, fmt.Errorf("IONOWU_SWEET_JWT_PRIVATE_KEY bukan base64 valid: %w", err)
	}
	if len(privBytes) != ed25519.PrivateKeySize {
		return Config{}, fmt.Errorf("IONOWU_SWEET_JWT_PRIVATE_KEY harus %d byte, dapat %d", ed25519.PrivateKeySize, len(privBytes))
	}

	// CORS — WAJIB, bukan default ke "*". apps/web (Next.js) dan pos-engine
	// SELALU berbeda origin: beda port saat dev (3000/3005 vs 8080), beda
	// domain saat produksi (app.ionowu.com vs api.ionowu.com — DOKPLOY.md
	// §4). Tanpa header Access-Control-Allow-Origin yang benar, SETIAP
	// permintaan browser ke API — login, checkout, sync, semuanya — gagal
	// "Failed to fetch" sebelum sempat menyentuh handler. Ditemukan lewat
	// uji login nyata di browser (curl tidak menegakkan CORS, jadi lolos
	// diam-diam di seluruh pengujian curl sebelumnya).
	rawOrigins := os.Getenv("IONOWU_SWEET_CORS_ORIGINS")
	if rawOrigins == "" {
		return Config{}, fmt.Errorf("IONOWU_SWEET_CORS_ORIGINS wajib diisi (daftar origin dipisah koma, mis. http://localhost:3000)")
	}
	origins := strings.Split(rawOrigins, ",")
	for i, o := range origins {
		origins[i] = strings.TrimSpace(o)
	}

	return Config{
		DatabaseURL:    dbURL,
		Port:           port,
		JWTPublicKey:   ed25519.PublicKey(pubBytes),
		JWTPrivateKey:  ed25519.PrivateKey(privBytes),
		AllowedOrigins: origins,
	}, nil
}
