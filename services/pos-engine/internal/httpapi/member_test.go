package httpapi

import "testing"

func TestNormalizeWA(t *testing.T) {
	sama := []string{"0812-3456-7890", "+62 812 3456 7890", "812 3456 7890", "6281234567890"}
	for _, s := range sama {
		if got := normalizeWA(s); got != "6281234567890" {
			t.Errorf("%q → %q, mau 6281234567890", s, got)
		}
	}
	for _, salah := range []string{"", "12345", "0812", "abc", "1-800-123-4567", "62812345678901234"} {
		if got := normalizeWA(salah); got != "" {
			t.Errorf("%q diterima jadi %q", salah, got)
		}
	}
}

func TestSyncCustomerValidate(t *testing.T) {
	sah := func() syncCustomerPayload {
		return syncCustomerPayload{
			ID: "01M2TRJGPF6H7R3NKBJZ433XJB", Phone: "0812 3456 7890",
			MemberCode: " m-7k3qx9 ", SocialHandle: " @siti.wangi ", FollowsStoreSocial: true,
		}
	}
	p := sah()
	if msg := p.validate(); msg != "" {
		t.Fatalf("payload sah ditolak: %s", msg)
	}
	if p.Phone != "6281234567890" || p.MemberCode != "M-7K3QX9" || p.SocialHandle != "siti.wangi" {
		t.Fatalf("tidak dirapikan: %q %q %q", p.Phone, p.MemberCode, p.SocialHandle)
	}

	ditolak := map[string]func(*syncCustomerPayload){
		"belum follow":  func(p *syncCustomerPayload) { p.FollowsStoreSocial = false },
		"WA salah":      func(p *syncCustomerPayload) { p.Phone = "123" },
		"kode kosong":   func(p *syncCustomerPayload) { p.MemberCode = "" },
		"kode aneh":     func(p *syncCustomerPayload) { p.MemberCode = "M 7K3" },
		"id bukan ULID": func(p *syncCustomerPayload) { p.ID = "abc" },
	}
	for nama, ubah := range ditolak {
		p := sah()
		ubah(&p)
		if p.validate() == "" {
			t.Errorf("%s: diterima", nama)
		}
	}
}
