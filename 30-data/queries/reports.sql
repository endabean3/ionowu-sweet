-- Laporan penjualan harian / tutup buku (Z-Report).
--
-- DUA aturan yang membentuk seluruh berkas ini:
--
--  1. **Waktu laporan = waktu TERKOREKSI perangkat**, bukan waktu server.
--     `COALESCE(offline_created_at_adj, offline_created_at, created_at)` —
--     transaksi yang dibuat offline pukul 20.00 lalu terkirim pukul 23.00
--     milik hari ia terjadi, bukan hari ia sampai. (skema 00005 baris
--     "Laporan memakai versi terkoreksi; audit memakai yang mentah")
--
--  2. **Z-Report yang sudah dicetak tidak pernah berubah** (invarian §6 #5).
--     Karena itu `is_late_arrival` DIKECUALIKAN dari semua angka utama dan
--     dilaporkan di embernya sendiri — sama seperti CalculateExpectedCash.
--     Tanpa pengecualian itu, laporan kemarin yang sudah ditandatangani
--     kasir bisa berubah sendiri hari ini.
--
-- `is_sandbox` dikecualikan di mana-mana: data percobaan onboarding tidak
-- pernah masuk laporan mana pun.

-- name: GetSalesReportSummary :one
-- Angka induk laporan. Void dihitung terpisah — barangnya kembali dan
-- uangnya tidak pernah jadi pendapatan, tetapi pemilik tetap perlu tahu
-- berapa banyak yang dibatalkan hari itu.
SELECT
    COUNT(*) FILTER (WHERE s.payment_status = 'paid')::int            AS paid_count,
    COALESCE(SUM(s.subtotal)      FILTER (WHERE s.payment_status = 'paid'), 0)::decimal AS gross_sales,
    COALESCE(SUM(s.discount_total) FILTER (WHERE s.payment_status = 'paid'), 0)::decimal AS discount_total,
    COALESCE(SUM(s.tax_total)     FILTER (WHERE s.payment_status = 'paid'), 0)::decimal AS tax_total,
    COALESCE(SUM(s.grand_total)   FILTER (WHERE s.payment_status = 'paid'), 0)::decimal AS net_sales,
    COUNT(*) FILTER (WHERE s.payment_status = 'void')::int            AS void_count,
    COALESCE(SUM(s.grand_total)   FILTER (WHERE s.payment_status = 'void'), 0)::decimal AS void_total
FROM sales_transactions s
WHERE s.tenant_id = $1
  AND s.outlet_id = $2
  AND NOT s.is_sandbox
  AND NOT s.is_late_arrival
  AND COALESCE(s.offline_created_at_adj, s.offline_created_at, s.created_at) >= sqlc.arg('dari')::timestamptz
  AND COALESCE(s.offline_created_at_adj, s.offline_created_at, s.created_at) <  sqlc.arg('sampai')::timestamptz;

-- name: GetLateArrivalBucket :one
-- Ember terpisah invarian §6 #5: transaksi hari itu yang baru tiba SETELAH
-- shift-nya ditutup. Nyata dan sah, tetapi tidak boleh menggeser angka yang
-- sudah dicetak. Pemilik melihatnya sebagai baris tersendiri.
SELECT
    COUNT(*)::int                          AS late_count,
    COALESCE(SUM(s.grand_total), 0)::decimal AS late_total
FROM sales_transactions s
WHERE s.tenant_id = $1
  AND s.outlet_id = $2
  AND NOT s.is_sandbox
  AND s.is_late_arrival
  AND s.payment_status = 'paid'
  AND COALESCE(s.offline_created_at_adj, s.offline_created_at, s.created_at) >= sqlc.arg('dari')::timestamptz
  AND COALESCE(s.offline_created_at_adj, s.offline_created_at, s.created_at) <  sqlc.arg('sampai')::timestamptz;

-- name: CountReportItems :one
-- Jumlah BARIS barang terjual, bukan penjumlahan kuantitas: menjumlahkan
-- 30 ml dengan 2 botol menghasilkan angka yang tidak berarti apa-apa
-- (alasan yang sama dengan totalItemCount di layar kasir).
SELECT COUNT(*)::int AS item_lines
FROM sales_items si
JOIN sales_transactions s ON s.id = si.transaction_id AND s.tenant_id = si.tenant_id
WHERE si.tenant_id = $1
  AND s.outlet_id = $2
  AND NOT s.is_sandbox
  AND NOT s.is_late_arrival
  AND s.payment_status = 'paid'
  AND COALESCE(s.offline_created_at_adj, s.offline_created_at, s.created_at) >= sqlc.arg('dari')::timestamptz
  AND COALESCE(s.offline_created_at_adj, s.offline_created_at, s.created_at) <  sqlc.arg('sampai')::timestamptz;

-- name: SumPaymentsByMethodForReport :many
-- Rincian per metode bayar. Inilah yang dicocokkan pemilik dengan isi laci
-- (tunai) dan mutasi rekening (transfer/QRIS).
SELECT
    p.payment_method,
    COUNT(*)::int                     AS payment_count,
    COALESCE(SUM(p.amount), 0)::decimal AS total
FROM payments p
JOIN sales_transactions s ON s.id = p.transaction_id AND s.tenant_id = p.tenant_id
WHERE p.tenant_id = $1
  AND s.outlet_id = $2
  AND NOT s.is_sandbox
  AND NOT s.is_late_arrival
  AND s.payment_status = 'paid'
  AND COALESCE(s.offline_created_at_adj, s.offline_created_at, s.created_at) >= sqlc.arg('dari')::timestamptz
  AND COALESCE(s.offline_created_at_adj, s.offline_created_at, s.created_at) <  sqlc.arg('sampai')::timestamptz
GROUP BY p.payment_method
ORDER BY p.payment_method;

-- name: SumRefundsForReport :one
-- Refund dihitung dari TANGGAL REFUND-nya, bukan tanggal transaksi aslinya:
-- uang keluar dari laci hari ini, jadi ia mengurangi kas hari ini. Nota
-- yang direfund bisa saja terbit minggu lalu.
SELECT
    COUNT(*)::int                        AS refund_count,
    COALESCE(SUM(r.amount), 0)::decimal  AS refund_total
FROM refunds r
JOIN sales_transactions s ON s.id = r.transaction_id AND s.tenant_id = r.tenant_id
WHERE r.tenant_id = $1
  AND s.outlet_id = $2
  AND NOT s.is_sandbox
  AND r.created_at >= sqlc.arg('dari')::timestamptz
  AND r.created_at <  sqlc.arg('sampai')::timestamptz;

-- name: SumCashMovementsForReport :one
-- Kas masuk/keluar di luar penjualan (FR-31 petty cash): ambil uang belanja,
-- setor ke bank. Tanpa ini, selisih laci tidak pernah bisa dijelaskan.
SELECT
    COALESCE(SUM(m.amount) FILTER (WHERE m.direction = 'in'), 0)::decimal  AS cash_in,
    COALESCE(SUM(m.amount) FILTER (WHERE m.direction = 'out'), 0)::decimal AS cash_out
FROM cash_movements m
JOIN shifts sh ON sh.id = m.shift_id AND sh.tenant_id = m.tenant_id
WHERE m.tenant_id = $1
  AND sh.outlet_id = $2
  AND m.created_at >= sqlc.arg('dari')::timestamptz
  AND m.created_at <  sqlc.arg('sampai')::timestamptz;

-- name: ListShiftsForReport :many
-- Satu baris per shift: siapa kasirnya, berapa kas diharapkan, berapa yang
-- dihitung, dan selisihnya. Shift yang MASIH TERBUKA ikut tampil dengan
-- nilai kosong — pemilik perlu tahu laporannya belum final.
SELECT
    sh.id,
    sh.opened_at,
    sh.closed_at,
    sh.opening_cash,
    sh.expected_cash,
    sh.counted_cash,
    sh.variance,
    sh.status,
    u.name AS cashier_name
FROM shifts sh
LEFT JOIN users u ON u.id = sh.cashier_id AND u.tenant_id = sh.tenant_id
WHERE sh.tenant_id = $1
  AND sh.outlet_id = $2
  AND sh.opened_at >= sqlc.arg('dari')::timestamptz
  AND sh.opened_at <  sqlc.arg('sampai')::timestamptz
ORDER BY sh.opened_at;

-- name: ListTopProductsForReport :many
-- Barang terlaris periode ini, dalam SATUAN JUAL (ml untuk bibit) — ini
-- laporan penjualan, bukan laporan stok. Pergerakan gram ada di
-- /laporan-stok yang membaca ledger stock_events.
SELECT
    p.name AS product_name,
    v.name AS variant_name,
    si.uom,
    SUM(si.quantity)::decimal AS quantity_sold,
    SUM(si.subtotal)::decimal AS revenue
FROM sales_items si
JOIN sales_transactions s ON s.id = si.transaction_id AND s.tenant_id = si.tenant_id
JOIN variants v ON v.id = si.variant_id AND v.tenant_id = si.tenant_id
JOIN products p ON p.id = v.product_id AND p.tenant_id = v.tenant_id
WHERE si.tenant_id = $1
  AND s.outlet_id = $2
  AND NOT s.is_sandbox
  AND NOT s.is_late_arrival
  AND s.payment_status = 'paid'
  AND COALESCE(s.offline_created_at_adj, s.offline_created_at, s.created_at) >= sqlc.arg('dari')::timestamptz
  AND COALESCE(s.offline_created_at_adj, s.offline_created_at, s.created_at) <  sqlc.arg('sampai')::timestamptz
GROUP BY p.name, v.name, si.uom
ORDER BY revenue DESC
LIMIT sqlc.arg('batas')::int;
