// Package businesstype memuat katalog jenis usaha (kategori UMKM) yang boleh
// mengisi kolom `tenants.business_type`.
//
// Sumbernya SATU berkas — catalog.json — yang ikut di-embed ke biner Go dan
// dibaca juga oleh frontend (apps/web/src/lib/business-type/), persis pola
// paritas Go↔TS yang sudah dipakai internal/money/fixtures. Alasannya: kalau
// daftar ini dikembarkan sebagai konstanta di dua bahasa, keduanya akan
// menyimpang diam-diam — pengguna memilih kategori yang ada di layar lalu
// ditolak backend, dan tidak ada yang gagal saat build.
//
// Isi katalog diturunkan dari docs/00-product/MARKET-SEGMENTS.md §3 dan §5;
// tidak ada kategori karangan di luar yang tertulis di sana (CLAUDE.md §8).
package businesstype

import (
	_ "embed"
	"encoding/json"
	"fmt"
)

//go:embed catalog.json
var catalogJSON []byte

// Archetype adalah arketipe A–F dari MARKET-SEGMENTS.md §2 — pengelompokan
// berdasarkan BENTUK DATA yang dibutuhkan, bukan sekadar label pemasaran.
type Archetype struct {
	Code  string `json:"code"`
	Label string `json:"label"`
	// Phase mengikuti urutan rilis di MARKET-SEGMENTS.md §5 ("fase-0",
	// "fase-1", "fase-2", "fase-3", "ditunda"). Dipakai frontend untuk
	// menandai kategori yang fiturnya belum digarap — BUKAN untuk menolak
	// pendaftaran: model datanya universal sejak awal (§4b).
	Phase string `json:"phase"`
}

// Category adalah satu jenis usaha yang bisa dipilih saat registrasi.
// Slug-lah yang tersimpan di kolom tenants.business_type.
type Category struct {
	Slug      string `json:"slug"`
	Label     string `json:"label"`
	Archetype string `json:"archetype"`
}

type catalog struct {
	Archetypes []Archetype `json:"archetypes"`
	Categories []Category  `json:"categories"`
}

var loaded catalog

// bySlug mempercepat Lookup — registrasi memanggilnya di jalur permintaan.
var bySlug map[string]Category

func init() {
	if err := json.Unmarshal(catalogJSON, &loaded); err != nil {
		// catalog.json ikut di-embed saat compile, jadi kegagalan di sini
		// berarti berkasnya rusak di dalam biner — bukan kondisi runtime
		// yang bisa dipulihkan, dan diam-diam melanjutkan berarti setiap
		// registrasi menolak semua kategori.
		panic(fmt.Sprintf("businesstype: catalog.json tidak bisa dibaca: %v", err))
	}
	bySlug = make(map[string]Category, len(loaded.Categories))
	for _, c := range loaded.Categories {
		bySlug[c.Slug] = c
	}
}

// Archetypes mengembalikan seluruh arketipe A–F beserta fasenya.
func Archetypes() []Archetype {
	out := make([]Archetype, len(loaded.Archetypes))
	copy(out, loaded.Archetypes)
	return out
}

// Categories mengembalikan seluruh jenis usaha yang dikenal.
func Categories() []Category {
	out := make([]Category, len(loaded.Categories))
	copy(out, loaded.Categories)
	return out
}

// Lookup mencari kategori berdasarkan slug.
func Lookup(slug string) (Category, bool) {
	c, ok := bySlug[slug]
	return c, ok
}

// IsValid melaporkan apakah slug ada di katalog.
func IsValid(slug string) bool {
	_, ok := bySlug[slug]
	return ok
}
