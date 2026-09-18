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
