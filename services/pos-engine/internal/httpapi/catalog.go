package httpapi

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/oklog/ulid/v2"
	"github.com/shopspring/decimal"

	"github.com/endabean3/ionowu-sweet/services/pos-engine/internal/store"
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
			// UOM/UomPrecision/ItemType: default "pcs"/0/"stock" bila kosong —
			// arketipe A (retail satuan). Arketipe B (Warung Wangi ml, Media
			// Boga gram) WAJIB mengirim uom eksplisit ("ml"/"g") supaya stok
			// desimal (MARKET-SEGMENTS §4) benar-benar tersimpan sebagai
			// satuan yang dimaksud, bukan diam-diam jadi "pcs".
			Uom           string `json:"uom"`
			UomPrecision  int16  `json:"uom_precision"`
			ItemType      string `json:"item_type"`
			StockQuantity string `json:"stock_quantity"`
			MinStockAlert string `json:"min_stock_alert"`
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

	validItemTypes := map[string]bool{"stock": true, "composite": true, "service": true, "time_based": true}
	for _, v := range req.Variants {
		if v.ItemType != "" && !validItemTypes[v.ItemType] {
			http.Error(w, `{"error": "item_type harus salah satu dari stock, composite, service, time_based"}`, http.StatusBadRequest)
			return
		}
		if v.UomPrecision < 0 || v.UomPrecision > 3 {
			http.Error(w, `{"error": "uom_precision harus 0-3"}`, http.StatusBadRequest)
			return
		}
	}

	ctx := r.Context()
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		http.Error(w, `{"error": "Gagal memulai tx"}`, http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(ctx) //nolint:errcheck // no-op setelah Commit berhasil

	// ULID MURNI — products.id/variants.id adalah VARCHAR(26) (migrations/00003);
	// prefiks membuatnya 29+ karakter dan INSERT gagal "value too long".
	productID := ulid.Make().String()

	_, err = tx.Exec(ctx, `
		INSERT INTO products (id, tenant_id, name, description, is_active)
		VALUES ($1, $2, $3, $4, true)
	`, productID, tenantID, req.Name, req.Description)
	if err != nil {
		http.Error(w, `{"error": "Gagal menyimpan produk"}`, http.StatusInternalServerError)
		return
	}

	for _, v := range req.Variants {
		varID := ulid.Make().String()

		uom := v.Uom
		if uom == "" {
			uom = "pcs"
		}
		itemType := v.ItemType
		if itemType == "" {
			itemType = "stock"
		}
		stockQty := v.StockQuantity
		if stockQty == "" {
			stockQty = "0"
		}
		minStock := v.MinStockAlert
		if minStock == "" {
			minStock = "0"
		}

		// Kosong WAJIB jadi NULL, bukan string kosong.
		//
		// idx_variants_barcode UNIK pada (tenant_id, barcode) WHERE barcode IS
		// NOT NULL (migrasi 00003 §77). String kosong bukan NULL, jadi ia ikut
		// terindeks: tenant hanya bisa punya SATU varian tanpa barcode, dan
		// produk kedua yang dibuat lewat form gagal 500 "Gagal menyimpan
		// varian". Ditemukan saat membuat produk kedua di aplikasi nyata —
		// bukan dari membaca kode, karena produk PERTAMA selalu berhasil.
		//
		// SKU diperlakukan sama demi konsistensi: kolomnya nullable, dan ""
		// bukan "tidak punya SKU".
		sku := kosongJadiNull(v.SKU)
		barcode := kosongJadiNull(v.Barcode)

		_, err = tx.Exec(ctx, `
			INSERT INTO variants (id, tenant_id, product_id, name, price, cost_price, sku, barcode, item_type, uom, uom_precision, stock_quantity, min_stock_alert, is_active)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true)
		`, varID, tenantID, productID, v.Name, v.Price, v.CostPrice, sku, barcode, itemType, uom, v.UomPrecision, stockQty, minStock)
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

// kosongJadiNull mengubah "" menjadi NULL untuk kolom nullable yang ikut
// indeks unik parsial. Lihat catatan di PostProduct.
func kosongJadiNull(nilai string) *string {
	if nilai == "" {
		return nil
	}
	return &nilai
}
