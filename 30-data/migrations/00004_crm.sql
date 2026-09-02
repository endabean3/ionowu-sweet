-- +goose Up
-- CRM. Dibuat SEBELUM sales_transactions karena transaksi merujuk pelanggan.
-- Rujukan: 30-data/DATA-MODEL.md §5 · ADR-0006
--
-- ⚠️ Mulai tabel ini sistem menyimpan PII pelanggan. Sebelumnya tidak ada
--    satu pun data pribadi pelanggan — argumen kepatuhan yang kuat, kini hilang.
--    Konsekuensi UU PDP: docs/40-security/COMPLIANCE-ID.md §1b, §1c

CREATE TABLE customers (
    id              VARCHAR(26) PRIMARY KEY,   -- ULID klien: pelanggan bisa didaftarkan offline
    tenant_id       VARCHAR(26) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            VARCHAR(200),
    phone           VARCHAR(30),               -- identitas utama di POS Indonesia
    email           VARCHAR(255),
    birth_date      DATE,
    notes           TEXT,
    first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at    TIMESTAMPTZ,
    merged_into_id  VARCHAR(26) REFERENCES customers(id),  -- hasil dedup sync (DATA-MODEL §5D)
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Pelanggan milik TENANT, bukan outlet: satu orang bisa belanja di cabang mana pun.
CREATE UNIQUE INDEX idx_customers_phone ON customers(tenant_id, phone)
    WHERE phone IS NOT NULL AND merged_into_id IS NULL;
CREATE INDEX idx_customers_tenant ON customers(tenant_id, last_seen_at DESC) WHERE is_active;

-- Login pelanggan (portal, Fase 2). Identitas lintas-tenant, data per-tenant.
CREATE TABLE customer_links (
    id          VARCHAR(26) PRIMARY KEY,
    identity_id VARCHAR(26) NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
    tenant_id   VARCHAR(26) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id VARCHAR(26) NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_customer_link ON customer_links(identity_id, tenant_id);

-- Tanpa granted=TRUE pada whatsapp_marketing, sistem TIDAK BOLEH mengirim
-- pesan pemasaran. Ditegakkan di kode, bukan diserahkan pada kebijakan tenant —
-- kewajibannya melekat pada kita sebagai pemroses data.
CREATE TABLE customer_consents (
    id              VARCHAR(26) PRIMARY KEY,
    tenant_id       VARCHAR(26) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id     VARCHAR(26) NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    consent_type    VARCHAR(30) NOT NULL
                    CHECK (consent_type IN ('data_storage','whatsapp_marketing','birthday_promo')),
    granted         BOOLEAN NOT NULL,
    granted_at      TIMESTAMPTZ,
    revoked_at      TIMESTAMPTZ,
    captured_by     VARCHAR(26) REFERENCES users(id),
    source          VARCHAR(30) CHECK (source IN ('pos_checkout','dashboard','import','portal')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_consent_customer ON customer_consents(tenant_id, customer_id, consent_type);

-- Ditulis worker Python (RFM). SERVICE-BOUNDARIES §4 aturan 3:
-- Python menulis segmen, tidak pernah mengubah data pelanggan.
CREATE TABLE customer_segments (
    id              VARCHAR(26) PRIMARY KEY,
    tenant_id       VARCHAR(26) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id     VARCHAR(26) NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    segment         VARCHAR(30) NOT NULL
                    CHECK (segment IN ('champion','loyal','at_risk','hibernating','new')),
    recency_days    INT,
    frequency_count INT,
    monetary_total  DECIMAL(14,2),
    churn_risk      VARCHAR(10) CHECK (churn_risk IN ('low','medium','high')),
    reasoning       TEXT NOT NULL,   -- kalimat penjelas; skor tanpa alasan tidak dipercaya
    computed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_segment_current
    ON customer_segments(tenant_id, customer_id, computed_at DESC);

CREATE TABLE customer_interactions (
    id                  VARCHAR(26) PRIMARY KEY,
    tenant_id           VARCHAR(26) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id         VARCHAR(26) NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    interaction_type    VARCHAR(30) NOT NULL
                        CHECK (interaction_type IN ('wa_sent','note','complaint','visit')),
    channel             VARCHAR(20),
    content             TEXT,
    actor_user_id       VARCHAR(26) REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_interactions ON customer_interactions(tenant_id, customer_id, created_at DESC);

-- +goose Down
DROP TABLE IF EXISTS customer_interactions;
DROP TABLE IF EXISTS customer_segments;
DROP TABLE IF EXISTS customer_consents;
DROP TABLE IF EXISTS customer_links;
DROP TABLE IF EXISTS customers;
