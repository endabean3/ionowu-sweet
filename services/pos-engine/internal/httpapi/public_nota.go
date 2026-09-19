package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/oklog/ulid/v2"

	"github.com/endabean3/ionowu-sweet/services/pos-engine/internal/store"
)

// Halaman nota publik (ADR-0013). QR di nota membuka halaman web TOKO
// (mis. warungwangi.ionowu.com/nota), yang servernya membaca endpoint ini:
// ringkasan nota + status garansi, dan pendaftaran member berbekal nota.
//
// Endpoint ini TANPA login. Yang menjaganya:
//   - Kunci = (tenant_id, id nota). Id nota adalah ULID dengan 80 bit acak;
//     menebak nota orang lain tidak praktis. Keduanya wajib di setiap kueri
//     (aturan emas tenant_id tetap berlaku).
//   - Tidak ada identitas pelanggan, kasir, atau HPP di jawaban.
//   - Satu pendaftaran member per nota (idx_customers_signup_sale), hanya
//     untuk nota lunas tanpa member, dan hanya dalam JendelaDaftarMember.
//   - Rate limit per tenant (baca) dan per nota (daftar). BUKAN per IP: semua
//     permintaan datang dari server web toko, jadi IP-nya selalu sama.

// JendelaDaftarMember — nota lebih tua dari ini tidak bisa dipakai mendaftar.
// Nota lama yang tercecer tidak boleh jadi pintu membuat member.
const JendelaDaftarMember = 30 * 24 * time.Hour

var ulidPola = regexp.MustCompile(`^[0-9A-HJKMNP-TV-Z]{26}$`)

type PublicNotaHandler struct {
	pool    *pgxpool.Pool
	queries *store.Queries
	baca    *RateLimiter
	daftar  *RateLimiter
	daftarT *RateLimiter
	now     func() time.Time
}

func NewPublicNotaHandler(pool *pgxpool.Pool) *PublicNotaHandler {
	return &PublicNotaHandler{
		pool:    pool,
		queries: store.New(pool),
		baca:    NewRateLimiter(300), // per tenant
		daftar:  NewRateLimiter(5),   // per nota
		daftarT: NewRateLimiter(30),  // per tenant
		now:     time.Now,
	}
}

type publicNotaItem struct {
	Name     string `json:"name"`
	Quantity string `json:"quantity"`
	Uom      string `json:"uom"`
	Subtotal string `json:"subtotal"`
}

type publicNota struct {
	ReceiptNumber string `json:"receipt_number"`
	SoldAt        string `json:"sold_at"`
	Total         string `json:"total"`
	Status        string `json:"status"`
	Refunded      bool   `json:"refunded"`
	HasMember     bool   `json:"has_member"`
	Store         struct {
		Name         string `json:"name"`
		Address      string `json:"address,omitempty"`
		Phone        string `json:"phone,omitempty"`
		SocialHandle string `json:"social_handle,omitempty"`
	} `json:"store"`
	Warranty struct {
		Days   int16  `json:"days"`
		Until  string `json:"until,omitempty"`
		Active bool   `json:"active"`
	} `json:"warranty"`
	Items            []publicNotaItem `json:"items"`
	MemberSignupOpen bool             `json:"member_signup_open"`
}

// garansiSampai: tanggal (zona waktu outlet) terakhir garansi berlaku —
// tanggal beli + N hari, sama dengan yang dicetak di nota (receipt/format.ts).
func garansiSampai(soldAt time.Time, days int16, tz string) (until time.Time, loc *time.Location) {
	loc, err := time.LoadLocation(tz)
	if err != nil {
		loc = time.FixedZone("WIB", 7*3600)
	}
	d := soldAt.In(loc)
	return time.Date(d.Year(), d.Month(), d.Day()+int(days), 0, 0, 0, 0, loc), loc
}

// garansiAktif: berlaku sampai AKHIR hari `until` di zona waktu outlet.
func garansiAktif(now, until time.Time, loc *time.Location) bool {
	n := now.In(loc)
	hariIni := time.Date(n.Year(), n.Month(), n.Day(), 0, 0, 0, 0, loc)
	return !hariIni.After(until)
}

// bolehDaftar: nota lunas, belum direfund, belum atas nama member, belum
// dipakai mendaftar, dan masih dalam jendela waktu.
func bolehDaftar(r store.GetPublicNotaRow, now time.Time) bool {
	return r.PaymentStatus == "paid" && !r.Refunded && !r.HasMember && !r.SignupUsed &&
		r.SoldAt.Valid && now.Sub(r.SoldAt.Time) <= JendelaDaftarMember
}

func (h *PublicNotaHandler) muat(ctx context.Context, w http.ResponseWriter, r *http.Request) (store.GetPublicNotaRow, string, bool) {
	tenantID, saleID := chi.URLParam(r, "tenantId"), chi.URLParam(r, "saleId")
	tidakAda := func() {
		// Sama untuk id rusak, id milik tenant lain, dan nota yang belum
		// tersinkron — membedakannya membocorkan keberadaan data.
		RespondError(w, http.StatusNotFound, "NOTA_NOT_FOUND",
			"Nota tidak ditemukan. Bila baru saja dibeli, coba lagi beberapa menit lagi.")
	}
	if !ulidPola.MatchString(tenantID) || !ulidPola.MatchString(saleID) {
		tidakAda()
		return store.GetPublicNotaRow{}, "", false
	}
	row, err := h.queries.GetPublicNota(ctx, store.GetPublicNotaParams{TenantID: tenantID, ID: saleID})
	if errors.Is(err, pgx.ErrNoRows) {
		tidakAda()
		return row, "", false
	}
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal memuat nota")
		return row, "", false
	}
	return row, tenantID, true
}

// GetNota menangani GET /public/v1/nota/{tenantId}/{saleId}.
func (h *PublicNotaHandler) GetNota(w http.ResponseWriter, r *http.Request) {
	if !h.izinkan(w, h.baca, "t:"+chi.URLParam(r, "tenantId")) {
		return
	}
	ctx := r.Context()
	row, tenantID, ok := h.muat(ctx, w, r)
	if !ok {
		return
	}
	items, err := h.queries.ListPublicNotaItems(ctx, store.ListPublicNotaItemsParams{
		TenantID: tenantID, TransactionID: row.ID,
	})
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal memuat nota")
		return
	}

	now := h.now()
	var out publicNota
	out.ReceiptNumber = row.ReceiptNumber
	out.Total = row.GrandTotal.StringFixed(2)
	out.Status = row.PaymentStatus
	out.Refunded = row.Refunded
	out.HasMember = row.HasMember
	out.Store.Name = row.OutletName
	out.Store.Address = deref(row.OutletAddress)
	out.Store.Phone = deref(row.OutletPhone)
	out.Store.SocialHandle = deref(row.SocialHandle)
	out.Warranty.Days = row.WarrantyDays
	if row.SoldAt.Valid {
		out.SoldAt = row.SoldAt.Time.UTC().Format(time.RFC3339)
		if row.WarrantyDays > 0 {
			until, loc := garansiSampai(row.SoldAt.Time, row.WarrantyDays, row.Timezone)
			out.Warranty.Until = until.Format("2006-01-02")
			out.Warranty.Active = row.PaymentStatus == "paid" && !row.Refunded && garansiAktif(now, until, loc)
		}
	}
	out.Items = make([]publicNotaItem, 0, len(items))
	for _, it := range items {
		nama := it.ProductName
		if v := strings.TrimSpace(it.VariantName); v != "" && !strings.EqualFold(v, "default") && !strings.EqualFold(v, "regular") {
			nama += " - " + v
		}
		out.Items = append(out.Items, publicNotaItem{
			Name: nama, Quantity: it.Quantity.String(), Uom: it.Uom, Subtotal: it.Subtotal.StringFixed(2),
		})
	}
	out.MemberSignupOpen = bolehDaftar(row, now)

	// Nota tidak berubah setelah lunas kecuali refund; cache pendek cukup
	// meredam muat-ulang beruntun tanpa menyembunyikan refund lama-lama.
	w.Header().Set("Cache-Control", "private, max-age=60")
	RespondJSON(w, http.StatusOK, map[string]any{"data": out})
}

type publicSignupReq struct {
	Phone              string `json:"phone"`
	Name               string `json:"name"`
	SocialHandle       string `json:"social_handle"`
	FollowsStoreSocial bool   `json:"follows_store_social"`
}

// normalize merapikan isian daftar member; "" = sah. Fungsi murni.
func (p *publicSignupReq) normalize() string {
	p.Name = strings.TrimSpace(p.Name)
	p.SocialHandle = normalizeHandle(p.SocialHandle)
	if p.Phone = normalizeWA(p.Phone); p.Phone == "" {
		return "Nomor WhatsApp tidak valid. Contoh: 0812-3456-7890"
	}
	if !p.FollowsStoreSocial {
		return "Syarat member: follow akun TikTok toko lebih dulu"
	}
	if utf8.RuneCountInString(p.Name) > 200 || utf8.RuneCountInString(p.SocialHandle) > 100 {
		return "Nama atau akun media sosial terlalu panjang"
	}
	return ""
}

// kodeMember sama dengan klien (lib/member/member.ts memberCodeFromUlid):
// "M-" + 6 karakter terakhir ULID.
func kodeMember(id string) string { return "M-" + id[len(id)-6:] }

// PostMember menangani POST /public/v1/nota/{tenantId}/{saleId}/member.
func (h *PublicNotaHandler) PostMember(w http.ResponseWriter, r *http.Request) {
	tenantID, saleID := chi.URLParam(r, "tenantId"), chi.URLParam(r, "saleId")
	if !h.izinkan(w, h.daftarT, "t:"+tenantID) || !h.izinkan(w, h.daftar, "s:"+saleID) {
		return
	}
	var req publicSignupReq
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&req); err != nil {
		RespondError(w, http.StatusBadRequest, "VALIDATION_ERROR", "Payload tidak valid")
		return
	}
	if msg := req.normalize(); msg != "" {
		RespondError(w, http.StatusUnprocessableEntity, "VALIDATION_ERROR", msg)
		return
	}

	ctx := r.Context()
	row, _, ok := h.muat(ctx, w, r)
	if !ok {
		return
	}
	if !bolehDaftar(row, h.now()) {
		RespondError(w, http.StatusConflict, "NOTA_SIGNUP_CLOSED",
			"Nota ini tidak bisa dipakai mendaftar member. Silakan daftar langsung di kasir.")
		return
	}

	opt := func(s string) *string {
		if s == "" {
			return nil
		}
		return &s
	}
	// Kode member = 6 karakter terakhir ULID; tabrakan (sangat jarang)
	// dicoba ulang dengan ULID baru.
	for coba := 0; coba < 3; coba++ {
		id := ulid.Make().String()
		_, err := h.queries.InsertCustomerFromNota(ctx, store.InsertCustomerFromNotaParams{
			ID: id, TenantID: tenantID, Name: opt(req.Name), Phone: &req.Phone,
			MemberCode: ptr(kodeMember(id)), SocialHandle: opt(req.SocialHandle),
			SignupSaleID: &saleID,
		})
		if err == nil {
			RespondJSON(w, http.StatusCreated, map[string]any{"data": map[string]string{"member_code": kodeMember(id)}})
			return
		}
		var pgErr *pgconn.PgError
		if !errors.As(err, &pgErr) || pgErr.Code != "23505" {
			// Galat mentah TIDAK diteruskan/dicatat: bisa memuat nomor WA (invarian #6).
			RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal mendaftarkan member")
			return
		}
		switch pgErr.ConstraintName {
		case "idx_customers_signup_sale":
			RespondError(w, http.StatusConflict, "NOTA_SIGNUP_CLOSED",
				"Nota ini sudah dipakai untuk mendaftar member.")
			return
		case "idx_customers_phone":
			// Tidak menyebut kode member pemilik nomor itu: halaman ini publik.
			RespondError(w, http.StatusConflict, "MEMBER_ALREADY_EXISTS",
				"Nomor ini sudah terdaftar sebagai member. Sebutkan nomor WA Anda di kasir.")
			return
		}
		// idx_customers_member_code: coba lagi dengan ULID baru.
	}
	RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal mendaftarkan member")
}

func (h *PublicNotaHandler) izinkan(w http.ResponseWriter, l *RateLimiter, key string) bool {
	if ok, wait := l.Allow(key); !ok {
		w.Header().Set("Retry-After", strconv.Itoa(int(math.Ceil(wait.Seconds()))))
		RespondError(w, http.StatusTooManyRequests, "RATE_LIMITED",
			"Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.")
		return false
	}
	return true
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func ptr[T any](v T) *T { return &v }
