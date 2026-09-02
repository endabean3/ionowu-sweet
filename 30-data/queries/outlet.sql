-- name: ListOutlets :many
SELECT id, tenant_id, name, address, phone, is_active, created_at, timezone, business_day_start
FROM outlets
WHERE tenant_id = $1
ORDER BY created_at ASC;

-- name: InsertOutlet :one
INSERT INTO outlets (id, tenant_id, name, address, phone, timezone, business_day_start)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id, name, address, phone, is_active, created_at, timezone, business_day_start;

-- name: UpdateOutlet :exec
UPDATE outlets
SET
    name = COALESCE(sqlc.narg('name'), name),
    address = COALESCE(sqlc.narg('address'), address),
    phone = COALESCE(sqlc.narg('phone'), phone),
    timezone = COALESCE(sqlc.narg('timezone'), timezone),
    business_day_start = COALESCE(sqlc.narg('business_day_start'), business_day_start),
    is_active = COALESCE(sqlc.narg('is_active'), is_active)
WHERE tenant_id = $1 AND id = $2;
