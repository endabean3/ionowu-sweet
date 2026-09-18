package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/oklog/ulid/v2"

	"github.com/endabean3/ionowu-sweet/services/pos-engine/internal/store"
)

type OutletHandler struct {
	pool    *pgxpool.Pool
	queries *store.Queries
}

func NewOutletHandler(pool *pgxpool.Pool) *OutletHandler {
	return &OutletHandler{
		pool:    pool,
		queries: store.New(pool),
	}
}

// GetOutlets menangani GET /outlets.
//
// MULTI-OUTLET.md §3: owner melihat SELURUH outlet secara otomatis (bukan
// lewat penugasan — outlet baru harus langsung terlihat tanpa baris
// assignment tambahan); manager/kasir hanya melihat outlet yang mereka
// ditugaskan. Sebelumnya kueri ini mengembalikan seluruh outlet tenant ke
// SIAPA PUN yang login — didokumentasikan sebagai "celah keamanan, bukan
// fitur Fase 2" meski UI multi-outlet belum dibangun.
func (h *OutletHandler) GetOutlets(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	tenantID, _ := ctx.Value(tenantIDKey).(string)

	if UserRole(ctx) == "owner" {
		outlets, err := h.queries.ListOutlets(ctx, tenantID)
		if err != nil {
			http.Error(w, `{"error": "Gagal memuat outlet"}`, http.StatusInternalServerError)
			return
		}
		RespondJSON(w, http.StatusOK, map[string]any{"data": outlets})
		return
	}

	outlets, err := h.queries.ListOutletsForUser(ctx, store.ListOutletsForUserParams{
		TenantID: tenantID, UserID: UserID(ctx),
	})
	if err != nil {
		http.Error(w, `{"error": "Gagal memuat outlet"}`, http.StatusInternalServerError)
		return
	}
	RespondJSON(w, http.StatusOK, map[string]any{"data": outlets})
}

// PostOutlet menangani POST /outlets
func (h *OutletHandler) PostOutlet(w http.ResponseWriter, r *http.Request) {
	tenantID, _ := r.Context().Value(tenantIDKey).(string)

	// openapi.yaml: "Buat outlet baru (owner only)"; RBAC-MODEL "Tambah/hapus
	// outlet" ✅ hanya owner. Sebelumnya tidak ditegakkan sama sekali.
	if UserRole(r.Context()) != "owner" {
		RespondError(w, http.StatusForbidden, "FORBIDDEN_ROLE", "Hanya owner yang boleh menambah outlet")
		return
	}

	var req struct {
		Name             string `json:"name"`
		Address          string `json:"address"`
		Phone            string `json:"phone"`
		Timezone         string `json:"timezone"`
		BusinessDayStart string `json:"business_day_start"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error": "Payload tidak valid"}`, http.StatusBadRequest)
		return
	}

	if req.Name == "" {
		http.Error(w, `{"error": "Nama outlet wajib"}`, http.StatusBadRequest)
		return
	}

	if req.Timezone == "" {
		req.Timezone = "Asia/Jakarta"
	}

	var bdStart pgtype.Time
	if req.BusinessDayStart != "" {
		t, err := time.Parse("15:04", req.BusinessDayStart)
		if err == nil {
			usec := int64(t.Hour()*3600*1000000 + t.Minute()*60*1000000 + t.Second()*1000000)
			bdStart = pgtype.Time{Microseconds: usec, Valid: true}
		}
	} else {
		bdStart = pgtype.Time{Microseconds: 0, Valid: true}
	}

	// ULID MURNI — outlets.id adalah VARCHAR(26) (migrations/00001); prefiks
	// membuatnya 29+ karakter dan INSERT gagal "value too long".
	outletID := ulid.Make().String()

	out, err := h.queries.InsertOutlet(r.Context(), store.InsertOutletParams{
		ID:               outletID,
		TenantID:         tenantID,
		Name:             req.Name,
		Address:          &req.Address,
		Phone:            &req.Phone,
		Timezone:         req.Timezone,
		BusinessDayStart: bdStart,
	})
	if err != nil {
		http.Error(w, `{"error": "Gagal menyimpan"}`, http.StatusInternalServerError)
		return
	}

	RespondJSON(w, http.StatusCreated, map[string]any{
		"message": "Outlet dibuat",
		"data":    out,
	})
}

// PatchOutlet menangani PATCH /outlets/{id}
func (h *OutletHandler) PatchOutlet(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	tenantID, _ := ctx.Value(tenantIDKey).(string)
	outletID := chi.URLParam(r, "id")

	var req patchOutletRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondError(w, http.StatusBadRequest, "VALIDATION_ERROR", "Payload tidak valid")
		return
	}
	if msg := req.normalize(); msg != "" {
		RespondError(w, http.StatusUnprocessableEntity, "VALIDATION_ERROR", msg)
		return
	}

	// RBAC-MODEL §Matriks "Ubah profil toko & struk": owner semua outlet,
	// manager hanya outlet tempat ia ditugaskan; menonaktifkan outlet setara
	// "Tambah/hapus outlet" — owner saja. Sebelumnya endpoint ini tidak
	// memeriksa peran sama sekali: kasir bisa mengganti nama dan alamat toko.
	switch role := UserRole(ctx); role {
	case "owner":
	case "manager":
		if req.IsActive != nil {
			RespondError(w, http.StatusForbidden, "FORBIDDEN_ROLE", "Hanya owner yang boleh menonaktifkan outlet")
			return
		}
		ok, err := h.managerAssigned(ctx, tenantID, outletID)
		if err != nil {
			RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal memeriksa penugasan outlet")
			return
		}
		if !ok {
			RespondError(w, http.StatusForbidden, "FORBIDDEN_ROLE", "Anda tidak ditugaskan di outlet ini")
			return
		}
	default:
		RespondError(w, http.StatusForbidden, "FORBIDDEN_ROLE", "Hanya owner atau manager yang boleh mengubah pengaturan toko")
		return
	}

	var bdStart pgtype.Time
	if req.BusinessDayStart != nil {
		t, err := time.Parse("15:04", *req.BusinessDayStart)
		if err != nil {
			RespondError(w, http.StatusUnprocessableEntity, "VALIDATION_ERROR", "business_day_start harus berformat HH:MM")
			return
		}
		usec := int64(t.Hour()*3600*1000000 + t.Minute()*60*1000000)
		bdStart = pgtype.Time{Microseconds: usec, Valid: true}
	}

	n, err := h.queries.UpdateOutlet(ctx, store.UpdateOutletParams{
		TenantID:         tenantID,
		ID:               outletID,
		Name:             req.Name,
		Address:          req.Address,
		Phone:            req.Phone,
		Timezone:         req.Timezone,
		BusinessDayStart: bdStart,
		IsActive:         req.IsActive,
		ReceiptFooter:    req.ReceiptFooter,
		WarrantyDays:     req.WarrantyDays,
		SocialHandle:     req.SocialHandle,
	})
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Update gagal")
		return
	}
	if n == 0 {
		// Id salah ATAU milik tenant lain — keduanya sama-sama "tidak ada"
		// bagi pemanggil; membedakannya membocorkan keberadaan data tenant lain.
		RespondError(w, http.StatusNotFound, "OUTLET_NOT_FOUND", "Outlet tidak ditemukan")
		return
	}

	RespondJSON(w, http.StatusOK, map[string]any{"message": "Outlet diupdate"})
}

func (h *OutletHandler) managerAssigned(ctx context.Context, tenantID, outletID string) (bool, error) {
	outlets, err := h.queries.ListOutletsForUser(ctx, store.ListOutletsForUserParams{
		TenantID: tenantID, UserID: UserID(ctx),
	})
	if err != nil {
		return false, err
	}
	for _, o := range outlets {
		if o.ID == outletID {
			return true, nil
		}
	}
	return false, nil
}

type patchOutletRequest struct {
	Name             *string `json:"name"`
	Address          *string `json:"address"`
	Phone            *string `json:"phone"`
	Timezone         *string `json:"timezone"`
	BusinessDayStart *string `json:"business_day_start"`
	IsActive         *bool   `json:"is_active"`
	ReceiptFooter    *string `json:"receipt_footer"`
	// Lama garansi (hari) yang dicetak di nota; 0 = tanpa garansi.
	WarrantyDays *int16 `json:"warranty_days"`
	// Akun media sosial toko yang wajib di-follow calon member (mis. TikTok).
	SocialHandle *string `json:"social_handle"`
}

// Batas panjang mengikuti kolom (outlets.name VARCHAR(200), phone
// VARCHAR(50), receipt_footer VARCHAR(200)). Alamat TEXT, tetapi dibatasi
// karena dicetak di struk 58 mm — 200 karakter sudah ±6 baris.
const (
	maxOutletName   = 200
	maxOutletPhone  = 50
	maxOutletAddr   = 200
	maxOutletFooter = 200
)

// normalize merapikan spasi dan memvalidasi panjang. Fungsi murni — diuji
// tanpa database. Mengembalikan pesan galat, atau "" bila sah.
func (p *patchOutletRequest) normalize() string {
	trim := func(v *string) {
		if v != nil {
			*v = strings.TrimSpace(*v)
		}
	}
	trim(p.Name)
	trim(p.Address)
	trim(p.Phone)
	trim(p.ReceiptFooter)
	if p.SocialHandle != nil {
		h := normalizeHandle(*p.SocialHandle)
		p.SocialHandle = &h
	}

	if p.Name != nil && *p.Name == "" {
		return "Nama toko tidak boleh kosong"
	}
	checks := []struct {
		v   *string
		max int
		msg string
	}{
		{p.Name, maxOutletName, "Nama toko terlalu panjang"},
		{p.Phone, maxOutletPhone, "Nomor telepon terlalu panjang"},
		{p.Address, maxOutletAddr, "Alamat terlalu panjang (maks. 200 huruf)"},
		{p.ReceiptFooter, maxOutletFooter, "Teks penutup struk terlalu panjang (maks. 200 huruf)"},
		{p.SocialHandle, 100, "Akun media sosial terlalu panjang"},
	}
	for _, c := range checks {
		if c.v != nil && utf8.RuneCountInString(*c.v) > c.max {
			return c.msg
		}
	}
	// Batas sama dengan CHECK di migrasi 00011.
	if p.WarrantyDays != nil && (*p.WarrantyDays < 0 || *p.WarrantyDays > 365) {
		return "Lama garansi harus 0–365 hari"
	}
	return ""
}
