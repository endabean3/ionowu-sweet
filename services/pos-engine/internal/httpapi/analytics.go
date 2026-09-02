package httpapi

import (
	"encoding/json"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
	
	"github.com/endabean3/docs-umkm-intelligence/services/pos-engine/internal/store"
)

type AnalyticsHandler struct {
	pool    *pgxpool.Pool
	queries *store.Queries
}

func NewAnalyticsHandler(pool *pgxpool.Pool) *AnalyticsHandler {
	return &AnalyticsHandler{
		pool:    pool,
		queries: store.New(pool),
	}
}

// GetDashboard menangani GET /analytics/dashboard
func (h *AnalyticsHandler) GetDashboard(w http.ResponseWriter, r *http.Request) {
	tenantID, _ := r.Context().Value(tenantIDKey).(string)

	summary, err := h.queries.GetDailySummary(r.Context(), tenantID)
	if err != nil {
		http.Error(w, `{"error": "Gagal memuat ringkasan"}`, http.StatusInternalServerError)
		return
	}

	topProducts, err := h.queries.GetTopProducts(r.Context(), tenantID)
	if err != nil {
		http.Error(w, `{"error": "Gagal memuat top produk"}`, http.StatusInternalServerError)
		return
	}
	
	// Convert topProducts structure to match frontend JSON structure
	var productsResponse []map[string]any
	for _, p := range topProducts {
		productsResponse = append(productsResponse, map[string]any{
			"product_name":  p.ProductName,
			"variant_name":  p.VariantName,
			"quantity_sold": p.QuantitySold,
			"revenue":       p.Revenue,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"summary": map[string]any{
			"transaction_count": summary.TransactionCount,
			"gross_sales":       summary.GrossSales,
			"discount_total":    summary.DiscountTotal,
			"net_sales":         summary.NetSales,
		},
		"top_products": productsResponse,
	})
}
