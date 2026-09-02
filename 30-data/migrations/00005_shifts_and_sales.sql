-- +goose Up
-- Shift, kas, dan transaksi penjualan — jalur uang.
-- Rujukan: DATA-MODEL.md §3, §4 · OFFLINE-SYNC-SPEC.md §3C · ONBOARDING §6

CREATE TABLE shifts (
    id              VARCHAR(26) PRIMARY KEY,
    tenant_id       VARCHAR(26) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    outlet_id       VARCHAR(26) NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    cashier_id      VARCHAR(26) NOT NULL REFERENCES users(id),
    opened_at       TIMESTAMPTZ NOT NULL,
    closed_at       TIMESTAMPTZ,
    opening_cash    DECIMAL(14,2) NOT NULL CHECK (opening_cash >= 0),
    expected_cash   DECIMAL(14,2),
    counted_cash    DECIMAL(14,2),
    variance        DECIMAL(14,2),          -- counted - expected; boleh negatif
    status          VARCHAR(20) NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','closed','force_closed')),
    closed_by       VARCHAR(26) REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_shifts_tenant_outlet ON shifts(tenant_id, outlet_id, opened_at DESC);
-- Satu kasir hanya boleh punya satu shift terbuka per outlet.
CREATE UNIQUE INDEX idx_shifts_one_open ON shifts(tenant_id, outlet_id, cashier_id)
    WHERE status = 'open';

CREATE TABLE cash_movements (
    id              VARCHAR(26) PRIMARY KEY,
    tenant_id       VARCHAR(26) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    shift_id        VARCHAR(26) NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    direction       VARCHAR(10) NOT NULL CHECK (direction IN ('in','out')),
    amount          DECIMAL(14,2) NOT NULL CHECK (amount > 0),
    reason          VARCHAR(200) NOT NULL,      -- "beli es batu darurat"
    actor_user_id   VARCHAR(26) NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cash_movements_shift ON cash_movements(tenant_id, shift_id);

CREATE TABLE sales_transactions (
    id                  VARCHAR(26) PRIMARY KEY,   -- ULID klien = kunci idempotensi
    tenant_id           VARCHAR(26) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    outlet_id           VARCHAR(26) NOT NULL REFERENCES outlets(id),
    cashier_id          VARCHAR(26) NOT NULL REFERENCES users(id),
    shift_id            VARCHAR(26) REFERENCES shifts(id),
    -- Nullable dan memang harus begitu: mayoritas transaksi UMKM anonim.
    -- Memaksa input identitas pelanggan melanggar "kasir tidak boleh menunggu".
    customer_id         VARCHAR(26) REFERENCES customers(id) ON DELETE SET NULL,

    receipt_number      VARCHAR(100) NOT NULL,
    subtotal            DECIMAL(14,2) NOT NULL,
    discount_total      DECIMAL(14,2) NOT NULL DEFAULT 0,
    tax_total           DECIMAL(14,2) NOT NULL DEFAULT 0,
    grand_total         DECIMAL(14,2) NOT NULL,
    payment_status      VARCHAR(20) NOT NULL
                        CHECK (payment_status IN ('paid','void','pending')),

    -- Waktu perangkat apa adanya, versi terkoreksi offset, dan waktu server.
    -- Laporan memakai versi terkoreksi; audit memakai yang mentah.
    offline_created_at      TIMESTAMPTZ,
    offline_created_at_adj  TIMESTAMPTZ,
    device_clock_offset_s   INT,
    device_id               VARCHAR(64),
    synced_at               TIMESTAMPTZ,

    -- Z-Report yang sudah dicetak TIDAK PERNAH berubah. Transaksi yang tiba
    -- setelah shift ditutup masuk bucket terpisah. (OFFLINE-SYNC-SPEC §3C)
    is_late_arrival     BOOLEAN NOT NULL DEFAULT FALSE,
    -- Data percobaan onboarding; dikecualikan dari SELURUH laporan & metrik.
    -- Penanda ini tidak boleh dibalik dari FALSE ke TRUE (ditegakkan di aplikasi).
    is_sandbox          BOOLEAN NOT NULL DEFAULT FALSE,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sales_tenant_outlet
    ON sales_transactions(tenant_id, outlet_id, created_at DESC) WHERE NOT is_sandbox;
CREATE INDEX idx_sales_shift ON sales_transactions(tenant_id, shift_id);
CREATE INDEX idx_sales_customer ON sales_transactions(tenant_id, customer_id, created_at DESC)
    WHERE customer_id IS NOT NULL;
CREATE UNIQUE INDEX idx_sales_receipt ON sales_transactions(tenant_id, outlet_id, receipt_number);

CREATE TABLE sales_items (
    id              VARCHAR(26) PRIMARY KEY,
    tenant_id       VARCHAR(26) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    transaction_id  VARCHAR(26) NOT NULL REFERENCES sales_transactions(id) ON DELETE CASCADE,
    variant_id      VARCHAR(26) NOT NULL REFERENCES variants(id),
    -- DECIMAL: 0,25 kg tepung · 30 ml parfum. (MARKET-SEGMENTS §4)
    quantity        DECIMAL(14,3) NOT NULL CHECK (quantity > 0),
    uom             VARCHAR(10) NOT NULL,
    -- Harga & HPP disalin saat transaksi. Laporan TIDAK PERNAH menghitung ulang
    -- memakai harga sekarang — harga saat transaksi adalah harga yang sah.
    unit_price      DECIMAL(14,2) NOT NULL,
    unit_cost       DECIMAL(14,2) NOT NULL DEFAULT 0,
    subtotal        DECIMAL(14,2) NOT NULL
);
CREATE INDEX idx_sales_items_tx ON sales_items(tenant_id, transaction_id);
CREATE INDEX idx_sales_items_variant ON sales_items(tenant_id, variant_id);

CREATE TABLE payments (
    id              VARCHAR(26) PRIMARY KEY,
    tenant_id       VARCHAR(26) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    transaction_id  VARCHAR(26) NOT NULL REFERENCES sales_transactions(id) ON DELETE CASCADE,
    payment_method  VARCHAR(20) NOT NULL
                    CHECK (payment_method IN ('cash','qris','transfer','debit','credit')),
    amount          DECIMAL(14,2) NOT NULL CHECK (amount > 0),
    reference_id    VARCHAR(100),           -- ID settlement QRIS
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_tx ON payments(tenant_id, transaction_id);

CREATE TABLE refunds (
    id              VARCHAR(26) PRIMARY KEY,
    tenant_id       VARCHAR(26) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    transaction_id  VARCHAR(26) NOT NULL REFERENCES sales_transactions(id),
    shift_id        VARCHAR(26) REFERENCES shifts(id),
    refund_type     VARCHAR(20) NOT NULL CHECK (refund_type IN ('full','partial')),
    amount          DECIMAL(14,2) NOT NULL CHECK (amount > 0),
    reason          TEXT NOT NULL,
    approved_by     VARCHAR(26) NOT NULL REFERENCES users(id),   -- wajib PIN manager
    restock         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_refunds_tenant_tx ON refunds(tenant_id, transaction_id);

CREATE TABLE refund_items (
    id              VARCHAR(26) PRIMARY KEY,
    tenant_id       VARCHAR(26) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    refund_id       VARCHAR(26) NOT NULL REFERENCES refunds(id) ON DELETE CASCADE,
    sales_item_id   VARCHAR(26) NOT NULL REFERENCES sales_items(id),
    quantity        DECIMAL(14,3) NOT NULL CHECK (quantity > 0),
    amount          DECIMAL(14,2) NOT NULL
);
CREATE INDEX idx_refund_items ON refund_items(tenant_id, refund_id);

-- +goose Down
DROP TABLE IF EXISTS refund_items;
DROP TABLE IF EXISTS refunds;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS sales_items;
DROP TABLE IF EXISTS sales_transactions;
DROP TABLE IF EXISTS cash_movements;
DROP TABLE IF EXISTS shifts;
