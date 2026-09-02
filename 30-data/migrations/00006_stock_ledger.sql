-- +goose Up
-- Ledger stok append-only. variants.stock_quantity adalah cache;
-- KEBENARANNYA ada di sini. (DATA-MODEL §4C)

CREATE TABLE stock_events (
    id              VARCHAR(26) PRIMARY KEY,
    tenant_id       VARCHAR(26) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    outlet_id       VARCHAR(26) NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    variant_id      VARCHAR(26) NOT NULL REFERENCES variants(id),
    event_type      VARCHAR(30) NOT NULL
                    CHECK (event_type IN ('sale','refund','restock','opname_adjust',
                                          'waste','transfer_in','transfer_out','repack_in','repack_out')),
    quantity_delta  DECIMAL(14,3) NOT NULL,   -- negatif untuk pengurangan
    -- Snapshot untuk rekonsiliasi cepat. BOLEH NEGATIF: barang offline sudah keluar
    -- secara fisik; menolak sync berarti menghapus penjualan nyata.
    balance_after   DECIMAL(14,3) NOT NULL,
    uom             VARCHAR(10) NOT NULL,
    reference_id    VARCHAR(26),              -- sales_transactions.id / stock_opname.id
    actor_user_id   VARCHAR(26) REFERENCES users(id),
    note            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_stock_events_variant
    ON stock_events(tenant_id, variant_id, created_at DESC);
CREATE INDEX idx_stock_events_outlet
    ON stock_events(tenant_id, outlet_id, created_at DESC);
-- Stok minus adalah INFORMASI, bukan kerusakan: ia menunjukkan tempat yang perlu opname.
CREATE INDEX idx_stock_negative ON stock_events(tenant_id, outlet_id, variant_id)
    WHERE balance_after < 0;

CREATE TABLE stock_opname (
    id          VARCHAR(26) PRIMARY KEY,
    tenant_id   VARCHAR(26) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    outlet_id   VARCHAR(26) NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    status      VARCHAR(20) NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','submitted','approved')),
    started_by  VARCHAR(26) NOT NULL REFERENCES users(id),
    approved_by VARCHAR(26) REFERENCES users(id),
    started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    approved_at TIMESTAMPTZ
);
CREATE INDEX idx_opname_outlet ON stock_opname(tenant_id, outlet_id, started_at DESC);

CREATE TABLE stock_opname_items (
    id                  VARCHAR(26) PRIMARY KEY,
    tenant_id           VARCHAR(26) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    opname_id           VARCHAR(26) NOT NULL REFERENCES stock_opname(id) ON DELETE CASCADE,
    variant_id          VARCHAR(26) NOT NULL REFERENCES variants(id),
    system_quantity     DECIMAL(14,3) NOT NULL,
    counted_quantity    DECIMAL(14,3) NOT NULL,
    variance            DECIMAL(14,3) GENERATED ALWAYS AS (counted_quantity - system_quantity) STORED
);
CREATE INDEX idx_opname_items ON stock_opname_items(tenant_id, opname_id);

-- Transfer antar-outlet: stok "dalam perjalanan" tidak dihitung di kedua sisi.
CREATE TABLE stock_transfers (
    id              VARCHAR(26) PRIMARY KEY,
    tenant_id       VARCHAR(26) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    from_outlet_id  VARCHAR(26) NOT NULL REFERENCES outlets(id),
    to_outlet_id    VARCHAR(26) NOT NULL REFERENCES outlets(id),
    status          VARCHAR(20) NOT NULL DEFAULT 'in_transit'
                    CHECK (status IN ('in_transit','received','cancelled')),
    sent_by         VARCHAR(26) NOT NULL REFERENCES users(id),
    received_by     VARCHAR(26) REFERENCES users(id),
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    received_at     TIMESTAMPTZ,
    CHECK (from_outlet_id <> to_outlet_id)
);
CREATE INDEX idx_transfers ON stock_transfers(tenant_id, status, sent_at DESC);

CREATE TABLE stock_transfer_items (
    id                  VARCHAR(26) PRIMARY KEY,
    tenant_id           VARCHAR(26) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    transfer_id         VARCHAR(26) NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
    variant_id          VARCHAR(26) NOT NULL REFERENCES variants(id),
    quantity_sent       DECIMAL(14,3) NOT NULL CHECK (quantity_sent > 0),
    -- Boleh berbeda dari yang dikirim; selisihnya menjadi peristiwa waste/loss beralasan.
    quantity_received   DECIMAL(14,3),
    uom                 VARCHAR(10) NOT NULL
);
CREATE INDEX idx_transfer_items ON stock_transfer_items(tenant_id, transfer_id);

-- +goose Down
DROP TABLE IF EXISTS stock_transfer_items;
DROP TABLE IF EXISTS stock_transfers;
DROP TABLE IF EXISTS stock_opname_items;
DROP TABLE IF EXISTS stock_opname;
DROP TABLE IF EXISTS stock_events;
