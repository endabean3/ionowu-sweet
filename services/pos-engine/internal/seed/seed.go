// Package seed mengisi database dev dengan DUA tenant lengkap, persis
// docs/15-development/LOCAL-SETUP.md §4: "isolasi tenant tidak bisa diuji dengan
// satu tenant." Dipanggil dari cmd/seed, lewat Queries yang SAMA dengan
// handler HTTP (internal/httpapi) — bukan SQL mentah terpisah, supaya
// seeder otomatis rusak (dan ketahuan) kalau skema kueri berubah.
package seed

import (
	"context"
	"encoding/json"
	"fmt"
	"math/rand/v2"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/oklog/ulid/v2"
	"github.com/shopspring/decimal"

	"github.com/endabean3/ionowu-sweet/services/pos-engine/internal/auth"
	"github.com/endabean3/ionowu-sweet/services/pos-engine/internal/money"
	"github.com/endabean3/ionowu-sweet/services/pos-engine/internal/store"
)

const historyDays = 30

type userBlueprint struct {
	role      string
	label     string
	emailUser string
}

type tenantBlueprint struct {
	name         string
	businessType string
	outletNames  []string
	variantCount int
	users        []userBlueprint
}

// Blueprint persis sesuai LOCAL-SETUP.md §4.
var blueprints = []tenantBlueprint{
	{
		name: "Kopi Senja", businessType: "fnb",
		outletNames:  []string{"Kopi Senja - Cabang Kemang", "Kopi Senja - Cabang Senopati"},
		variantCount: 25,
		users: []userBlueprint{
			{role: "owner", label: "Owner", emailUser: "owner"},
			{role: "manager", label: "Manager", emailUser: "manager"},
			{role: "cashier", label: "Kasir", emailUser: "cashier"},
		},
	},
	{
		name: "Roti Manis", businessType: "retail_unit",
		outletNames:  []string{"Roti Manis - Toko Utama"},
		variantCount: 12,
		users: []userBlueprint{
			{role: "owner", label: "Owner", emailUser: "owner"},
			{role: "cashier", label: "Kasir", emailUser: "cashier"},
		},
	},
}

// UserCredential dicetak cmd/seed ke stdout — password TIDAK pernah
// dihardcode di repo (.env.example memang tidak mendefinisikannya).
type UserCredential struct {
	Email    string
	Password string
	Role     string
}

type TenantReport struct {
	Name     string
	TenantID string
	Outlets  int
	Variants int
	Users    []UserCredential
}

type Report struct {
	Tenants []TenantReport
}

// Run menjalankan seeder dua-tenant. `pool` diasumsikan menunjuk ke database
// KOSONG (alur normalnya `make reset && make seed`) — seeder TIDAK idempoten,
// setiap ID di-generate ULID baru per run.
//
// SELURUH seed berjalan dalam SATU transaksi. Tanpa ini, menjalankan seeder
// pada database yang sudah terisi akan gagal di tengah jalan (email user unik)
// setelah baris tenant, outlet, dan produk telanjur tertulis — meninggalkan
// tenant yatim tanpa satu pun user. Kekacauan itu diam-diam merusak uji
// isolasi: `select from tenants` mengembalikan tiga "Kopi Senja", dan kueri
// yang lupa memfilter tenant_id bisa tetap terlihat benar.
// Gagal-total lebih baik daripada berhasil-separuh.
func Run(ctx context.Context, pool *pgxpool.Pool) (Report, error) {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return Report{}, fmt.Errorf("mulai transaksi: %w", err)
	}
	// Rollback setelah Commit adalah no-op (pgx.ErrTxClosed) — aman dipasang
	// tanpa syarat, dan menjamin rollback pada jalur panic maupun error.
	defer func() { _ = tx.Rollback(ctx) }()

	q := store.New(tx)
	var report Report
	for _, bp := range blueprints {
		tr, err := seedTenant(ctx, q, bp)
		if err != nil {
			return Report{}, fmt.Errorf("seed tenant %s: %w", bp.name, err)
		}
		report.Tenants = append(report.Tenants, tr)
	}

	if err := tx.Commit(ctx); err != nil {
		return Report{}, fmt.Errorf("commit seed: %w", err)
	}
	return report, nil
}

func slug(name string) string {
	out := make([]rune, 0, len(name))
	for _, r := range name {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			out = append(out, r)
		case r >= 'A' && r <= 'Z':
			out = append(out, r+32)
		case r == ' ':
			out = append(out, '-')
		}
	}
	return string(out)
}

func seedTenant(ctx context.Context, q *store.Queries, bp tenantBlueprint) (TenantReport, error) {
	businessType := bp.businessType
	tenantID, err := q.CreateTenant(ctx, store.CreateTenantParams{
		ID: ulid.Make().String(), Name: bp.name, BusinessType: &businessType,
		PlanTier: "free", PlanStatus: "active",
	})
	if err != nil {
		return TenantReport{}, fmt.Errorf("create tenant: %w", err)
	}
	report := TenantReport{Name: bp.name, TenantID: tenantID}

	outletIDs := make([]string, 0, len(bp.outletNames))
	for _, name := range bp.outletNames {
		id, err := q.CreateOutlet(ctx, store.CreateOutletParams{
			ID: ulid.Make().String(), TenantID: tenantID, Name: name, Timezone: "Asia/Jakarta",
		})
		if err != nil {
			return report, fmt.Errorf("create outlet %s: %w", name, err)
		}
		outletIDs = append(outletIDs, id)
	}
	report.Outlets = len(outletIDs)

	categoryID, err := q.CreateCategory(ctx, store.CreateCategoryParams{
		ID: ulid.Make().String(), TenantID: tenantID, Name: "Umum", SortOrder: 0,
	})
	if err != nil {
		return report, fmt.Errorf("create category: %w", err)
	}

	rng := rand.New(rand.NewPCG(42, uint64(len(bp.name))))
	variantIDs := make([]string, 0, bp.variantCount)
	for i := 0; i < bp.variantCount; i++ {
		productID, err := q.CreateProduct(ctx, store.CreateProductParams{
			ID: ulid.Make().String(), TenantID: tenantID, CategoryID: &categoryID,
			Name: fmt.Sprintf("%s Produk %02d", bp.name, i+1),
		})
		if err != nil {
			return report, fmt.Errorf("create product %d: %w", i, err)
		}
		price := decimal.NewFromInt(int64(5000 + rng.IntN(45)*500))
		cost := price.Mul(decimal.NewFromFloat(0.6)).Round(2)
		variantID, err := q.CreateVariant(ctx, store.CreateVariantParams{
			ID: ulid.Make().String(), TenantID: tenantID, ProductID: productID,
			Name: "Reguler", ItemType: "stock", Uom: "pcs", UomPrecision: 0,
			Price: price, CostPrice: cost,
			StockQuantity: decimal.NewFromInt(500), MinStockAlert: decimal.NewFromInt(10),
		})
		if err != nil {
			return report, fmt.Errorf("create variant %d: %w", i, err)
		}
		variantIDs = append(variantIDs, variantID)
	}
	report.Variants = len(variantIDs)

	userIDs := make(map[string]string, len(bp.users))
	for _, ub := range bp.users {
		password := fmt.Sprintf("Seed!%s%04d", ub.role, rng.IntN(9000)+1000)
		hash, err := auth.HashPassword(password)
		if err != nil {
			return report, fmt.Errorf("hash password: %w", err)
		}
		email := fmt.Sprintf("%s@%s.test", ub.emailUser, slug(bp.name))
		userID, err := q.CreateUser(ctx, store.CreateUserParams{
			ID: ulid.Make().String(), TenantID: tenantID, Name: ub.label + " " + bp.name,
			Email: email, PasswordHash: hash, Role: ub.role,
		})
		if err != nil {
			return report, fmt.Errorf("create user %s: %w", email, err)
		}
		userIDs[ub.role] = userID

		// MULTI-OUTLET §3: owner/manager melihat seluruh cabang; kasir hanya
		// ditempatkan di cabang utama (assignment eksplisit, bukan implisit).
		assignOutlets := outletIDs
		if ub.role != "owner" && ub.role != "manager" {
			assignOutlets = outletIDs[:1]
		}
		for i, outletID := range assignOutlets {
			if err := q.CreateUserOutletAssignment(ctx, store.CreateUserOutletAssignmentParams{
				ID: ulid.Make().String(), TenantID: tenantID, UserID: userID, OutletID: outletID, IsPrimary: i == 0,
			}); err != nil {
				return report, fmt.Errorf("assign outlet: %w", err)
			}
		}
		report.Users = append(report.Users, UserCredential{Email: email, Password: password, Role: ub.role})
	}

	cashierID, ok := userIDs["cashier"]
	if !ok {
		return report, fmt.Errorf("blueprint %s tanpa role cashier", bp.name)
	}
	ownerID := userIDs["owner"]

	now := time.Now().UTC()
	for dayOffset := historyDays - 1; dayOffset >= 0; dayOffset-- {
		day := now.AddDate(0, 0, -dayOffset)
		for outletIdx, outletID := range outletIDs {
			if err := seedShiftDay(ctx, q, rng, tenantID, outletID, cashierID, ownerID, variantIDs, day); err != nil {
				return report, fmt.Errorf("seed shift %s outlet %d: %w", day.Format("2006-01-02"), outletIdx, err)
			}
		}
	}

	// Kasus tepi uang wajib (TESTING-STRATEGY.md §4) — cukup satu tenant,
	// isolasi antar-tenant tidak butuh duplikasi kasus ini.
	if bp.name == "Kopi Senja" {
		if err := seedMoneyEdgeCases(ctx, q, tenantID, outletIDs[0], cashierID, ownerID, variantIDs); err != nil {
			return report, fmt.Errorf("seed kasus tepi uang: %w", err)
		}
	}

	return report, nil
}

func seedShiftDay(ctx context.Context, q *store.Queries, rng *rand.Rand, tenantID, outletID, cashierID, ownerID string, variantIDs []string, day time.Time) error {
	opened := time.Date(day.Year(), day.Month(), day.Day(), 8, 0, 0, 0, time.UTC)
	shiftID := ulid.Make().String()
	if _, err := q.OpenShift(ctx, store.OpenShiftParams{
		ID: shiftID, TenantID: tenantID, OutletID: outletID, CashierID: cashierID,
		OpenedAt: pgtype.Timestamptz{Time: opened, Valid: true}, OpeningCash: decimal.NewFromInt(100000),
	}); err != nil {
		return fmt.Errorf("open shift: %w", err)
	}

	saleCount := 3 + rng.IntN(4) // 3..6 transaksi per shift
	for i := 0; i < saleCount; i++ {
		occurredAt := opened.Add(time.Duration(i+1) * time.Hour)
		variantID := variantIDs[rng.IntN(len(variantIDs))]
		qty := decimal.NewFromInt(int64(1 + rng.IntN(3)))
		method := "cash"
		if rng.IntN(3) == 0 {
			method = "qris"
		}
		variant, err := q.GetVariantForCheckout(ctx, store.GetVariantForCheckoutParams{TenantID: tenantID, ID: variantID, OutletID: outletID})
		if err != nil {
			return fmt.Errorf("get variant: %w", err)
		}
		amount := variant.Price.Mul(qty).Round(2)
		if _, err := recordSale(ctx, q, tenantID, outletID, shiftID, cashierID, occurredAt,
			[]saleItem{{VariantID: variantID, Quantity: qty, Discount: decimal.Zero}},
			decimal.Zero, []salePayment{{Method: method, Amount: amount}}, "SEED"); err != nil {
			return fmt.Errorf("sale %d: %w", i, err)
		}
	}

	if rng.IntN(2) == 0 {
		if _, err := q.RecordCashMovement(ctx, store.RecordCashMovementParams{
			ID: ulid.Make().String(), TenantID: tenantID, ShiftID: shiftID, Direction: "out",
			Amount: decimal.NewFromInt(15000), Reason: "beli es batu darurat (data seed)", ActorUserID: cashierID,
		}); err != nil {
			return fmt.Errorf("cash movement: %w", err)
		}
	}

	return closeShiftReconciled(ctx, q, tenantID, shiftID, ownerID, opened.Add(12*time.Hour))
}

func closeShiftReconciled(ctx context.Context, q *store.Queries, tenantID, shiftID, closedByUserID string, closedAt time.Time) error {
	expected, err := q.CalculateExpectedCash(ctx, store.CalculateExpectedCashParams{TenantID: tenantID, ID: shiftID})
	if err != nil {
		return fmt.Errorf("calculate expected cash: %w", err)
	}
	expectedCash := expected.OpeningCash.Add(expected.CashSales).Add(expected.CashIn).Sub(expected.CashOut)
	if _, err := q.CloseShift(ctx, store.CloseShiftParams{
		TenantID: tenantID, ID: shiftID, ClosedAt: pgtype.Timestamptz{Time: closedAt, Valid: true},
		ExpectedCash: decimal.NewNullDecimal(expectedCash), CountedCash: decimal.NewNullDecimal(expectedCash),
		ClosedBy: &closedByUserID,
	}); err != nil {
		return fmt.Errorf("close shift: %w", err)
	}
	return nil
}

type saleItem struct {
	VariantID string
	Quantity  decimal.Decimal
	Discount  decimal.Decimal
}

type salePayment struct {
	Method string
	Amount decimal.Decimal
}

// recordSale mencatat satu transaksi lengkap (item majemuk, diskon
// keranjang, pembayaran majemuk) lewat Queries yang sama dipakai handler
// checkout HTTP (internal/httpapi/checkout.go) — dipakai baik oleh simulasi
// 30-hari maupun kasus tepi uang wajib.
func recordSale(ctx context.Context, q *store.Queries, tenantID, outletID, shiftID, cashierID string,
	occurredAt time.Time, items []saleItem, cartDiscount decimal.Decimal, payments []salePayment, receiptTag string) (string, error) {

	type resolved struct {
		variantID string
		qty       decimal.Decimal
		unitPrice decimal.Decimal
		unitCost  decimal.Decimal
		uom       string
	}

	moneyItems := make([]money.Item, 0, len(items))
	resolvedItems := make([]resolved, 0, len(items))
	for _, it := range items {
		variant, err := q.GetVariantForCheckout(ctx, store.GetVariantForCheckoutParams{TenantID: tenantID, ID: it.VariantID, OutletID: outletID})
		if err != nil {
			return "", fmt.Errorf("get variant %s: %w", it.VariantID, err)
		}
		moneyItems = append(moneyItems, money.Item{Quantity: it.Quantity, UnitPrice: variant.Price, Discount: it.Discount})
		resolvedItems = append(resolvedItems, resolved{
			variantID: it.VariantID, qty: it.Quantity, unitPrice: variant.Price, unitCost: variant.CostPrice, uom: variant.Uom,
		})
	}

	calc := money.Calculate(money.Input{Items: moneyItems, Discount: cartDiscount, TaxRate: decimal.Zero})

	saleID := ulid.Make().String()
	sale, err := q.CreateSaleIdempotent(ctx, store.CreateSaleIdempotentParams{
		ID: saleID, TenantID: tenantID, OutletID: outletID, CashierID: cashierID, ShiftID: &shiftID,
		ReceiptNumber:       fmt.Sprintf("%s-%s", receiptTag, saleID[len(saleID)-8:]),
		Subtotal:            calc.Subtotal,
		DiscountTotal:       calc.DiscountTotal,
		TaxTotal:            calc.TaxTotal,
		GrandTotal:          calc.GrandTotal,
		PaymentStatus:       "paid",
		OfflineCreatedAt:    pgtype.Timestamptz{Time: occurredAt, Valid: true},
		OfflineCreatedAtAdj: pgtype.Timestamptz{Time: occurredAt, Valid: true},
	})
	if err != nil {
		return "", fmt.Errorf("create sale: %w", err)
	}

	itemParams := make([]store.InsertSalesItemsParams, 0, len(resolvedItems))
	for _, d := range resolvedItems {
		itemParams = append(itemParams, store.InsertSalesItemsParams{
			ID: ulid.Make().String(), TenantID: tenantID, TransactionID: sale.ID, VariantID: d.variantID,
			Quantity: d.qty, Uom: d.uom, UnitPrice: d.unitPrice, UnitCost: d.unitCost,
			Subtotal: d.unitPrice.Mul(d.qty).Round(2),
		})
	}
	if _, err := q.InsertSalesItems(ctx, itemParams); err != nil {
		return "", fmt.Errorf("insert sales items: %w", err)
	}

	for _, p := range payments {
		if p.Amount.IsZero() {
			continue // grand_total 0 (mis. diskon 100%) tidak butuh baris payments
		}
		if _, err := q.InsertPayment(ctx, store.InsertPaymentParams{
			ID: ulid.Make().String(), TenantID: tenantID, TransactionID: sale.ID, PaymentMethod: p.Method, Amount: p.Amount,
		}); err != nil {
			return "", fmt.Errorf("insert payment: %w", err)
		}
	}

	stockEvents := make([]store.InsertStockEventsParams, 0, len(resolvedItems))
	for _, d := range resolvedItems {
		// DecrementStockAllowNegative (bukan Strict): simulasi 30 hari tidak
		// perlu menjaga stok tetap cukup di setiap hari — stok minus adalah
		// informasi valid (OFFLINE-SYNC-SPEC §2 prinsip 3), bukan kegagalan
		// seeder.
		balance, err := q.DecrementStockAllowNegative(ctx, store.DecrementStockAllowNegativeParams{
			TenantID: tenantID, ID: d.variantID, StockQuantity: d.qty,
		})
		if err != nil {
			return "", fmt.Errorf("decrement stock: %w", err)
		}
		stockEvents = append(stockEvents, store.InsertStockEventsParams{
			ID: ulid.Make().String(), TenantID: tenantID, OutletID: outletID, VariantID: d.variantID,
			EventType: "sale", QuantityDelta: d.qty.Neg(), BalanceAfter: balance, Uom: d.uom,
			ReferenceID: &sale.ID, ActorUserID: &cashierID,
		})
	}
	if _, err := q.InsertStockEvents(ctx, stockEvents); err != nil {
		return "", fmt.Errorf("insert stock events: %w", err)
	}

	payload, err := json.Marshal(map[string]any{"sale_id": sale.ID, "outlet_id": outletID})
	if err != nil {
		return "", fmt.Errorf("marshal outbox payload: %w", err)
	}
	if _, err := q.InsertOutboxEvent(ctx, store.InsertOutboxEventParams{
		ID: ulid.Make().String(), TenantID: tenantID, EventType: "sale.created", Version: 1, Payload: payload,
		OccurredAt: pgtype.Timestamptz{Time: occurredAt, Valid: true},
	}); err != nil {
		return "", fmt.Errorf("insert outbox event: %w", err)
	}

	return sale.ID, nil
}

// seedMoneyEdgeCases mengisi 4 kasus tepi wajib TESTING-STRATEGY.md §4:
// pembulatan .005, diskon 100%, pembayaran gabungan, refund parsial.
//
// Jaminan MATEMATIS atas kasus pembulatan ada di test Go
// (internal/money/calc_test.go, fixture eksplisit) — baris di bawah hanya
// mengisi transaksi nyata yang melewati jalur yang sama, memakai harga
// varian yang di-generate acak saat seed.
func seedMoneyEdgeCases(ctx context.Context, q *store.Queries, tenantID, outletID, cashierID, ownerID string, variantIDs []string) error {
	opened := time.Now().UTC().Add(-3 * time.Hour)
	shiftID := ulid.Make().String()
	if _, err := q.OpenShift(ctx, store.OpenShiftParams{
		ID: shiftID, TenantID: tenantID, OutletID: outletID, CashierID: cashierID,
		OpenedAt: pgtype.Timestamptz{Time: opened, Valid: true}, OpeningCash: decimal.NewFromInt(100000),
	}); err != nil {
		return fmt.Errorf("open shift kasus tepi: %w", err)
	}

	variantID := variantIDs[0]
	variant, err := q.GetVariantForCheckout(ctx, store.GetVariantForCheckoutParams{TenantID: tenantID, ID: variantID, OutletID: outletID})
	if err != nil {
		return fmt.Errorf("get variant kasus tepi: %w", err)
	}

	// 1. Pembulatan — qty pecahan gaya barang curah/timbang.
	roundQty := decimal.NewFromFloat(0.333)
	roundAmount := variant.Price.Mul(roundQty).Round(2)
	if _, err := recordSale(ctx, q, tenantID, outletID, shiftID, cashierID, opened.Add(10*time.Minute),
		[]saleItem{{VariantID: variantID, Quantity: roundQty, Discount: decimal.Zero}},
		decimal.Zero, []salePayment{{Method: "cash", Amount: roundAmount}}, "SEED-EDGE-ROUNDING"); err != nil {
		return fmt.Errorf("kasus pembulatan: %w", err)
	}

	// 2. Diskon 100% — grand_total harus 0, bukan error.
	if _, err := recordSale(ctx, q, tenantID, outletID, shiftID, cashierID, opened.Add(20*time.Minute),
		[]saleItem{{VariantID: variantID, Quantity: decimal.NewFromInt(1), Discount: decimal.Zero}},
		variant.Price, nil, "SEED-EDGE-DISKON100"); err != nil {
		return fmt.Errorf("kasus diskon 100%%: %w", err)
	}

	// 3. Pembayaran gabungan (FR-22) — tunai + QRIS untuk satu transaksi.
	splitTotal := variant.Price.Mul(decimal.NewFromInt(2)).Round(2)
	half := splitTotal.Div(decimal.NewFromInt(2)).Round(2)
	if _, err := recordSale(ctx, q, tenantID, outletID, shiftID, cashierID, opened.Add(30*time.Minute),
		[]saleItem{{VariantID: variantID, Quantity: decimal.NewFromInt(2), Discount: decimal.Zero}},
		decimal.Zero, []salePayment{{Method: "cash", Amount: half}, {Method: "qris", Amount: splitTotal.Sub(half)}},
		"SEED-EDGE-SPLIT"); err != nil {
		return fmt.Errorf("kasus split payment: %w", err)
	}

	// 4. Refund parsial — transaksi normal 3 unit, lalu refund 1 unit.
	// CreateRefund dipakai HANYA di seeder — jalur HTTP /sales/{id}/refund
	// belum diimplementasikan sesi ini (lihat CLAUDE.md §7).
	baseAmount := variant.Price.Mul(decimal.NewFromInt(3)).Round(2)
	refundableSaleID, err := recordSale(ctx, q, tenantID, outletID, shiftID, cashierID, opened.Add(40*time.Minute),
		[]saleItem{{VariantID: variantID, Quantity: decimal.NewFromInt(3), Discount: decimal.Zero}},
		decimal.Zero, []salePayment{{Method: "cash", Amount: baseAmount}}, "SEED-EDGE-REFUNDBASE")
	if err != nil {
		return fmt.Errorf("kasus dasar refund: %w", err)
	}
	if _, err := q.CreateRefund(ctx, store.CreateRefundParams{
		ID: ulid.Make().String(), TenantID: tenantID, TransactionID: refundableSaleID, ShiftID: &shiftID,
		RefundType: "partial", Amount: variant.Price.Round(2),
		Reason:     "Pelanggan mengembalikan 1 dari 3 unit (data seed, TESTING-STRATEGY.md §4)",
		ApprovedBy: ownerID, Restock: true,
	}); err != nil {
		return fmt.Errorf("kasus refund parsial: %w", err)
	}

	return closeShiftReconciled(ctx, q, tenantID, shiftID, ownerID, opened.Add(90*time.Minute))
}
