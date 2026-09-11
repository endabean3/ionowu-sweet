package businesstype

import "testing"

// Katalog ini dibaca dua bahasa dan tersimpan sebagai data tenant, jadi cacat
// bentuknya baru terasa jauh di kemudian hari: slug kembar membuat Lookup
// mengembalikan kategori yang salah, arketipe yatim membuat frontend
// kehilangan grupnya. Murah diuji sekarang, mahal ditemukan nanti.

func TestSlugUnikDanTerisi(t *testing.T) {
	seen := make(map[string]bool)
	for _, c := range Categories() {
		if c.Slug == "" || c.Label == "" {
			t.Errorf("kategori dengan field kosong: %+v", c)
		}
		if seen[c.Slug] {
			t.Errorf("slug kembar: %q", c.Slug)
		}
		seen[c.Slug] = true
	}
}

func TestSetiapKategoriPunyaArketipe(t *testing.T) {
	known := make(map[string]bool)
	for _, a := range Archetypes() {
		known[a.Code] = true
	}
	for _, c := range Categories() {
		if !known[c.Archetype] {
			t.Errorf("kategori %q menunjuk arketipe tidak dikenal: %q", c.Slug, c.Archetype)
		}
	}
}

func TestArketipePunyaFase(t *testing.T) {
	valid := map[string]bool{
		"fase-0": true, "fase-1": true, "fase-2": true, "fase-3": true, "ditunda": true,
	}
	for _, a := range Archetypes() {
		if !valid[a.Phase] {
			t.Errorf("arketipe %q punya fase tidak dikenal: %q", a.Code, a.Phase)
		}
	}
}

// Warung Wangi adalah salah satu dari dua pelanggan yang sudah pasti
// (CLAUDE.md §2). Kategorinya wajib ada, dan wajib arketipe B.
func TestKategoriParfumRefilAda(t *testing.T) {
	c, ok := Lookup("parfum_refill")
	if !ok {
		t.Fatal("kategori parfum_refill hilang dari katalog")
	}
	if c.Archetype != "B" {
		t.Errorf("parfum_refill harus arketipe B, dapat %q", c.Archetype)
	}
}

func TestIsValidMenolakSlugAsing(t *testing.T) {
	if IsValid("tidak_ada_di_katalog") {
		t.Error("IsValid menerima slug yang tidak ada di katalog")
	}
	if IsValid("") {
		t.Error("IsValid menerima slug kosong")
	}
}
