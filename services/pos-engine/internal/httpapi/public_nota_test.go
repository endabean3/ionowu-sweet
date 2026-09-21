package httpapi

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/endabean3/ionowu-sweet/services/pos-engine/internal/store"
)

func TestGaransiSampai(t *testing.T) {
	// 18 Sep 2026 23:30 WIB = 16:30 UTC. Tanggal beli menurut TOKO adalah
	// tanggal 18 — bukan 18 UTC kebetulan — jadi 7 hari = s/d 25 Sep.
	beli := time.Date(2026, 9, 18, 16, 30, 0, 0, time.UTC)
	until, loc := garansiSampai(beli, 7, "Asia/Jakarta")
	if got := until.Format("2006-01-02"); got != "2026-09-25" {
		t.Fatalf("until = %s", got)
	}
	// Masih berlaku sepanjang tanggal 25 (WIB), habis mulai tanggal 26.
	if !garansiAktif(time.Date(2026, 9, 25, 16, 59, 0, 0, time.UTC), until, loc) {
		t.Fatal("25 Sep 23:59 WIB harus masih berlaku")
	}
	if garansiAktif(time.Date(2026, 9, 25, 17, 0, 0, 0, time.UTC), until, loc) {
		t.Fatal("26 Sep 00:00 WIB harus sudah habis")
	}
	// Zona waktu rusak jatuh ke WIB, bukan panik.
	if u, _ := garansiSampai(beli, 7, "Bukan/Zona"); u.Format("2006-01-02") != "2026-09-25" {
		t.Fatalf("fallback WIB: %s", u.Format("2006-01-02"))
	}
}

func TestBolehDaftar(t *testing.T) {
	now := time.Date(2026, 9, 19, 0, 0, 0, 0, time.UTC)
	dasar := store.GetPublicNotaRow{
		PaymentStatus: "paid",
		SoldAt:        pgtype.Timestamptz{Time: now.Add(-24 * time.Hour), Valid: true},
	}
	if !bolehDaftar(dasar, now) {
		t.Fatal("nota lunas tanpa member harus boleh daftar")
	}
	cases := map[string]func(r *store.GetPublicNotaRow){
		"void":             func(r *store.GetPublicNotaRow) { r.PaymentStatus = "void" },
		"direfund":         func(r *store.GetPublicNotaRow) { r.Refunded = true },
		"sudah member":     func(r *store.GetPublicNotaRow) { r.HasMember = true },
		"sudah dipakai":    func(r *store.GetPublicNotaRow) { r.SignupUsed = true },
		"terlalu lama":     func(r *store.GetPublicNotaRow) { r.SoldAt.Time = now.Add(-31 * 24 * time.Hour) },
		"tanpa waktu jual": func(r *store.GetPublicNotaRow) { r.SoldAt.Valid = false },
	}
	for nama, ubah := range cases {
		r := dasar
		ubah(&r)
		if bolehDaftar(r, now) {
			t.Errorf("%s: seharusnya tidak boleh daftar", nama)
		}
	}
}

func TestPublicSignupNormalize(t *testing.T) {
	r := publicSignupReq{Phone: "0812-3456-7890", Name: "  Sari ", SocialHandle: " @sari.id ", FollowsStoreSocial: true}
	if msg := r.normalize(); msg != "" {
		t.Fatal(msg)
	}
	if r.Phone != "6281234567890" || r.Name != "Sari" || r.SocialHandle != "sari.id" {
		t.Fatalf("tidak dirapikan: %+v", r)
	}
	if (&publicSignupReq{Phone: "12", FollowsStoreSocial: true}).normalize() == "" {
		t.Fatal("nomor rusak harus ditolak")
	}
	if (&publicSignupReq{Phone: "081234567890"}).normalize() == "" {
		t.Fatal("belum follow TikTok harus ditolak")
	}
}

func TestKodeMemberSamaDenganKlien(t *testing.T) {
	// lib/member/member.ts: "M-" + 6 karakter terakhir ULID.
	if got := kodeMember("01K5ABCDEFGHJKMNPQRSTVWXYZ"); got != "M-TVWXYZ" {
		t.Fatalf("kode = %s", got)
	}
}

func TestUlidPola(t *testing.T) {
	for _, ok := range []string{"01K5ABCDEFGHJKMNPQRSTVWXYZ"} {
		if !ulidPola.MatchString(ok) {
			t.Errorf("%s harus sah", ok)
		}
	}
	for _, rusak := range []string{"", "01K5ABCDEFGHJKMNPQRSTVWXY", "01K5ABCDEFGHJKMNPQRSTVWXYI", "01k5abcdefghjkmnpqrstvwxyz", "../../etc/passwd"} {
		if ulidPola.MatchString(rusak) {
			t.Errorf("%q harus ditolak", rusak)
		}
	}
}

// TestKartuMemberTidakBocor menjaga batas endpoint TANPA login ini: jawaban
// boleh memuat apa yang SUDAH tercetak di kertas nota (kode & nama member),
// dan tidak lebih.
//
// Diuji lewat JSON yang benar-benar dikirim, bukan lewat daftar field di
// kepala: menambah satu kolom ke publicNotaMember kelak — nomor WA ada di
// baris yang bersebelahan di tabel customers — akan menjatuhkan uji ini.
func TestKartuMemberTidakBocor(t *testing.T) {
	var out publicNota
	out.HasMember = true
	out.Member = &publicNotaMember{
		Code: "M-AB12CD", Name: "Ibu Sari", MerchandiseGiven: true,
	}
	b, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	js := string(b)

	for _, wajib := range []string{`"code":"M-AB12CD"`, `"name":"Ibu Sari"`, `"merchandise_given":true`} {
		if !strings.Contains(js, wajib) {
			t.Errorf("kartu member kehilangan %s: %s", wajib, js)
		}
	}
	// Nomor WA TIDAK pernah tercetak di nota, jadi ia tidak pernah boleh
	// keluar dari sini — meski ia kolom sebelah di tabel yang sama.
	// Dicocokkan sebagai KUNCI JSON (`"phone":`), bukan substring: "wa"
	// polos juga cocok dengan "warranty", dan uji yang gagal karena alasan
	// yang salah akan dimatikan orang berikutnya alih-alih dipercaya.
	for _, kunci := range []string{"phone", "cost_price", "unit_cost", "total_belanja", "last_seen_at", "cashier_name"} {
		if strings.Contains(js, `"`+kunci+`":`) {
			t.Errorf("jawaban publik memuat kunci %q: %s", kunci, js)
		}
	}
}

// Nota tanpa member tidak boleh mengirim kartu kosong — klien membedakan
// "belum member" dari "member" lewat ADA atau TIDAKNYA objek ini.
func TestKartuMemberDihilangkanBilaBukanMember(t *testing.T) {
	b, err := json.Marshal(publicNota{})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(b), `"member"`) {
		t.Errorf("nota non-member tetap mengirim kunci member: %s", b)
	}
}
