package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/oklog/ulid/v2"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shopspring/decimal"

	"github.com/endabean3/docs-umkm-intelligence/services/pos-engine/internal/store"
)

type ShiftHandler struct {
	pool *pgxpool.Pool
	q    *store.Queries
}

func NewShiftHandler(pool *pgxpool.Pool) *ShiftHandler {
	return &ShiftHandler{pool: pool, q: store.New(pool)}
}

type shiftOpenInput struct {
	ID          string          `json:"id"`
	OutletID    string          `json:"outlet_id"`
	OpeningCash decimal.Decimal `json:"opening_cash"`
	OccurredAt  time.Time       `json:"occurred_at"`
}

type shiftResponse struct {
	ID          string          `json:"id"`
	OutletID    string          `json:"outlet_id"`
	CashierID   string          `json:"cashier_id"`
	OpenedAt    time.Time       `json:"opened_at"`
	OpeningCash decimal.Decimal `json:"opening_cash"`
}

// PostShiftOpen menangani POST /shifts/open. ULID digenerate KLIEN (D-02) agar
// shift bisa dibuka offline; indeks unik parsial idx_shifts_one_open mencegah
// dua shift terbuka untuk kasir yang sama (409 pada bentrok — ERROR-CATALOG §B
// perlakukan sebagai bug klien, bukan kondisi yang ditangani diam-diam).
func (h *ShiftHandler) PostShiftOpen(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	tenantID := TenantID(ctx)
	cashierID := UserID(ctx)

	var req shiftOpenInput
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondError(w, http.StatusBadRequest, "VALIDATION_ERROR", "Payload tidak valid")
		return
	}
	if req.ID == "" || req.OutletID == "" {
		RespondError(w, http.StatusBadRequest, "VALIDATION_ERROR", "id dan outlet_id wajib diisi")
		return
	}

	shift, err := h.q.OpenShift(ctx, store.OpenShiftParams{
		ID: req.ID, TenantID: tenantID, OutletID: req.OutletID, CashierID: cashierID,
		OpenedAt: toTimestamptz(req.OccurredAt), OpeningCash: req.OpeningCash,
	})
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" { // unique_violation: idx_shifts_one_open
			RespondError(w, http.StatusConflict, "VALIDATION_ERROR", "Kasir sudah punya shift terbuka di outlet ini")
			return
		}
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal membuka shift")
		return
	}

	RespondJSON(w, http.StatusCreated, shiftResponse{
		ID: shift.ID, OutletID: req.OutletID, CashierID: cashierID,
		OpenedAt: shift.OpenedAt.Time, OpeningCash: req.OpeningCash,
	})
}

type shiftCloseInput struct {
	ClosingCash decimal.Decimal `json:"closing_cash"`
	OccurredAt  time.Time       `json:"occurred_at"`
}

type shiftSummaryResponse struct {
	ID           string          `json:"id"`
	ExpectedCash decimal.Decimal `json:"expected_cash"`
	ClosingCash  decimal.Decimal `json:"closing_cash"`
	CashVariance decimal.Decimal `json:"cash_variance"`
	ClosedAt     time.Time       `json:"closed_at"`
}

// PostShiftClose menangani POST /shifts/{shiftId}/close.
// expected = saldo awal + tunai masuk + kas masuk − kas keluar, TIDAK
// termasuk transaksi is_late_arrival (Z-Report yang sudah dicetak tidak
// pernah berubah retroaktif — OFFLINE-SYNC-SPEC §3C).
func (h *ShiftHandler) PostShiftClose(w http.ResponseWriter, r *http.Request, shiftID string) {
	ctx := r.Context()
	tenantID := TenantID(ctx)
	cashierID := UserID(ctx)

	var req shiftCloseInput
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondError(w, http.StatusBadRequest, "VALIDATION_ERROR", "Payload tidak valid")
		return
	}

	expected, err := h.q.CalculateExpectedCash(ctx, store.CalculateExpectedCashParams{TenantID: tenantID, ID: shiftID})
	if errors.Is(err, pgx.ErrNoRows) {
		RespondError(w, http.StatusNotFound, "SHIFT_NOT_FOUND", "Shift tidak ditemukan")
		return
	}
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal menghitung kas yang diharapkan")
		return
	}
	expectedCash := expected.OpeningCash.Add(expected.CashSales).Add(expected.CashIn).Sub(expected.CashOut)

	closed, err := h.q.CloseShift(ctx, store.CloseShiftParams{
		TenantID: tenantID, ID: shiftID, ClosedAt: toTimestamptz(req.OccurredAt),
		ExpectedCash: decimal.NewNullDecimal(expectedCash),
		CountedCash:  decimal.NewNullDecimal(req.ClosingCash),
		ClosedBy:     &cashierID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		RespondError(w, http.StatusUnprocessableEntity, "VALIDATION_ERROR", "Shift sudah ditutup atau tidak ditemukan")
		return
	}
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal menutup shift")
		return
	}

	RespondJSON(w, http.StatusOK, shiftSummaryResponse{
		ID: closed.ID, ExpectedCash: expectedCash, ClosingCash: req.ClosingCash,
		CashVariance: closed.Variance.Decimal, ClosedAt: closed.ClosedAt.Time,
	})
}

type cashMovementInput struct {
	Direction string          `json:"direction"` // "in" atau "out"
	Amount    decimal.Decimal `json:"amount"`
	Reason    string          `json:"reason"`
}

// PostCashMovement menangani POST /shifts/{shiftId}/cash-movement
func (h *ShiftHandler) PostCashMovement(w http.ResponseWriter, r *http.Request, shiftID string) {
	ctx := r.Context()
	tenantID := TenantID(ctx)
	userID := UserID(ctx)

	var req cashMovementInput
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondError(w, http.StatusBadRequest, "VALIDATION_ERROR", "Payload tidak valid")
		return
	}

	if req.Direction != "in" && req.Direction != "out" {
		RespondError(w, http.StatusBadRequest, "VALIDATION_ERROR", "direction harus 'in' atau 'out'")
		return
	}

	if req.Amount.LessThanOrEqual(decimal.Zero) {
		RespondError(w, http.StatusBadRequest, "VALIDATION_ERROR", "amount harus lebih besar dari 0")
		return
	}

	if req.Reason == "" {
		RespondError(w, http.StatusBadRequest, "VALIDATION_ERROR", "reason wajib diisi")
		return
	}

	// ULID MURNI — cash_movements.id adalah VARCHAR(26) (migrations/00005);
	// prefiks membuatnya 29+ karakter dan INSERT gagal "value too long".
	movementID := ulid.Make().String()

	_, err := h.q.InsertCashMovement(ctx, store.InsertCashMovementParams{
		ID:          movementID,
		TenantID:    tenantID,
		ShiftID:     shiftID,
		Direction:   req.Direction,
		Amount:      req.Amount,
		Reason:      req.Reason,
		ActorUserID: userID,
	})

	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal merekam cash movement")
		return
	}

	RespondJSON(w, http.StatusCreated, map[string]any{
		"message": "Kas terekam",
		"id":      movementID,
	})
}
