-- ═══════════════════════════════════════════════════════════════════════
--  JALUR UANG — anggaran total p99 < 5ms (PRD §4)
--
--  Seluruh kueri di berkas ini berjalan dalam SATU transaksi SQL:
--
--    BEGIN
--      CreateSaleIdempotent      → 0 baris berarti duplikat, bukan error
--      InsertSalesItems          (copyfrom)
--      InsertPayment             (per metode bayar; FR-22 split payment)
--      DecrementStock*           → mengunci baris variants
--      InsertStockEvents         (copyfrom)
--      InsertOutboxEvent         → mengatasi masalah dual-write
--    COMMIT
--
--  Urutan penting: stok dikurangi SETELAH transaksi tersimpan, agar kegagalan
--  stok tidak meninggalkan transaksi yatim.
-- ═══════════════════════════════════════════════════════════════════════

-- name: CreateSaleIdempotent :one
-- HOT PATH. ULID dibuat KLIEN — inilah kunci idempotensi.
--
-- ON CONFLICT DO NOTHING + RETURNING: bila 0 baris kembali, transaksi ini SUDAH
-- pernah masuk. Itu bukan kegagalan melainkan kelas ACCEPTED
-- (ERROR-CATALOG §4): klien menandainya 'synced' dan melanjutkan.
--
-- Tanpa perilaku ini, transaksi yang sudah aman di server akan tersangkut
-- selamanya di antrean lokal sampai IndexedDB penuh — satu-satunya jalur
-- menuju "kasir tidak bisa berjualan".
INSERT INTO sales_transactions (
    id, tenant_id, outlet_id, cashier_id, shift_id, customer_id,
    receipt_number, subtotal, discount_total, tax_total, grand_total,
    payment_status,
    offline_created_at, offline_created_at_adj, device_clock_offset_s, device_id,
    synced_at, is_late_arrival, is_sandbox
) VALUES (
    $1, $2, $3, $4, $5, $6,
    $7, $8, $9, $10, $11,
    $12,
    $13, $14, $15, $16,
    now(), $17, $18
)
ON CONFLICT (id) DO NOTHING
RETURNING id, receipt_number, grand_total, created_at;

-- name: GetSaleByID :one
-- Dipakai saat CreateSaleIdempotent mengembalikan 0 baris (idempotency hit,
-- ERROR-CATALOG §B DUPLICATE_TRANSACTION) — klien menerima record yang SUDAH
-- ada, bukan error, persis seperti openapi.yaml POST /sales respons 200.
SELECT id, receipt_number, grand_total, subtotal, discount_total, tax_total, created_at
FROM sales_transactions
WHERE tenant_id = $1
  AND id        = $2;

-- name: InsertSalesItems :copyfrom
-- HOT PATH. quantity DECIMAL(14,3) — 0,25 kg tepung · 30 ml parfum.
-- unit_price & unit_cost DISALIN saat transaksi: laporan tidak pernah
-- menghitung ulang memakai harga sekarang.
INSERT INTO sales_items (
    id, tenant_id, transaction_id, variant_id,
    quantity, uom, unit_price, unit_cost, subtotal
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9
);

-- name: InsertPayment :one
-- FR-22: satu transaksi boleh punya beberapa baris (Rp 20.000 tunai + Rp 30.000 QRIS).
INSERT INTO payments (
    id, tenant_id, transaction_id, payment_method, amount, reference_id
) VALUES (
    $1, $2, $3, $4, $5, $6
)
RETURNING id;

-- ── PEMOTONGAN STOK ────────────────────────────────────────────────────
-- Dua kueri berbeda dan itu DISENGAJA. Perbedaannya adalah keputusan produk,
-- bukan detail teknis. (ERROR-CATALOG §5)

-- name: DecrementStockStrict :one
-- HOT PATH — checkout ONLINE. Menolak bila stok tidak cukup.
--
-- UPDATE tunggal ini sudah atomik dan mengambil kunci baris; tidak perlu
-- SELECT ... FOR UPDATE terpisah. Inilah alasan mutex Redis TIDAK dipakai
-- di sini — menambahkan Redis ke jalur ini berarti menambah titik kegagalan
-- pada bagian sistem yang paling tidak boleh gagal. (REDIS-STRATEGY §5)
--
-- 0 baris kembali → INSUFFICIENT_STOCK (kelas PERMANENT).
UPDATE variants
SET stock_quantity = stock_quantity - $3
WHERE tenant_id = $1
  AND id        = $2
  AND is_active
  AND item_type IN ('stock', 'composite')
  AND stock_quantity >= $3
RETURNING stock_quantity;

-- name: DecrementStockAllowNegative :one
-- SINKRONISASI OFFLINE. Stok BOLEH menjadi negatif.
--
-- Barang sudah keluar secara fisik, pelanggan sudah pergi, uang sudah diterima.
-- Menolak sync berarti menghapus penjualan nyata dari catatan.
-- Stok minus adalah INFORMASI ("lakukan opname di sini"), bukan kerusakan data.
-- (OFFLINE-SYNC-SPEC §2 prinsip 3, §3A)
UPDATE variants
SET stock_quantity = stock_quantity - $3
WHERE tenant_id = $1
  AND id        = $2
  AND item_type IN ('stock', 'composite')
RETURNING stock_quantity;

-- name: InsertStockEvents :copyfrom
-- Ledger append-only. variants.stock_quantity hanyalah cache;
-- KEBENARAN stok ada di tabel ini. (DATA-MODEL §4C)
INSERT INTO stock_events (
    id, tenant_id, outlet_id, variant_id, event_type,
    quantity_delta, balance_after, uom, reference_id, actor_user_id
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
);

-- name: InsertOutboxEvent :one
-- Ditulis dalam TRANSAKSI YANG SAMA dengan penjualan.
--
-- Postgres dan Redis tidak berbagi transaksi: bila Redis mati setelah COMMIT,
-- event akan hilang tanpa cara mendeteksinya. Outbox memindahkan penerbitan
-- ke proses terpisah, sehingga Redis boleh mati tanpa menghentikan kasir.
-- (EVENT-ARCHITECTURE §5)
INSERT INTO event_outbox (
    id, tenant_id, event_type, version, payload, occurred_at
) VALUES (
    $1, $2, $3, $4, $5, $6
)
RETURNING id;

-- ── VOID & IDEMPOTENSI ─────────────────────────────────────────────────

-- name: VoidTransaction :one
-- Hanya transaksi 'paid' yang bisa di-void; mencoba void dua kali
-- mengembalikan 0 baris → TRANSACTION_ALREADY_VOIDED (kelas PERMANENT).
UPDATE sales_transactions
SET payment_status = 'void'
WHERE tenant_id      = $1
  AND id             = $2
  AND payment_status = 'paid'
RETURNING id, grand_total;

-- name: GetSyncReceipt :one
-- Dipanggil SEBELUM memproses batch. Bila key sudah ada dengan hash body yang
-- sama, kembalikan respons tersimpan apa adanya — klien menerima jawaban
-- identik seperti percobaan pertama.
SELECT idempotency_key, request_hash, response_status, response_body
FROM sync_receipts
WHERE tenant_id       = $1
  AND idempotency_key = $2;

-- name: SaveSyncReceipt :exec
-- Retensi 7 hari; dibersihkan job harian. (RETENTION §2)
INSERT INTO sync_receipts (
    idempotency_key, tenant_id, outlet_id, device_id,
    request_hash, response_status, response_body, expires_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, now() + interval '7 days'
)
ON CONFLICT (idempotency_key) DO NOTHING;

-- name: UpsertDeviceSyncState :exec
-- Telemetri perangkat ikut bersama sync. storage_used_pct adalah peringatan dini
-- sebelum IndexedDB penuh — server bisa tampak sehat sempurna sementara sebuah
-- perangkat kasir mendekati kegagalan total. (OBSERVABILITY §3)
INSERT INTO device_sync_state (
    id, tenant_id, outlet_id, device_id,
    last_push_at, pending_count, storage_used_pct,
    persistent_storage_granted, app_version
) VALUES (
    $1, $2, $3, $4, now(), $5, $6, $7, $8
)
ON CONFLICT (tenant_id, outlet_id, device_id) DO UPDATE
SET last_push_at               = now(),
    pending_count              = EXCLUDED.pending_count,
    storage_used_pct           = EXCLUDED.storage_used_pct,
    persistent_storage_granted = EXCLUDED.persistent_storage_granted,
    app_version                = EXCLUDED.app_version;

-- name: InsertAuditLog :exec
-- SECURITY §6 — append-only. Setiap aksi sensitif: void, diskon manual,
-- buka laci tanpa transaksi, akses break-glass platform admin.
INSERT INTO audit_logs (
    id, tenant_id, outlet_id, actor_user_id, actor_admin_id,
    action_type, reference_id, metadata, ip_address
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9
);

-- name: GetSaleForRefund :one
-- Dipakai PostRefund untuk menegakkan REFUND_EXCEEDS_TOTAL (ERROR-CATALOG §B)
-- — tanpa ini, refund_total tidak pernah dibandingkan dengan grand_total asli.
SELECT id, outlet_id, cashier_id, grand_total, payment_status
FROM sales_transactions
WHERE tenant_id = $1 AND id = $2;

-- name: SumRefundsForTransaction :one
-- Refund SEBELUMNYA pada transaksi yang sama — dijumlahkan dengan permintaan
-- baru lewat money.RemainingRefundable sebelum refund ini disimpan.
SELECT COALESCE(SUM(amount), 0)::decimal AS total_refunded
FROM refunds
WHERE tenant_id = $1 AND transaction_id = $2;

-- name: GetApproverForPin :one
-- Manager/owner yang MENYETUJUI refund kasir (RBAC-MODEL §"Void transaksi":
-- kasir wajib PIN manager). Bukan user yang sedang login — approved_by
-- HARUS identitas manager, bukan kasir menyetujui diri sendiri.
SELECT id, role, pin_hash, is_active
FROM users
WHERE tenant_id = $1 AND id = $2;

-- name: GetSalesItemForRefund :one
-- Validasi item yang mau di-restock benar-benar milik transaksi ini
-- (mencegah refund_items menunjuk ke sales_item transaksi/tenant lain).
SELECT variant_id, uom
FROM sales_items
WHERE tenant_id = $1 AND transaction_id = $2 AND id = $3;

-- name: IncrementStockForRefund :one
-- Kebalikan DecrementStockAllowNegative — barang fisik kembali ke rak.
-- item_type dibatasi sama seperti pemotongan stok checkout.
UPDATE variants
SET stock_quantity = stock_quantity + $3
WHERE tenant_id = $1
  AND id        = $2
  AND item_type IN ('stock', 'composite')
RETURNING stock_quantity;

-- name: InsertRefund :one
INSERT INTO refunds (id, tenant_id, transaction_id, shift_id, refund_type, amount, reason, approved_by, restock)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING id;

-- name: InsertRefundItem :one
INSERT INTO refund_items (id, tenant_id, refund_id, sales_item_id, quantity, amount)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id;
