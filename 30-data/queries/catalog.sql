-- name: LookupVariantByBarcode :one
SELECT
    v.id, v.product_id, p.name AS product_name, v.name AS variant_name,
    v.sku, v.barcode, v.item_type, v.uom, v.uom_precision,
    COALESCE(o.price, v.price) AS price, v.stock_quantity, v.min_stock_alert
FROM variants v
JOIN products p ON p.id = v.product_id AND p.tenant_id = v.tenant_id
LEFT JOIN outlet_price_overrides o ON o.variant_id = v.id AND o.tenant_id = v.tenant_id AND o.outlet_id = $3
WHERE v.tenant_id = $1 AND v.barcode = $2 AND v.is_active
LIMIT 1;

-- name: SearchVariants :many
SELECT
    v.id, p.name AS product_name, v.name AS variant_name, v.item_type,
    v.uom, v.uom_precision, COALESCE(o.price, v.price) AS price, v.stock_quantity
FROM variants v
JOIN products p ON p.id = v.product_id AND p.tenant_id = v.tenant_id
LEFT JOIN outlet_price_overrides o ON o.variant_id = v.id AND o.tenant_id = v.tenant_id AND o.outlet_id = $2
WHERE v.tenant_id = $1 AND v.is_active AND (p.name ILIKE '%' || $3 || '%' OR v.sku ILIKE '%' || $3 || '%')
ORDER BY p.name, v.name
LIMIT $4;

-- name: GetVariantForCheckout :one
SELECT
    v.id, v.item_type, v.uom, v.uom_precision, COALESCE(o.price, v.price) AS price,
    v.cost_price, v.stock_quantity, COALESCE(sc.to_uom, '')::VARCHAR AS stock_uom, COALESCE(sc.factor, 0)::DECIMAL AS stock_factor
FROM variants v
LEFT JOIN outlet_price_overrides o ON o.variant_id = v.id AND o.tenant_id = v.tenant_id AND o.outlet_id = $3
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
WHERE v.tenant_id = $1 AND v.id = $2 AND v.is_active;

-- name: ListCatalogForSync :many
SELECT
    v.id, v.product_id, p.category_id, p.name AS product_name, v.name AS variant_name,
    v.sku, v.barcode, v.item_type, v.uom, v.uom_precision,
    COALESCE(o.price, v.price) AS price, v.stock_quantity, v.min_stock_alert,
    v.is_active, GREATEST(v.created_at, p.created_at) AS updated_at,
    COALESCE(sc.to_uom, '')::VARCHAR AS stock_uom, COALESCE(sc.factor, 0)::DECIMAL AS stock_factor
FROM variants v
JOIN products p ON p.id = v.product_id AND p.tenant_id = v.tenant_id
LEFT JOIN outlet_price_overrides o ON o.variant_id = v.id AND o.tenant_id = v.tenant_id AND o.outlet_id = $2
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
WHERE v.tenant_id = $1
ORDER BY v.id
LIMIT $3;

-- name: GetBomComponents :many
SELECT b.component_variant_id, b.quantity, b.uom, b.waste_pct
FROM bom_components b
WHERE b.tenant_id = $1 AND b.parent_variant_id = $2;

-- name: ConvertUom :one
SELECT factor
FROM uom_conversions
WHERE tenant_id = $1 AND variant_id = $2 AND from_uom = $3 AND to_uom = $4;

-- name: ListProducts :many
SELECT id, tenant_id, category_id, name, description, image_url, is_active, created_at
FROM products
WHERE tenant_id = $1
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- name: UpdateProduct :exec
UPDATE products
SET
    name = COALESCE(sqlc.narg('name'), name),
    description = COALESCE(sqlc.narg('description'), description),
    is_active = COALESCE(sqlc.narg('is_active'), is_active)
WHERE tenant_id = $1 AND id = $2;

-- name: UpdateVariant :exec
UPDATE variants
SET
    name = COALESCE(sqlc.narg('name'), name),
    price = COALESCE(sqlc.narg('price'), price),
    sku = COALESCE(sqlc.narg('sku'), sku),
    barcode = COALESCE(sqlc.narg('barcode'), barcode),
    is_active = COALESCE(sqlc.narg('is_active'), is_active)
WHERE tenant_id = $1 AND id = $2;
