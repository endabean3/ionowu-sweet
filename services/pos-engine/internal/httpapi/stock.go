package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/oklog/ulid/v2"

	"github.com/endabean3/ionowu-sweet/services/pos-engine/internal/store"
)

type StockHandler struct {
	pool    *pgxpool.Pool
	queries *store.Queries
}

func NewStockHandler(pool *pgxpool.Pool) *StockHandler {
	return &StockHandler{
		pool:    pool,
		queries: store.New(pool),
	}
}

// GetStockLevels menangani GET /stock/levels
func (h *StockHandler) GetStockLevels(w http.ResponseWriter, r *http.Request) {
	tenantID, _ := r.Context().Value(tenantIDKey).(string)

	levels, err := h.queries.ListStockLevels(r.Context(), tenantID)
	if err != nil {
		http.Error(w, `{"error": "Gagal memuat level stok"}`, http.StatusInternalServerError)
		return
	}

	RespondJSON(w, http.StatusOK, map[string]any{"data": levels})
}

// PostStockEvent menangani POST /stock/events — stok masuk (restock) dan
// barang rusak/hilang (waste) dari layar Stok.
//
// Versi sebelumnya rusak dalam tiga cara yang semuanya diam-diam: outlet
// di-HARDCODE "outlet_kemang" (sisa data contoh), `variants.stock_quantity`
// tidak pernah diperbarui, dan `balance_after` diisi delta — jadi ledger
// stok berisi saldo palsu sementara stok di kasir tidak bergerak sama sekali.
func (h *StockHandler) PostStockEvent(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	tenantID, _ := ctx.Value(tenantIDKey).(string)
	userID, _ := ctx.Value(userIDKey).(string)

	var req mutasiStokReq
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&req); err != nil {
		RespondError(w, http.StatusBadRequest, "VALIDATION_ERROR", "Payload tidak valid")
		return
	}
	if msg := req.normalize(); msg != "" {
		RespondError(w, http.StatusUnprocessableEntity, "VALIDATION_ERROR", msg)
		return
	}
	if msg := bolehUbahStok(UserRole(ctx)); msg != "" {
		RespondError(w, http.StatusForbidden, "FORBIDDEN_ROLE", msg)
		return
	}

	milik, err := h.queries.OutletBelongsToTenant(ctx, store.OutletBelongsToTenantParams{
		TenantID: tenantID, ID: req.OutletID,
	})
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal memeriksa outlet")
		return
	}
	if !milik {
		RespondError(w, http.StatusNotFound, "OUTLET_NOT_FOUND", "Outlet tidak ditemukan")
		return
	}

	uom, err := satuanStok(ctx, h.queries, tenantID, req.VariantID)
	if errors.Is(err, pgx.ErrNoRows) {
		RespondError(w, http.StatusNotFound, "VARIANT_NOT_FOUND", "Barang tidak ditemukan")
		return
	}
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal memuat barang")
		return
	}

	// Saldo dan ledger ditulis dalam SATU transaksi: ledger adalah kebenaran
	// stok (DATA-MODEL §4C), dan saldo yang berubah tanpa barisnya di ledger
	// adalah selisih yang tidak bisa dijelaskan siapa pun.
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal memulai transaksi")
		return
	}
	defer tx.Rollback(ctx) //nolint:errcheck // no-op setelah Commit berhasil
	qtx := h.queries.WithTx(tx)

	saldo, err := qtx.AdjustStock(ctx, store.AdjustStockParams{
		TenantID: tenantID, ID: req.VariantID, Delta: req.delta,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		// Varian tidak ada, milik tenant lain, atau jasa/sewa (tanpa stok).
		RespondError(w, http.StatusNotFound, "VARIANT_NOT_FOUND", "Barang tidak ditemukan atau tidak berstok")
		return
	}
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal memperbarui stok")
		return
	}

	eventID := ulid.Make().String()
	actor := userID
	if _, err := qtx.InsertStockEvent(ctx, store.InsertStockEventParams{
		ID: eventID, TenantID: tenantID, OutletID: req.OutletID, VariantID: req.VariantID,
		EventType: req.EventType, QuantityDelta: req.delta, BalanceAfter: saldo,
		Uom: uom, ActorUserID: &actor, Note: req.Note,
	}); err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal mencatat ledger stok")
		return
	}

	if err := tx.Commit(ctx); err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal menyimpan mutasi stok")
		return
	}

	RespondJSON(w, http.StatusCreated, map[string]any{
		"message":  "Stok dicatat",
		"event_id": eventID,
		"data":     map[string]string{"stock_quantity": saldo.String(), "uom": uom},
	})
}
