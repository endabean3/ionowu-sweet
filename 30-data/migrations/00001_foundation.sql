-- +goose Up
-- Fondasi: tenant, outlet, pengguna, sesi.
-- Rujukan: 30-data/DATA-MODEL.md §3 · MULTI-OUTLET.md §3, §5 · RBAC-MODEL.md §2

CREATE TABLE tenants (
    id              VARCHAR(26) PRIMARY KEY,
    name            VARCHAR(200) NOT NULL,
    business_type   VARCHAR(40),          -- template arketipe: bulk, fnb, retail_unit, ...
    plan_tier       VARCHAR(20) NOT NULL DEFAULT 'free'
                    CHECK (plan_tier IN ('free','premium','multi_outlet')),
    plan_status     VARCHAR(20) NOT NULL DEFAULT 'active'
                    CHECK (plan_status IN ('active','grace','past_due','cancelled')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE outlets (
    id                  VARCHAR(26) PRIMARY KEY,
    tenant_id           VARCHAR(26) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name                VARCHAR(200) NOT NULL,
    address             TEXT,
    phone               VARCHAR(50),
    -- Indonesia punya WIB/WITA/WIT. Laporan konsolidasi memakai zona tenant,
    -- laporan per outlet memakai zona lokalnya. (MULTI-OUTLET §5)
    timezone            VARCHAR(40) NOT NULL DEFAULT 'Asia/Jakarta',
    -- Kafe kerap tutup lewat tengah malam. "Hari penjualan" tidak selalu mulai 00:00.
    business_day_start  TIME NOT NULL DEFAULT '00:00',
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_outlets_tenant ON outlets(tenant_id) WHERE is_active;

CREATE TABLE users (
    id              VARCHAR(26) PRIMARY KEY,
    tenant_id       VARCHAR(26) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            VARCHAR(200) NOT NULL,
    email           VARCHAR(255) NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,   -- Argon2id (SECURITY §4A)
    -- ADR-0007: peran staf tenant. super_admin TIDAK di sini (platform_admins, 00002).
    role            VARCHAR(20) NOT NULL
                    CHECK (role IN ('owner','manager','cashier','warehouse','sales_floor')),
    pin_hash        VARCHAR(255),            -- Argon2id, BUKAN PIN polos
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_tenant_role ON users(tenant_id, role) WHERE is_active;

-- MULTI-OUTLET §3: tanpa tabel ini, setiap kasir dapat mengakses SELURUH cabang —
-- bertentangan dengan matriks RBAC. Ini penutup celah keamanan, bukan fitur.
CREATE TABLE user_outlet_assignments (
    id          VARCHAR(26) PRIMARY KEY,
    tenant_id   VARCHAR(26) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id     VARCHAR(26) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    outlet_id   VARCHAR(26) NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    is_primary  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_user_outlet ON user_outlet_assignments(tenant_id, user_id, outlet_id);

-- SECURITY §4B. Postgres adalah sumber kebenaran pencabutan; Redis hanya percepatan.
-- "Tidak ada di Redis" TIDAK berarti "tidak dicabut". (REDIS-STRATEGY §2)
CREATE TABLE refresh_tokens (
    id                  VARCHAR(26) PRIMARY KEY,
    tenant_id           VARCHAR(26) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id             VARCHAR(26) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash          VARCHAR(255) NOT NULL,   -- SHA-256; jangan simpan token polos
    device_label        VARCHAR(120),
    device_fingerprint  VARCHAR(64),
    expires_at          TIMESTAMPTZ NOT NULL,
    revoked_at          TIMESTAMPTZ,
    revoked_reason      VARCHAR(50)
                        CHECK (revoked_reason IN ('logout','rotated','device_lost','staff_offboarded')),
    last_used_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_refresh_token_hash ON refresh_tokens(token_hash);
CREATE INDEX idx_refresh_user_active ON refresh_tokens(tenant_id, user_id) WHERE revoked_at IS NULL;

-- +goose Down
-- Hanya untuk pengembangan lokal. Di produksi berlaku aturan hanya-maju (MIGRATIONS.md §3).
DROP TABLE IF EXISTS refresh_tokens;
DROP TABLE IF EXISTS user_outlet_assignments;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS outlets;
DROP TABLE IF EXISTS tenants;
