-- Kueri untuk cmd/seed SAJA — bukan jalur produksi.
--
-- Kenapa lewat sqlc, bukan SQL mentah di dalam cmd/seed: supaya seeder memakai
-- Queries yang SAMA dengan handler HTTP. Kalau skema kueri berubah, seeder ikut
-- pecah saat compile — bukan diam-diam menulis data yang sudah tidak sesuai
-- bentuk tabel. (docs/15-development/LOCAL-SETUP.md §4)

-- name: CreateTenant :one
-- tenants adalah tabel akar — ia SENDIRI adalah tenant_id, belum ada tenant_id
-- di atasnya untuk difilter.
INSERT INTO tenants (id, name, business_type, plan_tier, plan_status) -- sqlc-vet-disable: wajib-tenant-scope
VALUES ($1, $2, $3, $4, $5)
RETURNING id;

-- name: CreateOutlet :one
INSERT INTO outlets (id, tenant_id, name, address, phone, timezone)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id;

-- name: CreateUser :one
INSERT INTO users (id, tenant_id, name, email, password_hash, role, pin_hash)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id;

-- name: CreateUserOutletAssignment :exec
INSERT INTO user_outlet_assignments (id, tenant_id, user_id, outlet_id, is_primary)
VALUES ($1, $2, $3, $4, $5);

-- name: CreateCategory :one
INSERT INTO categories (id, tenant_id, name, sort_order, color_token)
VALUES ($1, $2, $3, $4, $5)
RETURNING id;

-- name: CreateProduct :one
INSERT INTO products (id, tenant_id, category_id, name, description)
VALUES ($1, $2, $3, $4, $5)
RETURNING id;

-- name: CreateVariant :one
INSERT INTO variants (
    id, tenant_id, product_id, name, sku, barcode,
    item_type, uom, uom_precision, price, cost_price, stock_quantity, min_stock_alert
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
)
RETURNING id;

-- name: CreateRefund :one
-- Dipakai HANYA oleh seeder untuk mengisi kasus tepi "refund parsial"
-- (TESTING-STRATEGY.md §4). Jalur HTTP /sales/{id}/refund BELUM diimplementasikan
-- sesi ini (lihat CLAUDE.md §7) — kueri ini sengaja tidak dipakai handler mana pun.
INSERT INTO refunds (
    id, tenant_id, transaction_id, shift_id, refund_type, amount, reason, approved_by, restock
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9
)
RETURNING id;
