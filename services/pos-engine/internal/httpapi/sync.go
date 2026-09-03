package httpapi

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/endabean3/docs-umkm-intelligence/services/pos-engine/internal/store"
	"github.com/jackc/pgx/v5/pgxpool"
)

type SyncHandler struct {
	pool *pgxpool.Pool
}

func NewSyncHandler(pool *pgxpool.Pool) *SyncHandler {
	return &SyncHandler{pool: pool}
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /sync/pull
// ─────────────────────────────────────────────────────────────────────────────

type syncPullRequest struct {
	DeviceID     string  `json:"device_id"`
	SinceEventID *string `json:"since_event_id"` // Dipakai di fase berikutnya
}

type syncProduct struct {
	ID         string `json:"id"`
	CategoryID string `json:"category_id"`
	Name       string `json:"name"`
	IsActive   bool   `json:"is_active"`
	UpdatedAt  string `json:"updated_at"`
}

type syncVariant struct {
	ID            string `json:"id"`
	ProductID     string `json:"product_id"`
	Name          string `json:"name"`
	Sku           string `json:"sku,omitempty"`
	Barcode       string `json:"barcode,omitempty"`
	ItemType      string `json:"item_type"`
	Uom           string `json:"uom"`
	UomPrecision  int16  `json:"uom_precision"`
	Price         string `json:"price"` // decimal
	StockQuantity string `json:"stock_quantity"`
	MinStockAlert string `json:"min_stock_alert"`
	IsActive      bool   `json:"is_active"`
}

type syncPullResponse struct {
	Products          []syncProduct `json:"products"`
	Variants          []syncVariant `json:"variants"`
	CheckpointEventID string        `json:"checkpoint_event_id"`
	HasMore           bool          `json:"has_more"`
}

func (h *SyncHandler) PostSyncPull(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	tenantID := TenantID(ctx)

	var req syncPullRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondError(w, http.StatusBadRequest, "VALIDATION_ERROR", "Payload tidak valid")
		return
	}

	q := store.New(h.pool)

	// Untuk MVP, kita ambil outlet_id pertama milik user (sementara ambil dummy)
	// Kita harusnya ambil outlet_id dari session, tapi kita pakai query sementara
	var outletID string
	err := h.pool.QueryRow(ctx, "SELECT id FROM outlets WHERE tenant_id = $1 LIMIT 1", tenantID).Scan(&outletID)
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal mendapatkan outlet")
		return
	}

	rows, err := q.ListCatalogForSync(ctx, store.ListCatalogForSyncParams{
		TenantID: tenantID,
		OutletID: outletID,
		Limit:    1000,
	})
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal fetch katalog")
		return
	}

	var res syncPullResponse
	res.Products = make([]syncProduct, 0)
	res.Variants = make([]syncVariant, 0)
	seenProducts := make(map[string]bool)

	for _, row := range rows {
		if !seenProducts[row.ProductID] {
			catID := ""
			if row.CategoryID != nil {
				catID = *row.CategoryID
			}

			var updTime time.Time
			if t, ok := row.UpdatedAt.(time.Time); ok {
				updTime = t
			} else {
				updTime = time.Now()
			}

			res.Products = append(res.Products, syncProduct{
				ID:         row.ProductID,
				CategoryID: catID,
				Name:       row.ProductName,
				IsActive:   row.IsActive,
				UpdatedAt:  updTime.Format(time.RFC3339),
			})
			seenProducts[row.ProductID] = true
		}

		sku := ""
		if row.Sku != nil {
			sku = *row.Sku
		}
		barcode := ""
		if row.Barcode != nil {
			barcode = *row.Barcode
		}

		res.Variants = append(res.Variants, syncVariant{
			ID:            row.ID,
			ProductID:     row.ProductID,
			Name:          row.VariantName,
			Sku:           sku,
			Barcode:       barcode,
			ItemType:      row.ItemType,
			Uom:           row.Uom,
			UomPrecision:  row.UomPrecision,
			Price:         row.Price.String(),
			StockQuantity: row.StockQuantity.String(),
			MinStockAlert: row.MinStockAlert.String(),
			IsActive:      row.IsActive,
		})
	}

	res.HasMore = false
	res.CheckpointEventID = "cp_" + time.Now().Format("20060102150405")
	RespondJSON(w, http.StatusOK, res)
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /sync/push
// ─────────────────────────────────────────────────────────────────────────────

type syncPushRequest struct {
	DeviceID    string                   `json:"device_id"`
	ShiftsOpen  []map[string]interface{} `json:"shifts_open"`
	Sales       []map[string]interface{} `json:"sales"`
	StockEvents []map[string]interface{} `json:"stock_events"`
	ShiftsClose []map[string]interface{} `json:"shifts_close"`
}

type syncPushResult struct {
	ClientID string `json:"client_id"`
	Status   string `json:"status"` // accepted, duplicate, conflict, rejected
	Detail   string `json:"detail,omitempty"`
}

type syncPushResponse struct {
	Results []syncPushResult `json:"results"`
}

func (h *SyncHandler) PostSyncPush(w http.ResponseWriter, r *http.Request) {
	// ctx := r.Context()
	// tenantID := TenantID(ctx)

	var req syncPushRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondError(w, http.StatusBadRequest, "VALIDATION_ERROR", "Payload tidak valid")
		return
	}

	var res syncPushResponse
	res.Results = make([]syncPushResult, 0)

	// MVP: Loop over all items and just mark them as 'accepted'.
	// In Sprint 3 we will wire this properly to CreateSaleIdempotent, etc.

	for _, item := range req.ShiftsOpen {
		if id, ok := item["id"].(string); ok {
			res.Results = append(res.Results, syncPushResult{ClientID: id, Status: "accepted"})
		}
	}
	for _, item := range req.Sales {
		if id, ok := item["id"].(string); ok {
			res.Results = append(res.Results, syncPushResult{ClientID: id, Status: "accepted"})
		}
	}
	for _, item := range req.StockEvents {
		if id, ok := item["id"].(string); ok {
			res.Results = append(res.Results, syncPushResult{ClientID: id, Status: "accepted"})
		}
	}
	for _, item := range req.ShiftsClose {
		if id, ok := item["id"].(string); ok {
			res.Results = append(res.Results, syncPushResult{ClientID: id, Status: "accepted"})
		}
	}

	RespondJSON(w, http.StatusOK, res)
}
