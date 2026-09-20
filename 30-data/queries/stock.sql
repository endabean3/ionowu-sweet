-- name: ListStockLevels :many
-- `uom` di sini adalah satuan STOK (satuan tempat stock_quantity dihitung):
-- gram untuk bibit yang dijual per ml (ADR-0012), selain itu satuan jual.
SELECT v.id AS variant_id, p.name AS product_name, v.name AS variant_name, v.stock_quantity,
       COALESCE(sc.to_uom, v.uom)::VARCHAR AS uom, v.min_stock_alert
FROM variants v
JOIN products p ON p.id = v.product_id AND p.tenant_id = v.tenant_id
LEFT JOIN LATERAL (
    -- Satuan STOK bila berbeda dari satuan jual (ADR-0012): bibit dijual per
    -- ml tetapi stoknya dihitung dalam gram. Konversi yang berlaku adalah
    -- yang BERANGKAT dari satuan jual varian.
    SELECT c.to_uom, c.factor
    FROM uom_conversions c
    WHERE c.tenant_id = v.tenant_id AND c.variant_id = v.id AND c.from_uom = v.uom
    ORDER BY c.created_at
    LIMIT 1
) sc ON TRUE
WHERE v.tenant_id = $1 AND v.is_active = TRUE AND v.item_type IN ('stock', 'composite')
ORDER BY p.name ASC, v.name ASC;

-- name: InsertStockEvent :one
INSERT INTO stock_events (id, tenant_id, outlet_id, variant_id, event_type, quantity_delta, balance_after, uom, reference_id, actor_user_id, note)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
RETURNING id;

-- name: InsertStockOpname :one
INSERT INTO stock_opname (id, tenant_id, outlet_id, status, started_by, approved_by, approved_at)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id;

-- name: InsertStockOpnameItem :one
INSERT INTO stock_opname_items (id, tenant_id, opname_id, variant_id, system_quantity, counted_quantity)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, variance;

-- name: AdjustStock :one
-- Stok masuk / barang rusak / koreksi opname dari layar Stok.
--
-- UPDATE tunggal ini sudah atomik dan mengambil kunci baris (alasan yang sama
-- dengan DecrementStockStrict di checkout.sql). `delta` BERTANDA: positif
-- menambah, negatif mengurangi, dan dihitung dalam SATUAN STOK (gram untuk
-- bibit, ADR-0012).
--
-- Jasa dan sewa (item_type lain) sengaja tidak punya stok, jadi 0 baris
-- kembali = varian tidak ada, milik tenant lain, atau tidak berstok.
UPDATE variants
SET stock_quantity = stock_quantity + sqlc.arg('delta')::DECIMAL
WHERE tenant_id = $1
  AND id        = $2
  AND item_type IN ('stock', 'composite')
RETURNING stock_quantity;

-- name: LockVariantStock :one
-- Opname: baca stok tersimpan sambil mengunci barisnya. Selisih dihitung dari
-- angka INI, bukan dari angka yang dikirim klien — angka klien bisa basi
-- (dibaca sebelum penjualan terakhir) atau dipalsukan.
SELECT stock_quantity
FROM variants
WHERE tenant_id = $1 AND id = $2 AND item_type IN ('stock', 'composite')
FOR UPDATE;

-- name: SetStock :one
-- Opname: stok DITETAPKAN sama dengan hasil timbang, bukan ditambah.
UPDATE variants
SET stock_quantity = sqlc.arg('counted')::DECIMAL
WHERE tenant_id = $1 AND id = $2 AND item_type IN ('stock', 'composite')
RETURNING stock_quantity;

-- name: GetStockUom :one
-- Satuan tempat stock_quantity dihitung: satuan STOK bila varian punya
-- konversi (bibit: gram), selain itu satuan jual. Dipakai untuk mengisi
-- stock_events.uom — ledger stok tidak boleh menebak satuan.
SELECT COALESCE(sc.to_uom, v.uom)::VARCHAR AS stock_uom
FROM variants v
LEFT JOIN LATERAL (
    SELECT c.to_uom
    FROM uom_conversions c
    WHERE c.tenant_id = v.tenant_id AND c.variant_id = v.id AND c.from_uom = v.uom
    ORDER BY c.created_at
    LIMIT 1
) sc ON TRUE
WHERE v.tenant_id = $1 AND v.id = $2;

-- name: OutletBelongsToTenant :one
-- Foreign key hanya menjamin outlet ADA. Tanpa ini, mutasi stok tenant A bisa
-- dicatat atas outlet tenant B.
SELECT EXISTS (
    SELECT 1 FROM outlets WHERE tenant_id = $1 AND id = $2 AND is_active
);
