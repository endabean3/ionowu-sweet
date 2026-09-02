-- +goose Up
-- Tabel ringkasan BI & prediksi. Ditulis worker Python.
-- Rujukan: ANALYTICS-BI.md §4 · INTELLIGENCE-WORKER.md §5

-- Kueri BI TIDAK PERNAH menyentuh jalur checkout. Agregasi semalam ke tabel ini
-- adalah Tahap 1 — cukup untuk ~100 outlet. (ANALYTICS-BI §3)
CREATE TABLE daily_outlet_summary (
    id                      VARCHAR(26) PRIMARY KEY,
    tenant_id               VARCHAR(26) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    outlet_id               VARCHAR(26) NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    -- BUKAN DATE(created_at): memakai batas jam tutup buku per outlet.
    -- Kafe yang tutup pukul 01.00 mencatat penjualannya di hari kemarin.
    business_date           DATE NOT NULL,
    transaction_count       INT NOT NULL DEFAULT 0,
    gross_sales             DECIMAL(14,2) NOT NULL DEFAULT 0,
    discount_total          DECIMAL(14,2) NOT NULL DEFAULT 0,
    net_sales               DECIMAL(14,2) NOT NULL DEFAULT 0,
    -- Hanya untuk Owner. Lapisan kueri WAJIB memfilter kolom ini untuk peran lain —
    -- satu endpoint yang lupa akan membocorkan margin usaha. (ANALYTICS-BI §6)
    cogs_total              DECIMAL(14,2) NOT NULL DEFAULT 0,
    gross_profit            DECIMAL(14,2) NOT NULL DEFAULT 0,
    payment_breakdown       JSONB NOT NULL DEFAULT '{}'::jsonb,
    offline_transaction_count INT NOT NULL DEFAULT 0,
    unique_customer_count   INT,
    computed_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Idempoten: menjalankan ulang untuk tanggal sama harus menghasilkan angka sama,
-- karena transaksi offline bisa tiba terlambat dan memaksa hitung ulang.
CREATE UNIQUE INDEX idx_daily_summary ON daily_outlet_summary(tenant_id, outlet_id, business_date);

CREATE TABLE product_performance_summary (
    id              VARCHAR(26) PRIMARY KEY,
    tenant_id       VARCHAR(26) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    outlet_id       VARCHAR(26) NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    variant_id      VARCHAR(26) NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
    period_start    DATE NOT NULL,
    period_type     VARCHAR(10) NOT NULL CHECK (period_type IN ('daily','weekly','monthly')),
    quantity_sold   DECIMAL(14,3) NOT NULL DEFAULT 0,
    revenue         DECIMAL(14,2) NOT NULL DEFAULT 0,
    gross_profit    DECIMAL(14,2) NOT NULL DEFAULT 0,
    rank_in_outlet  INT,
    computed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_product_perf
    ON product_performance_summary(tenant_id, outlet_id, variant_id, period_start, period_type);

CREATE TABLE restock_predictions (
    id                      VARCHAR(26) PRIMARY KEY,
    tenant_id               VARCHAR(26) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    outlet_id               VARCHAR(26) NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    variant_id              VARCHAR(26) NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
    predicted_stockout_date DATE,
    recommended_qty         DECIMAL(14,3),
    uom                     VARCHAR(10),
    confidence              VARCHAR(10) CHECK (confidence IN ('low','medium','high')),
    method                  VARCHAR(20),    -- v0_moving_avg, v1_weekday, ...
    -- Angka mentah tanpa kalimat penjelas akan diabaikan pemilik.
    reasoning               TEXT NOT NULL,
    computed_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_prediction_current
    ON restock_predictions(tenant_id, outlet_id, variant_id, computed_at DESC);

-- Satu-satunya cara tahu apakah fitur prediksi benar-benar bekerja.
-- Tanpanya, model bisa memburuk berbulan-bulan tanpa ada yang sadar.
CREATE TABLE prediction_outcomes (
    id                  VARCHAR(26) PRIMARY KEY,
    tenant_id           VARCHAR(26) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    prediction_id       VARCHAR(26) NOT NULL REFERENCES restock_predictions(id) ON DELETE CASCADE,
    actual_stockout_date DATE,
    was_followed        BOOLEAN,        -- memasok metrik "rasio rekomendasi dijalankan"
    error_days          INT,
    recorded_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pred_outcomes ON prediction_outcomes(tenant_id, prediction_id);

-- +goose Down
DROP TABLE IF EXISTS prediction_outcomes;
DROP TABLE IF EXISTS restock_predictions;
DROP TABLE IF EXISTS product_performance_summary;
DROP TABLE IF EXISTS daily_outlet_summary;
