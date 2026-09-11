package httpapi

import (
	"encoding/csv"
	"net/http"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/oklog/ulid/v2"
	"github.com/shopspring/decimal"

	"github.com/endabean3/ionowu-sweet/services/pos-engine/internal/store"
)

// validImportItemTypes cocok dengan CHECK constraint variants.item_type
// (migrations/00003). Baris dengan item_type di luar ini dilewati, bukan
// menggagalkan seluruh impor — konsisten dengan pola "skip baris rusak" yang
// sudah dipakai di handler ini.
var validImportItemTypes = map[string]bool{"stock": true, "composite": true, "service": true, "time_based": true}

type CatalogImportHandler struct {
	pool *pgxpool.Pool
	q    *store.Queries
}

func NewCatalogImportHandler(pool *pgxpool.Pool) *CatalogImportHandler {
	return &CatalogImportHandler{pool: pool, q: store.New(pool)}
}

// PostProductsImport menangani upload CSV multipart/form-data.
//
// Format CSV (baris pertama header, dilewati apa pun isinya):
//
//	ProductName, VariantName, SKU, Barcode, Price, CostPrice, Uom, UomPrecision, StockQuantity, ItemType
//
// Kolom ke-7 (Uom) dst opsional — kosong berarti "pcs"/0/0/"stock" (arketipe A,
// retail satuan). Arketipe B (Warung Wangi: ml, Media Boga: gram/kg) WAJIB
// mengisi Uom eksplisit; UomPrecision menentukan berapa digit desimal boleh
// diinput kasir saat menimbang (MARKET-SEGMENTS.md §4 — stok arketipe B harus
// desimal, bukan dibulatkan diam-diam jadi "pcs").
//
// Resep/BOM (Warung Wangi: bibit + botol + alkohol) TIDAK dicakup format ini —
// item_type "composite" bisa diimpor tapi baris bom_components-nya harus
// disusulkan lewat jalur terpisah (belum ada endpoint-nya, lihat follow-up).
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
		uom := strings.TrimSpace(row[6])

		price, _ := decimal.NewFromString(priceStr)
		cost, _ := decimal.NewFromString(costStr)

		if uom == "" {
			uom = "pcs"
		}

		uomPrecision := 0
		if len(row) > 7 && strings.TrimSpace(row[7]) != "" {
			if p, err := strconv.Atoi(strings.TrimSpace(row[7])); err == nil && p >= 0 && p <= 3 {
				uomPrecision = p
			}
		}

		stockQty := decimal.Zero
		if len(row) > 8 && strings.TrimSpace(row[8]) != "" {
			if q, err := decimal.NewFromString(strings.TrimSpace(row[8])); err == nil {
				stockQty = q
			}
		}

		itemType := "stock"
		if len(row) > 9 && strings.TrimSpace(row[9]) != "" {
			candidate := strings.TrimSpace(row[9])
			if !validImportItemTypes[candidate] {
				continue // item_type tidak dikenal — lewati baris, bukan gagalkan seluruh impor
			}
			itemType = candidate
		}

		productID, exists := productMap[productName]
		if !exists {
			// ULID MURNI — products.id/variants.id adalah VARCHAR(26)
			// (migrations/00003); prefiks membuatnya 29+ karakter dan
			// INSERT gagal "value too long".
			productID = ulid.Make().String()
			_, err = tx.Exec(ctx, `
				INSERT INTO products (id, tenant_id, name, is_active) 
				VALUES ($1, $2, $3, true)
			`, productID, tenantID, productName)
			if err != nil {
				continue
			}
			productMap[productName] = productID
		}

		variantID := ulid.Make().String()

		var skuPtr, barcodePtr *string
		if sku != "" {
			skuPtr = &sku
		}
		if barcode != "" {
			barcodePtr = &barcode
		}

		// Kolom sebenarnya adalah cost_price/uom (bukan cost/unit) —
		// migrations/00003. INSERT dengan nama kolom yang salah sebelumnya
		// membuat SETIAP baris impor gagal "column does not exist", ditemukan
		// baru sekarang karena fitur ini belum pernah benar-benar dicoba.
		_, err = tx.Exec(ctx, `
			INSERT INTO variants (id, tenant_id, product_id, name, sku, barcode, price, cost_price, uom, uom_precision, item_type, stock_quantity, min_stock_alert, is_active)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 0, true)
		`, variantID, tenantID, productID, variantName, skuPtr, barcodePtr, price, cost, uom, uomPrecision, itemType, stockQty)

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
