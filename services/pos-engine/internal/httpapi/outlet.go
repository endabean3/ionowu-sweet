package httpapi

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/oklog/ulid/v2"

	"github.com/endabean3/docs-umkm-intelligence/services/pos-engine/internal/store"
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

// GetOutlets menangani GET /outlets
func (h *OutletHandler) GetOutlets(w http.ResponseWriter, r *http.Request) {
	tenantID, _ := r.Context().Value(tenantIDKey).(string)

	outlets, err := h.queries.ListOutlets(r.Context(), tenantID)
	if err != nil {
		http.Error(w, `{"error": "Gagal memuat outlet"}`, http.StatusInternalServerError)
		return
	}

	RespondJSON(w, http.StatusOK, map[string]any{"data": outlets})
}

// PostOutlet menangani POST /outlets
func (h *OutletHandler) PostOutlet(w http.ResponseWriter, r *http.Request) {
	tenantID, _ := r.Context().Value(tenantIDKey).(string)

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

	outletID := "ot_" + ulid.Make().String()

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
	tenantID, _ := r.Context().Value(tenantIDKey).(string)
	outletID := chi.URLParam(r, "id")

	var req struct {
		Name             *string `json:"name"`
		Address          *string `json:"address"`
		Phone            *string `json:"phone"`
		Timezone         *string `json:"timezone"`
		BusinessDayStart *string `json:"business_day_start"`
		IsActive         *bool   `json:"is_active"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error": "Payload tidak valid"}`, http.StatusBadRequest)
		return
	}

	var bdStart pgtype.Time
	if req.BusinessDayStart != nil {
		t, err := time.Parse("15:04", *req.BusinessDayStart)
		if err == nil {
			usec := int64(t.Hour()*3600*1000000 + t.Minute()*60*1000000 + t.Second()*1000000)
			bdStart = pgtype.Time{Microseconds: usec, Valid: true}
		}
	}

	err := h.queries.UpdateOutlet(r.Context(), store.UpdateOutletParams{
		TenantID:         tenantID,
		ID:               outletID,
		Name:             req.Name,
		Address:          req.Address,
		Phone:            req.Phone,
		Timezone:         req.Timezone,
		BusinessDayStart: bdStart,
		IsActive:         req.IsActive,
	})
	if err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, `{"error": "Not found"}`, http.StatusNotFound)
			return
		}
		http.Error(w, `{"error": "Update gagal"}`, http.StatusInternalServerError)
		return
	}

	RespondJSON(w, http.StatusOK, map[string]any{"message": "Outlet diupdate"})
}
