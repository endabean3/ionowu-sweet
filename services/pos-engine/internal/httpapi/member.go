package httpapi

import (
	"context"
	"errors"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5/pgconn"

	"github.com/endabean3/ionowu-sweet/services/pos-engine/internal/store"
)

// Member pelanggan (migrasi 00012). Didaftarkan di PERANGKAT — bisa saat
// offline — lalu dikirim lewat /sync/push sebelum penjualan yang memakainya.

var memberCodePola = regexp.MustCompile(`^[A-Z0-9][A-Z0-9-]{3,19}$`)

// normalizeWA membakukan nomor WhatsApp Indonesia ke bentuk 62xxxxxxxxxx.
// Bentuk baku ini yang dijaga unik per tenant (idx_customers_phone), jadi
// "0812-3456-7890", "+62 812 3456 7890", dan "812 3456 7890" adalah orang
// yang SAMA. Mengembalikan "" bila bukan nomor yang masuk akal.
func normalizeWA(raw string) string {
	var b strings.Builder
	for _, r := range raw {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	d := b.String()
	switch {
	case strings.HasPrefix(d, "62"):
	case strings.HasPrefix(d, "0"):
		d = "62" + d[1:]
	case strings.HasPrefix(d, "8"):
		d = "62" + d
	default:
		return ""
	}
	if len(d) < 10 || len(d) > 15 {
		return ""
	}
	return d
}

// normalizeHandle merapikan akun media sosial: tanpa spasi dan tanpa "@"
// di depan ("@warungwangi" dan "warungwangi" sama).
func normalizeHandle(raw string) string {
	return strings.TrimPrefix(strings.TrimSpace(raw), "@")
}

type syncCustomerPayload struct {
	ID                 string    `json:"id"`
	Name               string    `json:"name"`
	Phone              string    `json:"phone"`
	MemberCode         string    `json:"member_code"`
	SocialHandle       string    `json:"social_handle"`
	FollowsStoreSocial bool      `json:"follows_store_social"`
	CreatedAt          time.Time `json:"created_at"`
}

// validate merapikan dan memeriksa payload member. Fungsi murni.
func (p *syncCustomerPayload) validate() string {
	p.Name = strings.TrimSpace(p.Name)
	p.MemberCode = strings.ToUpper(strings.TrimSpace(p.MemberCode))
	p.SocialHandle = normalizeHandle(p.SocialHandle)
	if len(p.ID) != 26 {
		return "id member tidak valid"
	}
	if p.Phone = normalizeWA(p.Phone); p.Phone == "" {
		return "nomor WA tidak valid"
	}
	if !memberCodePola.MatchString(p.MemberCode) {
		return "kode member tidak valid"
	}
	if !p.FollowsStoreSocial {
		// Syarat toko: calon member wajib follow akun media sosial toko.
		return "calon member belum follow akun toko"
	}
	if utf8.RuneCountInString(p.Name) > 200 || utf8.RuneCountInString(p.SocialHandle) > 100 {
		return "nama atau akun sosial media terlalu panjang"
	}
	return ""
}

func (h *SyncHandler) applyCustomer(ctx context.Context, q *store.Queries, tenantID string, raw map[string]interface{}) (status, detail string) {
	var p syncCustomerPayload
	if err := mapToStruct(raw, &p); err != nil {
		return "rejected", "payload member tidak valid"
	}
	if msg := p.validate(); msg != "" {
		return "rejected", msg
	}
	createdAt := p.CreatedAt
	if createdAt.IsZero() {
		createdAt = time.Now()
	}
	opt := func(s string) *string {
		if s == "" {
			return nil
		}
		return &s
	}
	n, err := q.InsertCustomerFromSync(ctx, store.InsertCustomerFromSyncParams{
		ID: p.ID, TenantID: tenantID, Name: opt(p.Name), Phone: &p.Phone,
		MemberCode: &p.MemberCode, SocialHandle: opt(p.SocialHandle),
		FollowsStoreSocial: p.FollowsStoreSocial, FirstSeenAt: toTimestamptz(createdAt),
	})
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			switch pgErr.ConstraintName {
			case "idx_customers_phone":
				return "rejected", "nomor WA ini sudah terdaftar sebagai member"
			case "idx_customers_member_code":
				return "rejected", "kode member bentrok dengan member lain — daftarkan ulang"
			}
		}
		// Galat mentah TIDAK diteruskan: bisa memuat nomor WA (invarian #6).
		return "rejected", "gagal menyimpan member"
	}
	if n == 0 {
		return "duplicate", ""
	}
	return "accepted", ""
}
