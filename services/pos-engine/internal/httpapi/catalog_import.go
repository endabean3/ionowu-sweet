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
	dilewati := []BarisDilewati{}

	for i, row := range records {
		if i == 0 {
			continue // Skip header
		}
		nomorBaris := i + 1 // nomor baris di berkas; header = baris 1

		b, alasan := parseBarisImpor(row)
		if alasan != "" {
			dilewati = append(dilewati, BarisDilewati{Baris: nomorBaris, Alasan: alasan})
			continue
		}

		// SAVEPOINT per baris. Di Postgres, satu statement yang gagal
		// membatalkan SELURUH transaksi: setiap INSERT sesudahnya ditolak
		// "current transaction is aborted", lalu Commit berubah jadi
		// rollback. Tanpa savepoint, komentar lama "lewati baris rusak"
		// tidak pernah benar — satu baris bermasalah menggagalkan seluruh
		// impor. pgx memetakan tx.Begin di dalam transaksi ke SAVEPOINT.
		sp, err := tx.Begin(ctx)
		if err != nil {
			RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal membuat savepoint impor")
			return
		}

		productID, exists := productMap[b.productName]
		if !exists {
			// ULID MURNI — products.id/variants.id adalah VARCHAR(26)
			// (migrations/00003); prefiks membuatnya 29+ karakter dan
			// INSERT gagal "value too long".
			productID = ulid.Make().String()
			if _, err = sp.Exec(ctx, `
				INSERT INTO products (id, tenant_id, name, is_active)
				VALUES ($1, $2, $3, true)
			`, productID, tenantID, b.productName); err != nil {
				_ = sp.Rollback(ctx)
				dilewati = append(dilewati, BarisDilewati{Baris: nomorBaris, Alasan: "produk gagal disimpan"})
				continue
			}
		}

		variantID := ulid.Make().String()

		// Kolom sebenarnya adalah cost_price/uom (bukan cost/unit) —
		// migrations/00003. INSERT dengan nama kolom yang salah sebelumnya
		// membuat SETIAP baris impor gagal "column does not exist", ditemukan
		// baru sekarang karena fitur ini belum pernah benar-benar dicoba.
		if _, err = sp.Exec(ctx, `
			INSERT INTO variants (id, tenant_id, product_id, name, sku, barcode, price, cost_price, uom, uom_precision, item_type, stock_quantity, min_stock_alert, is_active)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 0, true)
		`, variantID, tenantID, productID, b.variantName, b.sku, b.barcode, b.price, b.cost, b.uom, b.uomPrecision, b.itemType, b.stockQty); err != nil {
			_ = sp.Rollback(ctx)
			dilewati = append(dilewati, BarisDilewati{Baris: nomorBaris, Alasan: "varian gagal disimpan (barcode/SKU ganda?)"})
			continue
		}

		if err = sp.Commit(ctx); err != nil {
			dilewati = append(dilewati, BarisDilewati{Baris: nomorBaris, Alasan: "baris gagal dikonfirmasi"})
			continue
		}
		// Dicatat SETELAH savepoint lolos. Kalau dicatat lebih awal, produk
		// yang ikut ter-rollback akan tetap dirujuk baris berikutnya — dan
		// varian-variannya menunjuk ke products.id yang tidak pernah ada.
		productMap[b.productName] = productID
		totalImported++
	}

	if err := tx.Commit(ctx); err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal menyimpan hasil impor")
		return
	}

	RespondJSON(w, http.StatusCreated, map[string]any{
		"message":       "Impor selesai",
		"total_records": totalImported,
		// Baris yang dilewati DILAPORKAN, bukan hilang diam-diam. Pemilik
		// yang mengimpor 150 barang harus tahu persis mana yang tidak masuk.
		"dilewati": dilewati,
	})
}

// BarisDilewati melaporkan baris CSV yang tidak diimpor beserta alasannya.
type BarisDilewati struct {
	Baris  int    `json:"baris"`
	Alasan string `json:"alasan"`
}

type barisImpor struct {
	productName, variantName string
	sku, barcode             *string
	price, cost              decimal.Decimal
	uom                      string
	uomPrecision             int
	stockQty                 decimal.Decimal
	itemType                 string
}

// parseBarisImpor memvalidasi satu baris CSV. Fungsi murni — tanpa database —
// supaya aturannya bisa diuji langsung.
//
// Mengembalikan alasan penolakan (string kosong = sah). Setiap aturan di sini
// dulunya "diam-diam": nilai rusak diubah jadi nol lalu tetap diimpor.
func parseBarisImpor(row []string) (barisImpor, string) {
	if len(row) < 7 {
		return barisImpor{}, "kolom kurang dari 7"
	}
	kol := func(i int) string {
		if i < len(row) {
			return strings.TrimSpace(row[i])
		}
		return ""
	}

	b := barisImpor{
		productName: kol(0),
		variantName: kol(1),
		uom:         kol(6),
		itemType:    "stock",
	}
	if b.productName == "" {
		return barisImpor{}, "nama produk kosong"
	}
	if b.variantName == "" {
		b.variantName = "Reguler"
	}
	if sku := kol(2); sku != "" {
		b.sku = &sku
	}
	// Barcode kosong WAJIB jadi NULL — idx_variants_barcode unik pada
	// (tenant_id, barcode) untuk yang bukan NULL; string kosong ikut terindeks.
	if barcode := kol(3); barcode != "" {
		b.barcode = &barcode
	}

	// Harga WAJIB ada. Sebelumnya harga kosong/rusak diabaikan errornya dan
	// menjadi Rp 0 — barangnya masuk kasir dan bisa terjual GRATIS.
	price, err := decimal.NewFromString(kol(4))
	if err != nil {
		return barisImpor{}, "harga kosong atau bukan angka"
	}
	if price.IsNegative() {
		return barisImpor{}, "harga negatif"
	}
	b.price = price

	// Harga modal boleh kosong (HPP sering belum dicatat), tetapi bila diisi
	// harus sah.
	if c := kol(5); c != "" {
		cost, err := decimal.NewFromString(c)
		if err != nil || cost.IsNegative() {
			return barisImpor{}, "harga modal tidak valid"
		}
		b.cost = cost
	}

	if b.uom == "" {
		b.uom = "pcs"
	}

	if p := kol(7); p != "" {
		n, err := strconv.Atoi(p)
		if err != nil || n < 0 || n > 3 {
			return barisImpor{}, "presisi satuan harus 0-3"
		}
		b.uomPrecision = n
	}

	// Stok boleh kosong (= 0) dan boleh NEGATIF: transaksi offline yang sudah
	// terjadi tidak pernah ditolak (CLAUDE.md §6.4). Yang ditolak hanya
	// isian yang bukan angka.
	if q := kol(8); q != "" {
		qty, err := decimal.NewFromString(q)
		if err != nil {
			return barisImpor{}, "stok bukan angka"
		}
		if -qty.Exponent() > int32(b.uomPrecision) && !qty.Equal(qty.Truncate(int32(b.uomPrecision))) {
			return barisImpor{}, "stok punya desimal melebihi presisi satuan"
		}
		b.stockQty = qty
	}

	if t := kol(9); t != "" {
		if !validImportItemTypes[t] {
			return barisImpor{}, "jenis barang tidak dikenal"
		}
		b.itemType = t
	}

	return b, ""
}
