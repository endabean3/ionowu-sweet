-- Riwayat transaksi: mencari nota lama untuk klaim garansi, refund, dan void.
-- Semua kueri memfilter tenant_id; pemanggilnya juga membatasi outlet.

-- name: ListSales :many
-- Daftar transaksi terbaru dengan total refund yang sudah pernah terjadi,
-- supaya layar riwayat bisa menandai "sudah direfund" tanpa N+1 kueri.
-- Data percobaan (is_sandbox) dikecualikan, sama seperti seluruh laporan.
SELECT
    s.id, s.receipt_number, s.grand_total, s.payment_status,
    COALESCE(s.offline_created_at_adj, s.offline_created_at, s.created_at)::timestamptz AS sold_at,
    s.customer_id, c.member_code, u.name AS cashier_name,
    COALESCE((SELECT SUM(r.amount) FROM refunds r
              WHERE r.tenant_id = s.tenant_id AND r.transaction_id = s.id), 0)::decimal AS refunded_total,
    (SELECT COUNT(*) FROM sales_items si
     WHERE si.tenant_id = s.tenant_id AND si.transaction_id = s.id)::int AS item_count
FROM sales_transactions s
LEFT JOIN customers c ON c.id = s.customer_id AND c.tenant_id = s.tenant_id
LEFT JOIN users u ON u.id = s.cashier_id AND u.tenant_id = s.tenant_id
WHERE s.tenant_id = $1
  AND s.outlet_id = $2
  AND NOT s.is_sandbox
  AND COALESCE(s.offline_created_at_adj, s.offline_created_at, s.created_at) >= sqlc.arg('dari')::timestamptz
  AND COALESCE(s.offline_created_at_adj, s.offline_created_at, s.created_at) < sqlc.arg('sampai')::timestamptz
  AND (sqlc.narg('cari')::text IS NULL OR s.receipt_number ILIKE '%' || sqlc.narg('cari')::text || '%')
ORDER BY COALESCE(s.offline_created_at_adj, s.offline_created_at, s.created_at) DESC
LIMIT sqlc.arg('batas')::int;

-- name: GetSaleDetail :one
SELECT
    s.id, s.receipt_number, s.subtotal, s.discount_total, s.tax_total, s.grand_total,
    s.payment_status, s.outlet_id, s.shift_id,
    COALESCE(s.offline_created_at_adj, s.offline_created_at, s.created_at)::timestamptz AS sold_at,
    s.customer_id, c.member_code, c.name AS customer_name, u.name AS cashier_name,
    COALESCE((SELECT SUM(r.amount) FROM refunds r
              WHERE r.tenant_id = s.tenant_id AND r.transaction_id = s.id), 0)::decimal AS refunded_total,
    -- Void hanya boleh selama shift-nya masih terbuka (invarian: Z-Report yang
    -- sudah dicetak tidak pernah berubah).
    COALESCE((SELECT sh.status = 'open' FROM shifts sh
              WHERE sh.id = s.shift_id AND sh.tenant_id = s.tenant_id), FALSE)::boolean AS shift_open
FROM sales_transactions s
LEFT JOIN customers c ON c.id = s.customer_id AND c.tenant_id = s.tenant_id
LEFT JOIN users u ON u.id = s.cashier_id AND u.tenant_id = s.tenant_id
WHERE s.tenant_id = $1 AND s.id = $2;

-- name: ListSaleItems :many
SELECT si.id, si.variant_id, p.name AS product_name, v.name AS variant_name,
       si.quantity, si.uom, si.unit_price, si.subtotal
FROM sales_items si
JOIN variants v ON v.id = si.variant_id AND v.tenant_id = si.tenant_id
JOIN products p ON p.id = v.product_id AND p.tenant_id = v.tenant_id
WHERE si.tenant_id = $1 AND si.transaction_id = $2
ORDER BY si.id;

-- name: ListSalePayments :many
SELECT payment_method, amount
FROM payments
WHERE tenant_id = $1 AND transaction_id = $2
ORDER BY id;

-- name: ListSaleRefunds :many
SELECT r.id, r.refund_type, r.amount, r.reason, r.restock, r.created_at, u.name AS approved_by_name
FROM refunds r
LEFT JOIN users u ON u.id = r.approved_by AND u.tenant_id = r.tenant_id
WHERE r.tenant_id = $1 AND r.transaction_id = $2
ORDER BY r.created_at;

-- name: VoidSale :execrows
-- Pembatalan hanya untuk transaksi yang MASIH lunas dan shift-nya terbuka;
-- 0 baris = sudah void, sudah tutup shift, atau bukan milik tenant ini.
UPDATE sales_transactions s
SET payment_status = 'void'
WHERE s.tenant_id = $1
  AND s.id = $2
  AND s.payment_status = 'paid'
  AND EXISTS (SELECT 1 FROM shifts sh
              WHERE sh.id = s.shift_id AND sh.tenant_id = s.tenant_id AND sh.status = 'open');
