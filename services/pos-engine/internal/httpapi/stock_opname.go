package httpapi

import (
	"encoding/json"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/oklog/ulid/v2"
	"github.com/shopspring/decimal"

	"github.com/endabean3/docs-umkm-intelligence/services/pos-engine/internal/store"
)

type StockOpnameHandler struct {
	pool *pgxpool.Pool
	q    *store.Queries
}

func NewStockOpnameHandler(pool *pgxpool.Pool) *StockOpnameHandler {
	return &StockOpnameHandler{pool: pool, q: store.New(pool)}
}

type opnameItemInput struct {
	VariantID      string          `json:"variant_id"`
	SystemQuantity decimal.Decimal `json:"system_quantity"`
	CountedQuantity decimal.Decimal `json:"counted_quantity"`
}

type opnameInput struct {
	OutletID string            `json:"outlet_id"`
	Items    []opnameItemInput `json:"items"`
}

// PostStockOpname menangani POST /stock/opname
func (h *StockOpnameHandler) PostStockOpname(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	tenantID, _ := ctx.Value(tenantIDKey).(string)
	userID, _ := ctx.Value(userIDKey).(string)

	var req opnameInput
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondError(w, http.StatusBadRequest, "VALIDATION_ERROR", "Payload tidak valid")
		return
	}

	if req.OutletID == "" || len(req.Items) == 0 {
		RespondError(w, http.StatusBadRequest, "VALIDATION_ERROR", "outlet_id dan items wajib diisi")
		return
	}

	tx, err := h.pool.Begin(ctx)
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal memulai tx")
		return
	}
	defer tx.Rollback(ctx)

	qtx := h.q.WithTx(tx)

	opnameID := "op_" + ulid.Make().String()
	
	// Untuk simplicity, kita set auto-approved oleh yang mengajukan.
	// Di enterprise, ini bisa draft dulu, lalu direview manager.
	userIDPtr := &userID
	
	_, err = qtx.InsertStockOpname(ctx, store.InsertStockOpnameParams{
		ID:         opnameID,
		TenantID:   tenantID,
		OutletID:   req.OutletID,
		Status:     "approved",
		StartedBy:  userID,
		ApprovedBy: userIDPtr,
	})
	
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal menyimpan header opname")
		return
	}

	for _, item := range req.Items {
		itemID := "opi_" + ulid.Make().String()
		_, err = qtx.InsertStockOpnameItem(ctx, store.InsertStockOpnameItemParams{
			ID:              itemID,
			TenantID:        tenantID,
			OpnameID:        opnameID,
			VariantID:       item.VariantID,
			SystemQuantity:  item.SystemQuantity,
			CountedQuantity: item.CountedQuantity,
		})
		if err != nil {
			RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal menyimpan item opname")
			return
		}
		
		// Insert adjustment (opname_adjust) if variance != 0
		if !item.SystemQuantity.Equal(item.CountedQuantity) {
			variance := item.CountedQuantity.Sub(item.SystemQuantity)
			eventID := "se_" + ulid.Make().String()
			_, err = tx.Exec(ctx, `
				INSERT INTO stock_events (id, tenant_id, outlet_id, variant_id, event_type, quantity_delta, balance_after, uom, reference_id, actor_user_id)
				VALUES ($1, $2, $3, $4, 'opname_adjust', $5, $6, 'pcs', $7, $8)
			`, eventID, tenantID, req.OutletID, item.VariantID, variance, item.CountedQuantity, opnameID, userID)
			if err != nil {
				RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal mencatat mutasi opname")
				return
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal commit opname")
		return
	}

	RespondJSON(w, http.StatusCreated, map[string]any{
		"message":   "Opname selesai direkam",
		"opname_id": opnameID,
	})
}
