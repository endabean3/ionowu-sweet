package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"unicode/utf8"

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
	if msg := bolehUbahKatalog(UserRole(r.Context()), false); msg != "" {
		RespondError(w, http.StatusForbidden, "FORBIDDEN_ROLE", msg)
		return
	}

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

// patchProductReq adalah isian PATCH /products/{id}; nil = tidak diubah.
type patchProductReq struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
	IsActive    *bool   `json:"is_active"`
}

// normalize merapikan isian dan mengembalikan pesan galat ("" = sah).
func (p *patchProductReq) normalize() string {
	if p.Name != nil {
		n := strings.TrimSpace(*p.Name)
		if n == "" {
			return "Nama produk tidak boleh kosong"
		}
		if utf8.RuneCountInString(n) > 200 {
			return "Nama produk maksimal 200 huruf"
		}
		p.Name = &n
	}
	if p.Description != nil {
		d := strings.TrimSpace(*p.Description)
		p.Description = &d
	}
	return ""
}

// patchVariantReq adalah isian PATCH /variants/{id}; nil = tidak diubah.
// Angka dikirim sebagai STRING desimal (uang & stok tidak pernah float).
type patchVariantReq struct {
	Name          *string `json:"name"`
	Price         *string `json:"price"`
	CostPrice     *string `json:"cost_price"`
	MinStockAlert *string `json:"min_stock_alert"`
	SKU           *string `json:"sku"`
	Barcode       *string `json:"barcode"`
	IsActive      *bool   `json:"is_active"`
	// Konversi satuan jual → satuan stok (ADR-0012). StockUom hanya berlaku
	// saat barang BELUM punya konversi; sesudahnya hanya faktornya yang
	// boleh berubah — lihat UpdateUomConversionFactor.
	StockUom    *string `json:"stock_uom"`
	StockFactor *string `json:"stock_factor"`

	price, costPrice, minStock, stockFactor decimal.NullDecimal
}

// ubahHarga: harga jual atau HPP ikut diubah — hak owner saja (RBAC-MODEL
// §Matriks "Ubah HPP & harga jual").
func (p *patchVariantReq) ubahHarga() bool { return p.Price != nil || p.CostPrice != nil }

func desimal(kolom, nilai string, skala int32) (decimal.NullDecimal, string) {
	d, err := decimal.NewFromString(strings.TrimSpace(nilai))
	if err != nil {
		return decimal.NullDecimal{}, kolom + " harus berupa angka"
	}
	if d.IsNegative() {
		return decimal.NullDecimal{}, kolom + " tidak boleh negatif"
	}
	if d.Exponent() < -skala {
		return decimal.NullDecimal{}, fmt.Sprintf("%s maksimal %d angka di belakang koma", kolom, skala)
	}
	// DECIMAL(14,x): 14 digit total → bagian bulat maksimal 14-x digit.
	if d.GreaterThanOrEqual(decimal.New(1, 14-skala)) {
		return decimal.NullDecimal{}, kolom + " terlalu besar"
	}
	return decimal.NullDecimal{Decimal: d, Valid: true}, ""
}

// normalize merapikan isian dan mengembalikan pesan galat ("" = sah).
// Sebelumnya harga yang tidak bisa dibaca DIABAIKAN diam-diam: "25.000"
// (titik ribuan) menghasilkan 200 OK tanpa mengubah harga apa pun.
func (p *patchVariantReq) normalize() string {
	var msg string
	if p.Name != nil {
		n := strings.TrimSpace(*p.Name)
		if utf8.RuneCountInString(n) > 200 {
			return "Nama varian maksimal 200 huruf"
		}
		p.Name = &n
	}
	if p.Price != nil {
		if p.price, msg = desimal("Harga jual", *p.Price, 2); msg != "" {
			return msg
		}
	}
	if p.CostPrice != nil {
		if p.costPrice, msg = desimal("HPP", *p.CostPrice, 2); msg != "" {
			return msg
		}
	}
	if p.MinStockAlert != nil {
		if p.minStock, msg = desimal("Batas stok menipis", *p.MinStockAlert, 3); msg != "" {
			return msg
		}
	}
	if p.StockFactor != nil {
		if p.stockFactor, msg = desimal("Faktor satuan stok", *p.StockFactor, 4); msg != "" {
			return msg
		}
		// Faktor 0 berarti "1 ml = 0 g": setiap penjualan akan mengurangi
		// stok NOL, dan stok bibit tidak pernah berkurang sepeser pun
		// sementara nota terlihat benar. CHECK di skema menolaknya juga,
		// tetapi pesan constraint tidak berarti apa-apa bagi pemilik toko.
		if p.stockFactor.Decimal.IsZero() {
			return "Faktor satuan stok harus lebih besar dari 0"
		}
	}
	if p.StockUom != nil {
		u := strings.TrimSpace(*p.StockUom)
		if u == "" || utf8.RuneCountInString(u) > 10 {
			return "Satuan stok maksimal 10 huruf"
		}
		p.StockUom = &u
		if p.StockFactor == nil {
			return "Satuan stok harus disertai faktornya"
		}
	}
	for kolom, v := range map[string]**string{"SKU": &p.SKU, "Barcode": &p.Barcode} {
		if *v == nil {
			continue
		}
		t := strings.TrimSpace(**v)
		if utf8.RuneCountInString(t) > 100 {
			return kolom + " maksimal 100 huruf"
		}
		*v = &t
	}
	return ""
}

// bolehUbahKatalog: RBAC-MODEL §Matriks "Tambah/ubah produk" = owner &
// manager; "Ubah HPP & harga jual" = owner saja. Sebelumnya endpoint ini
// tidak memeriksa peran — kasir bisa menurunkan harga lewat API.
func bolehUbahKatalog(role string, ubahHarga bool) string {
	switch role {
	case "owner":
		return ""
	case "manager":
		if ubahHarga {
			return "Hanya owner yang boleh mengubah harga jual dan HPP"
		}
		return ""
	default:
		return "Hanya owner atau manager yang boleh mengubah katalog"
	}
}

// PatchProduct menangani PATCH /products/{id}
func (h *CatalogHandler) PatchProduct(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	tenantID, _ := ctx.Value(tenantIDKey).(string)
	productID := chi.URLParam(r, "id")

	var req patchProductReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondError(w, http.StatusBadRequest, "VALIDATION_ERROR", "Payload tidak valid")
		return
	}
	if msg := req.normalize(); msg != "" {
		RespondError(w, http.StatusUnprocessableEntity, "VALIDATION_ERROR", msg)
		return
	}
	if msg := bolehUbahKatalog(UserRole(ctx), false); msg != "" {
		RespondError(w, http.StatusForbidden, "FORBIDDEN_ROLE", msg)
		return
	}

	n, err := h.queries.UpdateProduct(ctx, store.UpdateProductParams{
		TenantID:    tenantID,
		ID:          productID,
		Name:        req.Name,
		Description: req.Description,
		IsActive:    req.IsActive,
	})
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Update gagal")
		return
	}
	if n == 0 {
		// Id salah ATAU milik tenant lain — sengaja tidak dibedakan.
		RespondError(w, http.StatusNotFound, "PRODUCT_NOT_FOUND", "Produk tidak ditemukan")
		return
	}

	RespondJSON(w, http.StatusOK, map[string]any{"message": "Produk diupdate"})
}

// PatchVariant menangani PATCH /variants/{id}
func (h *CatalogHandler) PatchVariant(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	tenantID, _ := ctx.Value(tenantIDKey).(string)
	variantID := chi.URLParam(r, "id")

	var req patchVariantReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondError(w, http.StatusBadRequest, "VALIDATION_ERROR", "Payload tidak valid")
		return
	}
	if msg := req.normalize(); msg != "" {
		RespondError(w, http.StatusUnprocessableEntity, "VALIDATION_ERROR", msg)
		return
	}
	if msg := bolehUbahKatalog(UserRole(ctx), req.ubahHarga()); msg != "" {
		RespondError(w, http.StatusForbidden, "FORBIDDEN_ROLE", msg)
		return
	}

	n, err := h.queries.UpdateVariant(ctx, store.UpdateVariantParams{
		TenantID:      tenantID,
		ID:            variantID,
		Name:          req.Name,
		Price:         req.price,
		CostPrice:     req.costPrice,
		MinStockAlert: req.minStock,
		Sku:           req.SKU,
		Barcode:       req.Barcode,
		IsActive:      req.IsActive,
	})
	if err != nil {
		if isPgError(err, "23505") {
			RespondError(w, http.StatusConflict, "BARCODE_ALREADY_EXISTS", "Barcode sudah dipakai barang lain")
			return
		}
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Update gagal")
		return
	}
	if n == 0 {
		RespondError(w, http.StatusNotFound, "VARIANT_NOT_FOUND", "Varian tidak ditemukan")
		return
	}

	if req.StockFactor != nil {
		if msg := h.simpanKonversi(ctx, tenantID, variantID, &req); msg != "" {
			RespondError(w, http.StatusUnprocessableEntity, "VALIDATION_ERROR", msg)
			return
		}
	}

	RespondJSON(w, http.StatusOK, map[string]any{"message": "Varian diupdate"})
}

// simpanKonversi menulis faktor satuan stok (ADR-0012). Mengembalikan pesan
// untuk pemilik ("" = berhasil).
//
// Aturan yang ditegakkan di sini: satuan stok hanya boleh DITETAPKAN sekali.
// Setelahnya hanya faktornya yang berubah. Seluruh ledger stock_events
// barang ini sudah tercatat dalam satuan itu; menggantinya membuat gram dan
// mililiter berjumlah di kolom yang sama tanpa satu baris pun terlihat salah.
//
// Mengubah FAKTOR aman dan memang perlu (timbangan ulang bibit menghasilkan
// 0,92 g/ml, bukan 0,9): saldo stok yang sudah ada tetap dalam gram, dan
// faktor baru hanya dipakai penjualan berikutnya.
func (h *CatalogHandler) simpanKonversi(
	ctx context.Context, tenantID, variantID string, req *patchVariantReq,
) string {
	kini, err := h.queries.GetVariantConversion(ctx, store.GetVariantConversionParams{
		TenantID: tenantID, ID: variantID,
	})
	if err != nil {
		return "Gagal membaca satuan stok barang"
	}

	if kini.StockUom == "" {
		if req.StockUom == nil {
			return "Barang ini belum punya satuan stok; sertakan stock_uom"
		}
		if _, err := h.queries.InsertUomConversion(ctx, store.InsertUomConversionParams{
			ConversionID: ulid.Make().String(), TenantID: tenantID, VariantID: variantID,
			ToUom: *req.StockUom, Factor: req.stockFactor.Decimal,
		}); err != nil {
			return "Gagal menyimpan satuan stok"
		}
		return ""
	}

	if req.StockUom != nil && *req.StockUom != kini.StockUom {
		return "Satuan stok tidak bisa diganti dari " + kini.StockUom +
			" — seluruh riwayat stok barang ini sudah tercatat dalam satuan itu. Buat barang baru bila memang berbeda."
	}
	if _, err := h.queries.UpdateUomConversionFactor(ctx, store.UpdateUomConversionFactorParams{
		TenantID: tenantID, VariantID: variantID, Factor: req.stockFactor.Decimal,
	}); err != nil {
		return "Gagal menyimpan faktor satuan stok"
	}
	return ""
}

// GetVariant menangani GET /variants/{id} — isian layar "Ubah barang".
//
// HPP hanya dikirim ke owner (RBAC-MODEL §Matriks "Ubah HPP & harga jual",
// SECURITY.md §3). Inilah alasan endpoint ini ada sama sekali: cost_price
// TIDAK ikut /sync/pull, karena apa pun yang disinkronkan ikut menetap di
// IndexedDB setiap ponsel kasir.
func (h *CatalogHandler) GetVariant(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	tenantID, _ := ctx.Value(tenantIDKey).(string)

	if msg := bolehUbahKatalog(UserRole(ctx), false); msg != "" {
		RespondError(w, http.StatusForbidden, "FORBIDDEN_ROLE", msg)
		return
	}

	v, err := h.queries.GetVariantDetail(ctx, store.GetVariantDetailParams{
		TenantID: tenantID, ID: chi.URLParam(r, "id"),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		RespondError(w, http.StatusNotFound, "VARIANT_NOT_FOUND", "Varian tidak ditemukan")
		return
	}
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal memuat barang")
		return
	}

	out := map[string]any{
		"id":              v.ID,
		"name":            v.Name,
		"sku":             v.Sku,
		"barcode":         v.Barcode,
		"price":           v.Price,
		"min_stock_alert": v.MinStockAlert,
		"uom":             v.Uom,
		"uom_precision":   v.UomPrecision,
		"is_active":       v.IsActive,
		"stock_uom":       v.StockUom,
		"stock_factor":    v.StockFactor,
	}
	if UserRole(ctx) == "owner" {
		out["cost_price"] = v.CostPrice
	}
	RespondJSON(w, http.StatusOK, map[string]any{"data": out})
}

// kosongJadiNull mengubah "" menjadi NULL untuk kolom nullable yang ikut
// indeks unik parsial. Lihat catatan di PostProduct.
func kosongJadiNull(nilai string) *string {
	if nilai == "" {
		return nil
	}
	return &nilai
}
