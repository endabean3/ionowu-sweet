package httpapi

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/oklog/ulid/v2"
	"github.com/shopspring/decimal"

	"github.com/endabean3/docs-umkm-intelligence/services/pos-engine/internal/store"
)

type CatalogHandler struct {
	pool    *pgxpool.Pool
	queries *store.Queries
}

func NewCatalogHandler(pool *pgxpool.Pool) *CatalogHandler {
	return &CatalogHandler{
		pool:    pool,
		queries: store.New(pool),
	}
}

// GetProducts menangani GET /products
func (h *CatalogHandler) GetProducts(w http.ResponseWriter, r *http.Request) {
	tenantID, _ := r.Context().Value(tenantIDKey).(string)

	prods, err := h.queries.ListProducts(r.Context(), store.ListProductsParams{
		TenantID: tenantID,
		Limit:    50,
		Offset:   0,
	})
	if err != nil {
		http.Error(w, `{"error": "Gagal memuat produk"}`, http.StatusInternalServerError)
		return
	}

	RespondJSON(w, http.StatusOK, map[string]any{"data": prods})
}

// PostProduct menangani POST /products
func (h *CatalogHandler) PostProduct(w http.ResponseWriter, r *http.Request) {
	tenantID, _ := r.Context().Value(tenantIDKey).(string)

	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		CategoryID  string `json:"category_id"`
		Variants    []struct {
			Name      string `json:"name"`
			Price     string `json:"price"`
			CostPrice string `json:"cost_price"`
			SKU       string `json:"sku"`
			Barcode   string `json:"barcode"`
		} `json:"variants"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error": "Payload tidak valid"}`, http.StatusBadRequest)
		return
	}

	if req.Name == "" || len(req.Variants) == 0 {
		http.Error(w, `{"error": "Nama produk dan varian wajib"}`, http.StatusBadRequest)
		return
	}

	ctx := r.Context()
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		http.Error(w, `{"error": "Gagal memulai tx"}`, http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(ctx) //nolint:errcheck // no-op setelah Commit berhasil

	productID := "pr_" + ulid.Make().String()

	_, err = tx.Exec(ctx, `
		INSERT INTO products (id, tenant_id, name, description, is_active)
		VALUES ($1, $2, $3, $4, true)
	`, productID, tenantID, req.Name, req.Description)
	if err != nil {
		http.Error(w, `{"error": "Gagal menyimpan produk"}`, http.StatusInternalServerError)
		return
	}

	for _, v := range req.Variants {
		varID := "vr_" + ulid.Make().String()
		_, err = tx.Exec(ctx, `
			INSERT INTO variants (id, tenant_id, product_id, name, price, cost_price, sku, barcode, item_type, uom, is_active)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'stock', 'pcs', true)
		`, varID, tenantID, productID, v.Name, v.Price, v.CostPrice, v.SKU, v.Barcode)
		if err != nil {
			http.Error(w, `{"error": "Gagal menyimpan varian"}`, http.StatusInternalServerError)
			return
		}
	}

	if err := tx.Commit(ctx); err != nil {
		http.Error(w, `{"error": "Gagal commit"}`, http.StatusInternalServerError)
		return
	}

	RespondJSON(w, http.StatusCreated, map[string]any{
		"message":    "Produk berhasil dibuat",
		"product_id": productID,
	})
}

// PatchProduct menangani PATCH /products/{id}
func (h *CatalogHandler) PatchProduct(w http.ResponseWriter, r *http.Request) {
	tenantID, _ := r.Context().Value(tenantIDKey).(string)
	productID := chi.URLParam(r, "id")

	var req struct {
		Name        *string `json:"name"`
		Description *string `json:"description"`
		IsActive    *bool   `json:"is_active"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error": "Payload tidak valid"}`, http.StatusBadRequest)
		return
	}

	err := h.queries.UpdateProduct(r.Context(), store.UpdateProductParams{
		TenantID:    tenantID,
		ID:          productID,
		Name:        req.Name,
		Description: req.Description,
		IsActive:    req.IsActive,
	})
	if err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, `{"error": "Not found"}`, http.StatusNotFound)
			return
		}
		http.Error(w, `{"error": "Update gagal"}`, http.StatusInternalServerError)
		return
	}

	RespondJSON(w, http.StatusOK, map[string]any{"message": "Produk diupdate"})
}

// PatchVariant menangani PATCH /variants/{id}
func (h *CatalogHandler) PatchVariant(w http.ResponseWriter, r *http.Request) {
	tenantID, _ := r.Context().Value(tenantIDKey).(string)
	variantID := chi.URLParam(r, "id")

	var req struct {
		Name     *string `json:"name"`
		Price    *string `json:"price"`
		SKU      *string `json:"sku"`
		Barcode  *string `json:"barcode"`
		IsActive *bool   `json:"is_active"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error": "Payload tidak valid"}`, http.StatusBadRequest)
		return
	}

	var p decimal.NullDecimal
	if req.Price != nil {
		d, err := decimal.NewFromString(*req.Price)
		if err == nil {
			p = decimal.NullDecimal{Decimal: d, Valid: true}
		}
	}

	err := h.queries.UpdateVariant(r.Context(), store.UpdateVariantParams{
		TenantID: tenantID,
		ID:       variantID,
		Name:     req.Name,
		Price:    p,
		Sku:      req.SKU,
		Barcode:  req.Barcode,
		IsActive: req.IsActive,
	})
	if err != nil {
		http.Error(w, `{"error": "Update gagal"}`, http.StatusInternalServerError)
		return
	}

	RespondJSON(w, http.StatusOK, map[string]any{"message": "Varian diupdate"})
}
