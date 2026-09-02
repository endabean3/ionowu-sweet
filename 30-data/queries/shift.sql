-- Shift kasir. Kasir tidak bisa bertransaksi tanpa shift terbuka (FR-30).

-- name: GetOpenShift :one
-- HOT PATH — dipanggil di awal setiap checkout untuk memperoleh shift_id.
-- Memakai indeks unik parsial idx_shifts_one_open.
SELECT
    id,
    outlet_id,
    cashier_id,
    opened_at,
    opening_cash
FROM shifts
WHERE tenant_id  = $1
  AND outlet_id  = $2
  AND cashier_id = $3
  AND status     = 'open';

-- name: OpenShift :one
-- Indeks unik parsial mencegah dua shift terbuka untuk kasir yang sama.
-- Bila terjadi konflik, itu bug klien — bukan kondisi yang perlu ditangani diam-diam.
INSERT INTO shifts (
    id, tenant_id, outlet_id, cashier_id, opened_at, opening_cash, status
) VALUES (
    $1, $2, $3, $4, $5, $6, 'open'
)
RETURNING id, opened_at;

-- name: CalculateExpectedCash :one
-- expected = saldo awal + tunai masuk + kas masuk − kas keluar.
--
-- Transaksi yang tiba TERLAMBAT (is_late_arrival) sengaja DIKECUALIKAN:
-- Z-Report yang sudah dicetak tidak boleh berubah retroaktif, karena kasir
-- sudah menghitung uang fisik dan menandatangani hasilnya. (OFFLINE-SYNC-SPEC §3C)
SELECT
    s.opening_cash,
    COALESCE(cash.total, 0)::numeric   AS cash_sales,
    COALESCE(mv.total_in, 0)::numeric  AS cash_in,
    COALESCE(mv.total_out, 0)::numeric AS cash_out
FROM shifts s
LEFT JOIN LATERAL (
    SELECT SUM(p.amount) AS total
    FROM payments p
    JOIN sales_transactions t
        ON t.id = p.transaction_id
       AND t.tenant_id = p.tenant_id
    WHERE p.tenant_id      = s.tenant_id
      AND t.shift_id       = s.id
      AND p.payment_method = 'cash'
      AND t.payment_status = 'paid'
      AND NOT t.is_late_arrival
      AND NOT t.is_sandbox
) cash ON TRUE
LEFT JOIN LATERAL (
    SELECT
        SUM(amount) FILTER (WHERE direction = 'in')  AS total_in,
        SUM(amount) FILTER (WHERE direction = 'out') AS total_out
    FROM cash_movements
    WHERE tenant_id = s.tenant_id
      AND shift_id  = s.id
) mv ON TRUE
WHERE s.tenant_id = $1
  AND s.id        = $2;

-- name: CloseShift :one
-- variance = counted − expected. Negatif maupun positif sama-sama perlu diselidiki.
--
-- Cast eksplisit ::numeric WAJIB di sini: tanpanya Postgres tidak bisa
-- meng-infer tipe $4/$5 dari ekspresi aritmetika `$5 - $4` walau keduanya
-- juga dipakai di SET lain sebagai kolom numeric — gagal dengan
-- "operator is not unique: unknown - unknown" (ditemukan saat kueri ini
-- benar-benar dijalankan pertama kali, lihat queries/README.md).
UPDATE shifts
SET closed_at     = $3,
    expected_cash = $4,
    counted_cash  = $5,
    variance      = $5::numeric - $4::numeric,
    closed_by     = $6,
    status        = 'closed'
WHERE tenant_id = $1
  AND id        = $2
  AND status    = 'open'
RETURNING id, variance, closed_at;

-- name: RecordCashMovement :one
-- FR-31 petty cash — mempengaruhi perhitungan expected_cash di atas.
INSERT INTO cash_movements (
    id, tenant_id, shift_id, direction, amount, reason, actor_user_id
) VALUES (
    $1, $2, $3, $4, $5, $6, $7
)
RETURNING id, created_at;

-- name: InsertCashMovement :one
INSERT INTO cash_movements (id, tenant_id, shift_id, direction, amount, reason, actor_user_id)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id;
