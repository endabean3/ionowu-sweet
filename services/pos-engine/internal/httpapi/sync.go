package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/endabean3/ionowu-sweet/services/pos-engine/internal/money"
	"github.com/endabean3/ionowu-sweet/services/pos-engine/internal/store"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/oklog/ulid/v2"
	"github.com/shopspring/decimal"
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
	// Satuan tempat stock_quantity dihitung bila berbeda dari uom (ADR-0012):
	// bibit dijual per ml, stoknya gram. Kosong = sama dengan uom.
	StockUom      string `json:"stock_uom,omitempty"`
	StockFactor   string `json:"stock_factor,omitempty"`
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
			StockUom:      row.StockUom,
			StockFactor:   stockFactorString(row.StockUom, row.StockFactor),
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

// mapToStruct re-decode satu elemen map[string]interface{} ke struct
// bertipe lewat json.Marshal→Unmarshal — cara paling sederhana memakai
// decimal.Decimal/time.Time UnmarshalJSON yang sudah benar, dibanding
// type-assert manual per field.
func mapToStruct(m map[string]interface{}, out interface{}) error {
	b, err := json.Marshal(m)
	if err != nil {
		return err
	}
	return json.Unmarshal(b, out)
}

func (h *SyncHandler) PostSyncPush(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	tenantID := TenantID(ctx)
	cashierID := UserID(ctx)

	var req syncPushRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondError(w, http.StatusBadRequest, "VALIDATION_ERROR", "Payload tidak valid")
		return
	}

	var res syncPushResponse
	res.Results = make([]syncPushResult, 0)

	q := store.New(h.pool)

	// Urutan WAJIB (openapi.yaml /sync/push, DAT-05 di fondasi-server-ionowu
	// berlaku prinsipnya juga di sini): shifts_open dulu, baru sales +
	// stock_events, baru shifts_close — karena sales_transactions.shift_id
	// dan cash_movements ber-FK ke shifts. Sebelumnya endpoint ini TIDAK
	// menulis apa pun ke database sama sekali (stub "MVP: mark accepted"),
	// sehingga transaksi offline yang di-sync HILANG DIAM-DIAM — bertentangan
	// langsung dengan invarian #4 CLAUDE.md ("transaksi offline selalu
	// diterima"). Ditemukan lewat uji checkout end-to-end nyata di browser,
	// bukan asumsi dari nama fungsi yang terlihat benar.
	for _, item := range req.ShiftsOpen {
		id, _ := item["id"].(string)
		status, detail := h.applyShiftOpen(ctx, q, tenantID, item)
		res.Results = append(res.Results, syncPushResult{ClientID: id, Status: status, Detail: detail})
	}
	for _, item := range req.Sales {
		id, _ := item["id"].(string)
		status, detail := h.applySale(ctx, q, tenantID, cashierID, item)
		res.Results = append(res.Results, syncPushResult{ClientID: id, Status: status, Detail: detail})
	}
	for _, item := range req.StockEvents {
		id, _ := item["id"].(string)
		status, detail := h.applyStockEvent(ctx, q, tenantID, cashierID, item)
		res.Results = append(res.Results, syncPushResult{ClientID: id, Status: status, Detail: detail})
	}
	for _, item := range req.ShiftsClose {
		id, _ := item["id"].(string)
		status, detail := h.applyShiftClose(ctx, q, tenantID, item)
		res.Results = append(res.Results, syncPushResult{ClientID: id, Status: status, Detail: detail})
	}

	RespondJSON(w, http.StatusOK, res)
}

type syncShiftOpenPayload struct {
	ID          string    `json:"id"`
	OutletID    string    `json:"outlet_id"`
	CashierID   string    `json:"cashier_id"`
	OpenedAt    time.Time `json:"opened_at"`
	OpeningCash string    `json:"opening_cash"`
}

func (h *SyncHandler) applyShiftOpen(ctx context.Context, q *store.Queries, tenantID string, raw map[string]interface{}) (status, detail string) {
	var p syncShiftOpenPayload
	if err := mapToStruct(raw, &p); err != nil {
		return "rejected", "payload shift_open tidak valid"
	}
	cash, err := decimal.NewFromString(p.OpeningCash)
	if err != nil {
		return "rejected", "opening_cash bukan angka valid"
	}

	_, err = q.OpenShift(ctx, store.OpenShiftParams{
		ID: p.ID, TenantID: tenantID, OutletID: p.OutletID, CashierID: p.CashierID,
		OpenedAt: toTimestamptz(p.OpenedAt), OpeningCash: cash,
	})
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			// DUA constraint berbeda menghasilkan SQLSTATE yang SAMA (23505),
			// dan artinya SANGAT berbeda — disamaratakan sebelumnya adalah
			// bug nyata, ditemukan lewat replay payload manual (curl) setelah
			// klien menandai "synced" padahal shift-nya TIDAK PERNAH tercatat:
			//
			//   shifts_pkey (PK id)   → ULID ini SUDAH masuk — retry push
			//                           yang aman, ACCEPTED (ERROR-CATALOG §4).
			//   idx_shifts_one_open   → ULID ini BELUM pernah masuk, tapi
			//                           kasir SUDAH punya shift terbuka lain
			//                           (mis. lupa ditutup sesi sebelumnya).
			//                           Menganggapnya "accepted" membuat
			//                           klien menandai synced untuk shift
			//                           yang TIDAK ADA di server — sale
			//                           berikutnya yang mereferensikan
			//                           shift_id ini akan gagal foreign key.
			if pgErr.ConstraintName == "idx_shifts_one_open" {
				return "rejected", "kasir sudah memiliki shift terbuka lain di outlet ini — tutup shift itu dulu"
			}
			return "duplicate", ""
		}
		return "rejected", "gagal membuka shift: " + err.Error()
	}
	return "accepted", ""
}

type syncSaleItemPayload struct {
	VariantID string          `json:"variant_id"`
	Qty       decimal.Decimal `json:"qty"`
	UnitPrice decimal.Decimal `json:"unit_price"`
	Discount  decimal.Decimal `json:"discount"`
}

type syncSalePaymentPayload struct {
	Method string          `json:"method"`
	Amount decimal.Decimal `json:"amount"`
}

type syncSalePayload struct {
	ID         string                   `json:"id"`
	OutletID   string                   `json:"outlet_id"`
	ShiftID    string                   `json:"shift_id"`
	Items      []syncSaleItemPayload    `json:"items"`
	Payments   []syncSalePaymentPayload `json:"payments"`
	Discount   decimal.Decimal          `json:"discount"`
	Tax        decimal.Decimal          `json:"tax"`
	OccurredAt time.Time                `json:"occurred_at"`
}

// applySale menulis satu transaksi offline. Beda dari CheckoutHandler.PostSale
// (checkout.go) yang online — di sini stok BOLEH negatif
// (DecrementStockAllowNegative, bukan Strict) karena barang sudah keluar
// secara fisik saat offline; menolaknya berarti menghapus penjualan nyata
// (OFFLINE-SYNC-SPEC §2 prinsip 3).
//
// PENYEDERHANAAN YANG DISADARI: unit_cost seharusnya snapshot dari klien
// (OFFLINE-SYNC-SPEC melarang server look-up cost_price saat sync, karena
// harga bisa sudah berubah selama offline), tapi apps/web belum mengirim
// unit_cost sama sekali di payload sale-nya. Sampai itu digarap, cost_price
// diselesaikan di server sebagai HPP TERKINI (bukan HPP saat transaksi) —
// lebih baik daripada 0, tapi bukan yang benar. Dicatat di ADR/follow-up.
func (h *SyncHandler) applySale(ctx context.Context, q *store.Queries, tenantID, cashierID string, raw map[string]interface{}) (status, detail string) {
	var p syncSalePayload
	if err := mapToStruct(raw, &p); err != nil {
		return "rejected", "payload sale tidak valid"
	}
	if len(p.Items) == 0 || len(p.Payments) == 0 {
		return "rejected", "items dan payments wajib diisi"
	}

	type resolved struct {
		variantID string
		itemType  string
		uom       string
		qty       decimal.Decimal
		unitPrice decimal.Decimal
		unitCost  decimal.Decimal
		subtotal  decimal.Decimal
		// Satuan stok bila berbeda dari satuan jual (ADR-0012).
		stockUom    string
		stockFactor decimal.Decimal
	}
	resolvedItems := make([]resolved, 0, len(p.Items))
	moneyItems := make([]money.Item, 0, len(p.Items))
	for _, it := range p.Items {
		variant, err := q.GetVariantForCheckout(ctx, store.GetVariantForCheckoutParams{
			TenantID: tenantID, ID: it.VariantID, OutletID: p.OutletID,
		})
		if errors.Is(err, pgx.ErrNoRows) {
			return "rejected", "varian tidak ditemukan: " + it.VariantID
		}
		if err != nil {
			return "rejected", "gagal mengambil varian: " + err.Error()
		}
		lineSubtotal := it.UnitPrice.Mul(it.Qty).Sub(it.Discount).Round(2)
		resolvedItems = append(resolvedItems, resolved{
			variantID: it.VariantID, itemType: variant.ItemType, uom: variant.Uom,
			qty: it.Qty, unitPrice: it.UnitPrice, unitCost: variant.CostPrice, subtotal: lineSubtotal,
			stockUom: variant.StockUom, stockFactor: variant.StockFactor,
		})
		moneyItems = append(moneyItems, money.Item{Quantity: it.Qty, UnitPrice: it.UnitPrice, Discount: it.Discount})
	}

	calc := money.Calculate(money.Input{Items: moneyItems, Discount: p.Discount, TaxRate: decimal.Zero})
	grandTotal := calc.Subtotal.Sub(calc.DiscountTotal).Add(p.Tax).Round(2)

	payments := make([]decimal.Decimal, 0, len(p.Payments))
	for _, pay := range p.Payments {
		payments = append(payments, pay.Amount)
	}
	if !money.MatchesTotal(payments, grandTotal) {
		// PAYMENT_AMOUNT_MISMATCH (ERROR-CATALOG §B) — kelas PERMANENT,
		// bukan sesuatu yang membaik dengan diulang.
		return "rejected", "jumlah pembayaran tidak sama dengan total transaksi"
	}

	tx, err := h.pool.Begin(ctx)
	if err != nil {
		return "rejected", "gagal memulai transaksi database"
	}
	defer tx.Rollback(ctx) //nolint:errcheck // no-op setelah Commit berhasil
	qtx := q.WithTx(tx)

	receiptNumber := p.OccurredAt.UTC().Format("20060102150405") + "-" + p.ID[max(0, len(p.ID)-6):]
	sale, err := qtx.CreateSaleIdempotent(ctx, store.CreateSaleIdempotentParams{
		ID: p.ID, TenantID: tenantID, OutletID: p.OutletID, CashierID: cashierID,
		ShiftID: &p.ShiftID, ReceiptNumber: receiptNumber,
		Subtotal: calc.Subtotal, DiscountTotal: calc.DiscountTotal, TaxTotal: p.Tax, GrandTotal: grandTotal,
		PaymentStatus:       "paid",
		OfflineCreatedAt:    toTimestamptz(p.OccurredAt),
		OfflineCreatedAtAdj: toTimestamptz(p.OccurredAt),
		IsLateArrival:       false,
		IsSandbox:           false,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		// ULID sudah pernah masuk — ACCEPTED (ERROR-CATALOG §4), bukan error.
		return "duplicate", ""
	}
	if err != nil {
		return "rejected", "gagal mencatat transaksi: " + err.Error()
	}

	itemParams := make([]store.InsertSalesItemsParams, 0, len(resolvedItems))
	for _, it := range resolvedItems {
		itemParams = append(itemParams, store.InsertSalesItemsParams{
			ID: ulid.Make().String(), TenantID: tenantID, TransactionID: sale.ID,
			VariantID: it.variantID, Quantity: it.qty, Uom: it.uom,
			UnitPrice: it.unitPrice, UnitCost: it.unitCost, Subtotal: it.subtotal,
		})
	}
	if _, err := qtx.InsertSalesItems(ctx, itemParams); err != nil {
		return "rejected", "gagal mencatat item transaksi: " + err.Error()
	}

	for _, pay := range p.Payments {
		if _, err := qtx.InsertPayment(ctx, store.InsertPaymentParams{
			ID: ulid.Make().String(), TenantID: tenantID, TransactionID: sale.ID,
			PaymentMethod: pay.Method, Amount: pay.Amount,
		}); err != nil {
			return "rejected", "gagal mencatat pembayaran: " + err.Error()
		}
	}

	stockEvents := make([]store.InsertStockEventsParams, 0, len(resolvedItems))
	for _, it := range resolvedItems {
		if it.itemType != "stock" && it.itemType != "composite" {
			continue // service/time_based: tidak berstok
		}
		keluar, satuanStok := stockDeduction(it.qty, it.uom, it.stockUom, it.stockFactor)
		balance, err := qtx.DecrementStockAllowNegative(ctx, store.DecrementStockAllowNegativeParams{
			TenantID: tenantID, ID: it.variantID, StockQuantity: keluar,
		})
		if err != nil {
			return "rejected", "gagal memotong stok: " + err.Error()
		}
		actorID := cashierID
		stockEvents = append(stockEvents, store.InsertStockEventsParams{
			ID: ulid.Make().String(), TenantID: tenantID, OutletID: p.OutletID,
			VariantID: it.variantID, EventType: "sale", QuantityDelta: keluar.Neg(),
			BalanceAfter: balance, Uom: satuanStok, ReferenceID: &sale.ID, ActorUserID: &actorID,
		})
	}
	if len(stockEvents) > 0 {
		if _, err := qtx.InsertStockEvents(ctx, stockEvents); err != nil {
			return "rejected", "gagal mencatat ledger stok: " + err.Error()
		}
	}

	payload, _ := json.Marshal(map[string]any{"sale_id": sale.ID, "outlet_id": p.OutletID, "grand_total": grandTotal})
	if _, err := qtx.InsertOutboxEvent(ctx, store.InsertOutboxEventParams{
		ID: ulid.Make().String(), TenantID: tenantID, EventType: "sale.created",
		Version: 1, Payload: payload, OccurredAt: toTimestamptz(p.OccurredAt),
	}); err != nil {
		return "rejected", "gagal mencatat event outbox: " + err.Error()
	}

	if err := tx.Commit(ctx); err != nil {
		return "rejected", "gagal menyimpan transaksi: " + err.Error()
	}
	return "accepted", ""
}

type syncStockEventPayload struct {
	ID         string          `json:"id"`
	OutletID   string          `json:"outlet_id"`
	VariantID  string          `json:"variant_id"`
	Delta      decimal.Decimal `json:"delta"` // negatif = keluar
	OccurredAt time.Time       `json:"occurred_at"`
}

func (h *SyncHandler) applyStockEvent(ctx context.Context, q *store.Queries, tenantID, cashierID string, raw map[string]interface{}) (status, detail string) {
	var p syncStockEventPayload
	if err := mapToStruct(raw, &p); err != nil {
		return "rejected", "payload stock_event tidak valid"
	}

	variant, err := q.GetVariantForCheckout(ctx, store.GetVariantForCheckoutParams{
		TenantID: tenantID, ID: p.VariantID, OutletID: p.OutletID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return "rejected", "varian tidak ditemukan: " + p.VariantID
	}
	if err != nil {
		return "rejected", "gagal mengambil varian: " + err.Error()
	}

	// delta sudah bertanda (negatif = keluar). DecrementStockAllowNegative
	// melakukan stock_quantity - $3, jadi kirim -delta agar hasilnya
	// stock_quantity + delta.
	balance, err := q.DecrementStockAllowNegative(ctx, store.DecrementStockAllowNegativeParams{
		TenantID: tenantID, ID: p.VariantID, StockQuantity: p.Delta.Neg(),
	})
	if err != nil {
		return "rejected", "gagal memperbarui stok: " + err.Error()
	}

	actorID := cashierID
	if _, err := q.InsertStockEvents(ctx, []store.InsertStockEventsParams{{
		ID: ulid.Make().String(), TenantID: tenantID, OutletID: p.OutletID,
		VariantID: p.VariantID, EventType: "opname_adjust", QuantityDelta: p.Delta,
		BalanceAfter: balance, Uom: variant.Uom, ActorUserID: &actorID,
	}}); err != nil {
		return "rejected", "gagal mencatat ledger stok: " + err.Error()
	}
	return "accepted", ""
}

type syncShiftClosePayload struct {
	ID          string    `json:"id"`
	ClosingCash string    `json:"closing_cash"`
	OccurredAt  time.Time `json:"occurred_at"`
}

func (h *SyncHandler) applyShiftClose(ctx context.Context, q *store.Queries, tenantID string, raw map[string]interface{}) (status, detail string) {
	var p syncShiftClosePayload
	if err := mapToStruct(raw, &p); err != nil {
		return "rejected", "payload shift_close tidak valid"
	}
	closingCash, err := decimal.NewFromString(p.ClosingCash)
	if err != nil {
		return "rejected", "closing_cash bukan angka valid"
	}

	expected, err := q.CalculateExpectedCash(ctx, store.CalculateExpectedCashParams{TenantID: tenantID, ID: p.ID})
	if errors.Is(err, pgx.ErrNoRows) {
		return "rejected", "shift tidak ditemukan"
	}
	if err != nil {
		return "rejected", "gagal menghitung kas yang diharapkan: " + err.Error()
	}
	expectedCash := expected.OpeningCash.Add(expected.CashSales).Add(expected.CashIn).Sub(expected.CashOut)

	_, err = q.CloseShift(ctx, store.CloseShiftParams{
		TenantID: tenantID, ID: p.ID, ClosedAt: toTimestamptz(p.OccurredAt),
		ExpectedCash: decimal.NewNullDecimal(expectedCash), CountedCash: decimal.NewNullDecimal(closingCash),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		// Sudah ditutup sebelumnya (retry push) — ACCEPTED, bukan error.
		return "duplicate", ""
	}
	if err != nil {
		return "rejected", "gagal menutup shift: " + err.Error()
	}
	return "accepted", ""
}
