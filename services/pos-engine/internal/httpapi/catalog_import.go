package httpapi

import (
	"encoding/csv"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/oklog/ulid/v2"
	"github.com/shopspring/decimal"

	"github.com/endabean3/docs-umkm-intelligence/services/pos-engine/internal/store"
)

type CatalogImportHandler struct {
	pool *pgxpool.Pool
	q    *store.Queries
}

func NewCatalogImportHandler(pool *pgxpool.Pool) *CatalogImportHandler {
	return &CatalogImportHandler{pool: pool, q: store.New(pool)}
}

// PostProductsImport menangani upload CSV multipart/form-data.
// Format CSV Asumsi (tanpa header): ProductName, VariantName, SKU, Barcode, Price, Cost, Unit
func (h *CatalogImportHandler) PostProductsImport(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	tenantID, _ := ctx.Value(tenantIDKey).(string)

	if err := r.ParseMultipartForm(10 << 20); err != nil {
		RespondError(w, http.StatusBadRequest, "VALIDATION_ERROR", "Gagal memproses form data")
		return
	}

	file, _, err := r.FormFile("file")
	if err != nil {
		RespondError(w, http.StatusBadRequest, "VALIDATION_ERROR", "Berkas CSV tidak ditemukan pada field 'file'")
		return
	}
	defer file.Close() //nolint:errcheck // hanya-baca, tidak ada state untuk diselamatkan

	reader := csv.NewReader(file)
	records, err := reader.ReadAll()
	if err != nil {
		RespondError(w, http.StatusBadRequest, "VALIDATION_ERROR", "Format CSV tidak valid")
		return
	}

	if len(records) <= 1 {
		RespondError(w, http.StatusBadRequest, "VALIDATION_ERROR", "CSV kosong atau hanya berisi header")
		return
	}

	tx, err := h.pool.Begin(ctx)
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal memulai transaksi impor")
		return
	}
	defer tx.Rollback(ctx) //nolint:errcheck // no-op setelah Commit berhasil

	productMap := make(map[string]string) // product_name -> product_id
	totalImported := 0

	for i, row := range records {
		if i == 0 {
			continue // Skip header
		}
		if len(row) < 7 {
			continue // Skip baris tidak lengkap
		}

		productName := strings.TrimSpace(row[0])
		variantName := strings.TrimSpace(row[1])
		sku := strings.TrimSpace(row[2])
		barcode := strings.TrimSpace(row[3])

		priceStr := strings.TrimSpace(row[4])
		costStr := strings.TrimSpace(row[5])
		unit := strings.TrimSpace(row[6])

		price, _ := decimal.NewFromString(priceStr)
		cost, _ := decimal.NewFromString(costStr)

		if unit == "" {
			unit = "pcs"
		}

		productID, exists := productMap[productName]
		if !exists {
			productID = "pr_" + ulid.Make().String()
			_, err = tx.Exec(ctx, `
				INSERT INTO products (id, tenant_id, name, is_active) 
				VALUES ($1, $2, $3, true)
			`, productID, tenantID, productName)
			if err != nil {
				continue
			}
			productMap[productName] = productID
		}

		variantID := "va_" + ulid.Make().String()

		var skuPtr, barcodePtr *string
		if sku != "" {
			skuPtr = &sku
		}
		if barcode != "" {
			barcodePtr = &barcode
		}

		_, err = tx.Exec(ctx, `
			INSERT INTO variants (id, tenant_id, product_id, name, sku, barcode, price, cost, unit, stock_quantity, min_stock_alert, is_active) 
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, 0, true)
		`, variantID, tenantID, productID, variantName, skuPtr, barcodePtr, price, cost, unit)

		if err == nil {
			totalImported++
		}
	}

	if err := tx.Commit(ctx); err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal menyimpan hasil impor")
		return
	}

	RespondJSON(w, http.StatusCreated, map[string]any{
		"message":       "Impor selesai",
		"total_records": totalImported,
	})
}
