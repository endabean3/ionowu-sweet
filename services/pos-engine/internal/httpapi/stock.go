package httpapi

import (
	"encoding/json"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/oklog/ulid/v2"
	"github.com/shopspring/decimal"

	"github.com/endabean3/docs-umkm-intelligence/services/pos-engine/internal/store"
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

// PostStockEvent menangani POST /stock/events
func (h *StockHandler) PostStockEvent(w http.ResponseWriter, r *http.Request) {
	tenantID, _ := r.Context().Value(tenantIDKey).(string)

	outletID := "outlet_kemang"

	var req struct {
		VariantID     string  `json:"variant_id"`
		EventType     string  `json:"event_type"` // restock, opname_adjust, waste
		QuantityDelta string  `json:"quantity_delta"`
		UOM           string  `json:"uom"`
		Note          *string `json:"note"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error": "Payload tidak valid"}`, http.StatusBadRequest)
		return
	}

	qty, err := decimal.NewFromString(req.QuantityDelta)
	if err != nil {
		http.Error(w, `{"error": "Kuantitas invalid"}`, http.StatusBadRequest)
		return
	}

	// ULID MURNI — stock_events.id adalah VARCHAR(26) (migrations/00006);
	// prefiks membuatnya 29+ karakter dan INSERT gagal "value too long".
	eventID := ulid.Make().String()

	_, err = h.queries.InsertStockEvent(r.Context(), store.InsertStockEventParams{
		ID:            eventID,
		TenantID:      tenantID,
		OutletID:      outletID,
		VariantID:     req.VariantID,
		EventType:     req.EventType,
		QuantityDelta: qty,
		BalanceAfter:  qty,
		Uom:           req.UOM,
		Note:          req.Note,
	})

	if err != nil {
		http.Error(w, `{"error": "Gagal mencatat event stok"}`, http.StatusInternalServerError)
		return
	}

	RespondJSON(w, http.StatusCreated, map[string]any{"message": "Stok dicatat", "event_id": eventID})
}
