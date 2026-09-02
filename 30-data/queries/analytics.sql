-- name: GetDailySummary :one
SELECT
    COUNT(*) AS transaction_count,
    COALESCE(SUM(subtotal), 0) AS gross_sales,
    COALESCE(SUM(discount_total), 0) AS discount_total,
    COALESCE(SUM(grand_total), 0) AS net_sales
FROM sales_transactions
WHERE tenant_id = $1
  AND payment_status = 'paid'
  AND created_at >= CURRENT_DATE;

-- name: GetTopProducts :many
SELECT
    v.name AS variant_name,
    p.name AS product_name,
    COALESCE(SUM(si.quantity), 0) AS quantity_sold,
    COALESCE(SUM(si.subtotal), 0) AS revenue
FROM sales_items si
JOIN sales_transactions st ON st.id = si.transaction_id
JOIN variants v ON v.id = si.variant_id
JOIN products p ON p.id = v.product_id
WHERE st.tenant_id = $1
  AND st.payment_status = 'paid'
  AND st.created_at >= CURRENT_DATE
GROUP BY v.id, p.id
ORDER BY quantity_sold DESC
LIMIT 5;
