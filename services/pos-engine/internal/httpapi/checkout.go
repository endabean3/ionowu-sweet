package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/oklog/ulid/v2"
	"github.com/shopspring/decimal"

	"github.com/endabean3/docs-umkm-intelligence/services/pos-engine/internal/money"
	"github.com/endabean3/docs-umkm-intelligence/services/pos-engine/internal/store"
)

// CheckoutHandler mengimplementasikan POST /sales — jalur uang HOT PATH yang
// didokumentasikan penuh di 30-data/queries/checkout.sql dan
// services/pos-engine/internal/store/checkout.sql.go (komentar urutan
// transaksi BEGIN..COMMIT).
type CheckoutHandler struct {
	pool *pgxpool.Pool
	q    *store.Queries
}

func NewCheckoutHandler(pool *pgxpool.Pool) *CheckoutHandler {
	return &CheckoutHandler{pool: pool, q: store.New(pool)}
}

type saleItemInput struct {
	VariantID string          `json:"variant_id"`
	Qty       decimal.Decimal `json:"qty"`
	Discount  decimal.Decimal `json:"discount"`
}

type salePaymentInput struct {
	Method    string          `json:"method"`
	Amount    decimal.Decimal `json:"amount"`
	Reference *string         `json:"reference"`
}

type saleInput struct {
	ID         string             `json:"id"`
	OutletID   string             `json:"outlet_id"`
	ShiftID    string             `json:"shift_id"`
	CustomerID *string            `json:"customer_id"`
	Items      []saleItemInput    `json:"items"`
	Payments   []salePaymentInput `json:"payments"`
	Discount   decimal.Decimal    `json:"discount"`
	Tax        decimal.Decimal    `json:"tax"`
	Total      decimal.Decimal    `json:"total"`
	OccurredAt time.Time          `json:"occurred_at"`
}

type saleResponse struct {
	ID            string          `json:"id"`
	ReceiptNumber string          `json:"receipt_number"`
	Subtotal      decimal.Decimal `json:"subtotal"`
	Discount      decimal.Decimal `json:"discount"`
	Tax           decimal.Decimal `json:"tax"`
	Total         decimal.Decimal `json:"total"`
	Status        string          `json:"status"`
	RecordedAt    time.Time       `json:"recorded_at"`
}

// resolvedItem carries server-resolved pricing — never trust the client's
// unit_price/unit_cost for the ONLINE checkout path (MULTI-OUTLET §2:
// "harga diselesaikan DI SERVER"). This distinguishes POST /sales (online,
// implemented here) from POST /sync/push (offline replay, out of scope this
// session — that path DOES trust client cost, ERROR-CATALOG §B).
type resolvedItem struct {
	saleItemInput
	ItemType  string
	Uom       string
	UnitPrice decimal.Decimal
	UnitCost  decimal.Decimal
	Subtotal  decimal.Decimal
}

func toTimestamptz(t time.Time) pgtype.Timestamptz {
	return pgtype.Timestamptz{Time: t, Valid: true}
}

// PostSale menangani POST /sales.
func (h *CheckoutHandler) PostSale(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	tenantID := TenantID(ctx)
	cashierID := UserID(ctx)

	var req saleInput
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondError(w, http.StatusBadRequest, "VALIDATION_ERROR", "Payload tidak valid")
		return
	}
	if req.ID == "" || req.OutletID == "" || req.ShiftID == "" || len(req.Items) == 0 || len(req.Payments) == 0 {
		RespondError(w, http.StatusBadRequest, "VALIDATION_ERROR", "id, outlet_id, shift_id, items, payments wajib diisi")
		return
	}

	// FR-30: kasir tidak bisa bertransaksi tanpa shift terbuka.
	openShift, err := h.q.GetOpenShift(ctx, store.GetOpenShiftParams{
		TenantID: tenantID, OutletID: req.OutletID, CashierID: cashierID,
	})
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		RespondError(w, http.StatusUnprocessableEntity, "SHIFT_NOT_OPEN", "Kasir belum membuka shift")
		return
	case err != nil:
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal memeriksa shift")
		return
	case openShift.ID != req.ShiftID:
		RespondError(w, http.StatusUnprocessableEntity, "SHIFT_CLOSED", "Shift transaksi ini sudah tidak terbuka")
		return
	}

	// Harga & HPP diselesaikan DI SERVER, bukan dipercaya dari klien.
	resolved := make([]resolvedItem, 0, len(req.Items))
	moneyItems := make([]money.Item, 0, len(req.Items))
	for _, it := range req.Items {
		variant, err := h.q.GetVariantForCheckout(ctx, store.GetVariantForCheckoutParams{
			TenantID: tenantID, ID: it.VariantID, OutletID: req.OutletID,
		})
		if errors.Is(err, pgx.ErrNoRows) {
			RespondError(w, http.StatusNotFound, "VARIANT_NOT_FOUND", "Varian tidak ditemukan: "+it.VariantID)
			return
		}
		if err != nil {
			RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal mengambil data varian")
			return
		}

		lineSubtotal := variant.Price.Mul(it.Qty).Sub(it.Discount).Round(2)
		resolved = append(resolved, resolvedItem{
			saleItemInput: it,
			ItemType:      variant.ItemType,
			Uom:           variant.Uom,
			UnitPrice:     variant.Price,
			UnitCost:      variant.CostPrice,
			Subtotal:      lineSubtotal,
		})
		moneyItems = append(moneyItems, money.Item{Quantity: it.Qty, UnitPrice: variant.Price, Discount: it.Discount})
	}

	// Server menghitung ulang total — INVALID_TRANSACTION_TOTAL adalah kode
	// terpenting di ERROR-CATALOG (§B): kalau ini pernah muncul di produksi,
	// struk pelanggan tidak cocok dengan catatan server.
	//
	// `tax` di SaleInput adalah nominal absolut (bukan tarif), jadi tidak ada
	// yang bisa dihitung ulang untuk pajak di sini — server hanya menegakkan
	// bahwa subtotal-diskon+pajak klien memang sama dengan total klien.
	calc := money.Calculate(money.Input{Items: moneyItems, Discount: req.Discount, TaxRate: decimal.Zero})
	grandTotal := calc.Subtotal.Sub(calc.DiscountTotal).Add(req.Tax).Round(2)
	if !grandTotal.Equal(req.Total) {
		RespondError(w, http.StatusUnprocessableEntity, "INVALID_TRANSACTION_TOTAL",
			fmt.Sprintf("Total tidak cocok: klien %s, server %s", req.Total, grandTotal))
		return
	}

	payments := make([]decimal.Decimal, 0, len(req.Payments))
	for _, p := range req.Payments {
		payments = append(payments, p.Amount)
	}
	if !money.MatchesTotal(payments, grandTotal) {
		RespondError(w, http.StatusUnprocessableEntity, "PAYMENT_AMOUNT_MISMATCH", "Jumlah pembayaran tidak sama dengan total transaksi")
		return
	}

	tx, err := h.pool.Begin(ctx)
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal memulai transaksi database")
		return
	}
	defer tx.Rollback(ctx) //nolint:errcheck // no-op setelah Commit berhasil

	qtx := h.q.WithTx(tx)

	// TODO(receipt-numbering): belum ada skema penomoran struk resmi yang
	// terdokumentasi (mis. sekuens harian per outlet) — placeholder ini
	// hanya menjamin keunikan, bukan format bisnis yang final.
	receiptNumber := req.OccurredAt.UTC().Format("20060102150405") + "-" + req.ID[len(req.ID)-6:]

	sale, err := qtx.CreateSaleIdempotent(ctx, store.CreateSaleIdempotentParams{
		ID:                  req.ID,
		TenantID:            tenantID,
		OutletID:            req.OutletID,
		CashierID:           cashierID,
		ShiftID:             &req.ShiftID,
		CustomerID:          req.CustomerID,
		ReceiptNumber:       receiptNumber,
		Subtotal:            calc.Subtotal,
		DiscountTotal:       calc.DiscountTotal,
		TaxTotal:            req.Tax,
		GrandTotal:          grandTotal,
		PaymentStatus:       "paid",
		OfflineCreatedAt:    toTimestamptz(req.OccurredAt),
		OfflineCreatedAtAdj: toTimestamptz(req.OccurredAt),
		IsLateArrival:       false,
		IsSandbox:           false,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		// ACCEPTED, bukan error (ERROR-CATALOG §4): ULID ini sudah pernah
		// masuk. Kembalikan record yang sudah ada apa adanya.
		existing, err := qtx.GetSaleByID(ctx, store.GetSaleByIDParams{TenantID: tenantID, ID: req.ID})
		if err != nil {
			RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal mengambil transaksi duplikat")
			return
		}
		RespondJSON(w, http.StatusOK, saleResponse{
			ID: existing.ID, ReceiptNumber: existing.ReceiptNumber,
			Subtotal: existing.Subtotal, Discount: existing.DiscountTotal, Tax: existing.TaxTotal,
			Total: existing.GrandTotal, Status: "completed", RecordedAt: existing.CreatedAt.Time,
		})
		return
	}
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal mencatat transaksi")
		return
	}

	itemParams := make([]store.InsertSalesItemsParams, 0, len(resolved))
	for _, it := range resolved {
		itemParams = append(itemParams, store.InsertSalesItemsParams{
			ID: ulid.Make().String(), TenantID: tenantID, TransactionID: sale.ID,
			VariantID: it.VariantID, Quantity: it.Qty, Uom: it.Uom,
			UnitPrice: it.UnitPrice, UnitCost: it.UnitCost, Subtotal: it.Subtotal,
		})
	}
	if _, err := qtx.InsertSalesItems(ctx, itemParams); err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal mencatat item transaksi")
		return
	}

	for _, p := range req.Payments {
		if _, err := qtx.InsertPayment(ctx, store.InsertPaymentParams{
			ID: ulid.Make().String(), TenantID: tenantID, TransactionID: sale.ID,
			PaymentMethod: p.Method, Amount: p.Amount, ReferenceID: p.Reference,
		}); err != nil {
			RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal mencatat pembayaran")
			return
		}
	}

	stockEvents := make([]store.InsertStockEventsParams, 0, len(resolved))
	for _, it := range resolved {
		switch it.ItemType {
		case "stock":
			balance, err := qtx.DecrementStockStrict(ctx, store.DecrementStockStrictParams{
				TenantID: tenantID, ID: it.VariantID, StockQuantity: it.Qty,
			})
			if errors.Is(err, pgx.ErrNoRows) {
				RespondError(w, http.StatusUnprocessableEntity, "INSUFFICIENT_STOCK",
					"Stok varian tidak mencukupi: "+it.VariantID)
				return
			}
			if err != nil {
				RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal memotong stok")
				return
			}
			stockEvents = append(stockEvents, store.InsertStockEventsParams{
				ID: ulid.Make().String(), TenantID: tenantID, OutletID: req.OutletID,
				VariantID: it.VariantID, EventType: "sale", QuantityDelta: it.Qty.Neg(),
				BalanceAfter: balance, Uom: it.Uom, ReferenceID: &sale.ID, ActorUserID: &cashierID,
			})
		case "composite":
			// Menjual 1 induk composite mengurangi stok setiap komponen BOM
			// (ERROR-CATALOG §5 catatan `querier.go`).
			components, err := qtx.GetBomComponents(ctx, store.GetBomComponentsParams{
				TenantID: tenantID, ParentVariantID: it.VariantID,
			})
			if err != nil {
				RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal mengambil komposisi BOM")
				return
			}
			for _, c := range components {
				wasteFactor := decimal.NewFromInt(1).Add(c.WastePct.Div(decimal.NewFromInt(100)))
				componentQty := c.Quantity.Mul(it.Qty).Mul(wasteFactor)
				balance, err := qtx.DecrementStockStrict(ctx, store.DecrementStockStrictParams{
					TenantID: tenantID, ID: c.ComponentVariantID, StockQuantity: componentQty,
				})
				if errors.Is(err, pgx.ErrNoRows) {
					RespondError(w, http.StatusUnprocessableEntity, "INSUFFICIENT_STOCK",
						"Stok komponen BOM tidak mencukupi: "+c.ComponentVariantID)
					return
				}
				if err != nil {
					RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal memotong stok komponen")
					return
				}
				stockEvents = append(stockEvents, store.InsertStockEventsParams{
					ID: ulid.Make().String(), TenantID: tenantID, OutletID: req.OutletID,
					VariantID: c.ComponentVariantID, EventType: "sale", QuantityDelta: componentQty.Neg(),
					BalanceAfter: balance, Uom: c.Uom, ReferenceID: &sale.ID, ActorUserID: &cashierID,
				})
			}
		}
		// "service" / "time_based": tidak berstok, tidak ada event.
	}
	if len(stockEvents) > 0 {
		if _, err := qtx.InsertStockEvents(ctx, stockEvents); err != nil {
			RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal mencatat ledger stok")
			return
		}
	}

	payload, err := json.Marshal(map[string]any{
		"sale_id": sale.ID, "outlet_id": req.OutletID, "grand_total": grandTotal,
	})
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal menyusun event outbox")
		return
	}
	if _, err := qtx.InsertOutboxEvent(ctx, store.InsertOutboxEventParams{
		ID: ulid.Make().String(), TenantID: tenantID, EventType: "sale.created",
		Version: 1, Payload: payload, OccurredAt: toTimestamptz(req.OccurredAt),
	}); err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal mencatat event outbox")
		return
	}

	if err := tx.Commit(ctx); err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal menyimpan transaksi")
		return
	}

	RespondJSON(w, http.StatusCreated, saleResponse{
		ID: sale.ID, ReceiptNumber: sale.ReceiptNumber,
		Subtotal: calc.Subtotal, Discount: calc.DiscountTotal, Tax: req.Tax,
		Total: sale.GrandTotal, Status: "completed", RecordedAt: sale.CreatedAt.Time,
	})
}

type refundItemInput struct {
	SalesItemID string          `json:"sales_item_id"`
	Quantity    decimal.Decimal `json:"quantity"`
	Amount      decimal.Decimal `json:"amount"`
}

type refundInput struct {
	ShiftID    string            `json:"shift_id"`
	RefundType string            `json:"refund_type"` // "full" atau "partial"
	Amount     decimal.Decimal   `json:"amount"`
	Reason     string            `json:"reason"`
	Restock    bool              `json:"restock"`
	Items      []refundItemInput `json:"items"`
}

// PostRefund menangani POST /sales/{id}/refund
func (h *CheckoutHandler) PostRefund(w http.ResponseWriter, r *http.Request, transactionID string) {
	ctx := r.Context()
	tenantID := TenantID(ctx)
	userID := UserID(ctx) // In reality this requires manager PIN check, for now we assume the actor has rights

	var req refundInput
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondError(w, http.StatusBadRequest, "VALIDATION_ERROR", "Payload tidak valid")
		return
	}

	if req.RefundType != "full" && req.RefundType != "partial" {
		RespondError(w, http.StatusBadRequest, "VALIDATION_ERROR", "refund_type harus full atau partial")
		return
	}

	tx, err := h.pool.Begin(ctx)
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal memulai tx refund")
		return
	}
	defer tx.Rollback(ctx)

	qtx := h.q.WithTx(tx)

	// Note: shiftID could be null
	var shiftID *string
	if req.ShiftID != "" {
		shiftID = &req.ShiftID
	}

	refundID := "rf_" + ulid.Make().String()
	_, err = qtx.InsertRefund(ctx, store.InsertRefundParams{
		ID:            refundID,
		TenantID:      tenantID,
		TransactionID: transactionID,
		ShiftID:       shiftID,
		RefundType:    req.RefundType,
		Amount:        req.Amount,
		Reason:        req.Reason,
		ApprovedBy:    userID,
		Restock:       req.Restock,
	})
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal menyimpan refund")
		return
	}

	for _, item := range req.Items {
		itemID := "ri_" + ulid.Make().String()
		_, err = qtx.InsertRefundItem(ctx, store.InsertRefundItemParams{
			ID:          itemID,
			TenantID:    tenantID,
			RefundID:    refundID,
			SalesItemID: item.SalesItemID,
			Quantity:    item.Quantity,
			Amount:      item.Amount,
		})
		if err != nil {
			RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal menyimpan item refund")
			return
		}
	}

	if err := tx.Commit(ctx); err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal commit refund")
		return
	}

	RespondJSON(w, http.StatusCreated, map[string]any{
		"message":   "Refund berhasil diproses",
		"refund_id": refundID,
	})
}
