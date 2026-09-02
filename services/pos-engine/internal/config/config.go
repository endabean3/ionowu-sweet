// Package config membaca variabel lingkungan sesuai .env.example.
package config

import (
	"crypto/ed25519"
	"encoding/base64"
	"fmt"
	"os"
)

// Config menyimpan semua konfigurasi runtime pos-engine.
type Config struct {
	DatabaseURL     string
	Port            string
	JWTPublicKey    ed25519.PublicKey
	JWTPrivateKey   ed25519.PrivateKey // dibutuhkan oleh AuthHandler untuk signing
}

// Load membaca konfigurasi dari environment.
//
// Kunci JWT:
//   - JWT_PUBLIC_KEY  : base64(32 byte public key Ed25519)  — wajib
//   - JWT_PRIVATE_KEY : base64(64 byte private key Ed25519) — wajib untuk /auth/*
//
// Format base64 standar, bukan URL-safe (SECURITY.md §4B).
func Load() (Config, error) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL wajib diisi")
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	rawPub := os.Getenv("JWT_PUBLIC_KEY")
	if rawPub == "" {
		return Config{}, fmt.Errorf("JWT_PUBLIC_KEY wajib diisi (.env.example)")
	}
	pubBytes, err := base64.StdEncoding.DecodeString(rawPub)
	if err != nil {
		return Config{}, fmt.Errorf("JWT_PUBLIC_KEY bukan base64 valid: %w", err)
	}
	if len(pubBytes) != ed25519.PublicKeySize {
		return Config{}, fmt.Errorf("JWT_PUBLIC_KEY harus %d byte, dapat %d", ed25519.PublicKeySize, len(pubBytes))
	}

	rawPriv := os.Getenv("JWT_PRIVATE_KEY")
	if rawPriv == "" {
		return Config{}, fmt.Errorf("JWT_PRIVATE_KEY wajib diisi (.env.example)")
	}
	privBytes, err := base64.StdEncoding.DecodeString(rawPriv)
	if err != nil {
		return Config{}, fmt.Errorf("JWT_PRIVATE_KEY bukan base64 valid: %w", err)
	}
	if len(privBytes) != ed25519.PrivateKeySize {
		return Config{}, fmt.Errorf("JWT_PRIVATE_KEY harus %d byte, dapat %d", ed25519.PrivateKeySize, len(privBytes))
	}

	return Config{
		DatabaseURL:   dbURL,
		Port:          port,
		JWTPublicKey:  ed25519.PublicKey(pubBytes),
		JWTPrivateKey: ed25519.PrivateKey(privBytes),
	}, nil
}
