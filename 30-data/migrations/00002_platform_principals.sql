-- +goose Up
-- ADR-0007: tiga kelas principal. Kelas 1 (platform) & kelas 3 (eksternal).
-- Rujukan: docs/40-security/RBAC-MODEL.md §3, §4, §5, §7

-- ── Kelas 1: Platform ────────────────────────────────────────────────
-- Sengaja TIDAK di tabel users: super admin tidak punya tenant_id, dan
-- menaruhnya di users mengundang kueri yang salah.
CREATE TABLE platform_admins (
    id              VARCHAR(26) PRIMARY KEY,
    email           VARCHAR(255) NOT NULL UNIQUE,
    name            VARCHAR(200) NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    totp_secret     VARCHAR(255) NOT NULL,   -- 2FA wajib: akun paling bernilai di sistem
    role            VARCHAR(20) NOT NULL DEFAULT 'support_agent'
                    CHECK (role IN ('super_admin','support_agent','billing_admin')),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tanpa tabel ini, super admin menjadi pintu belakang permanen yang
-- menggugurkan seluruh janji isolasi tenant. (RBAC-MODEL §3)
CREATE TABLE breakglass_sessions (
    id                  VARCHAR(26) PRIMARY KEY,
    admin_id            VARCHAR(26) NOT NULL REFERENCES platform_admins(id),
    tenant_id           VARCHAR(26) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    reason              TEXT NOT NULL,
    ticket_ref          VARCHAR(100),
    started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at          TIMESTAMPTZ NOT NULL,   -- maks 4 jam, ditegakkan di aplikasi
    ended_at            TIMESTAMPTZ,
    tenant_notified_at  TIMESTAMPTZ,            -- tenant berhak tahu siapa membuka datanya
    CHECK (expires_at > started_at)
);
CREATE INDEX idx_breakglass_active ON breakglass_sessions(tenant_id, expires_at)
    WHERE ended_at IS NULL;

-- ── Kelas 3: Pihak eksternal ─────────────────────────────────────────
-- Identitas LINTAS-tenant, data PER-tenant. Kebalikan dari staf.
CREATE TABLE identities (
    id              VARCHAR(26) PRIMARY KEY,
    email           VARCHAR(255) UNIQUE,
    phone           VARCHAR(30) UNIQUE,
    password_hash   VARCHAR(255),
    verified_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE TABLE distributors (
    id          VARCHAR(26) PRIMARY KEY,
    name        VARCHAR(200) NOT NULL,
    phone       VARCHAR(30),
    email       VARCHAR(255),
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Satu distributor melayani banyak tenant. Ia TIDAK boleh dapat menyimpulkan
-- tenant lain yang dilayaninya — ditegakkan di lapisan kueri.
CREATE TABLE distributor_tenant_links (
    id              VARCHAR(26) PRIMARY KEY,
    distributor_id  VARCHAR(26) NOT NULL REFERENCES distributors(id) ON DELETE CASCADE,
    tenant_id       VARCHAR(26) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    identity_id     VARCHAR(26) REFERENCES identities(id) ON DELETE SET NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_dist_tenant ON distributor_tenant_links(distributor_id, tenant_id);
CREATE INDEX idx_dist_by_tenant ON distributor_tenant_links(tenant_id) WHERE is_active;

-- ── Model izin (RBAC-MODEL §7) ───────────────────────────────────────
-- Peran = preset izin, bukan cabang kode. Tenant kecil pakai preset bawaan;
-- tenant yang tumbuh menyusun peran sendiri tanpa kami merilis versi baru.
CREATE TABLE role_templates (
    id          VARCHAR(26) PRIMARY KEY,
    tenant_id   VARCHAR(26) REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = bawaan sistem
    code        VARCHAR(40) NOT NULL,
    name        VARCHAR(100) NOT NULL,
    permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_system   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_role_template ON role_templates(COALESCE(tenant_id,'SYSTEM'), code);

CREATE TABLE user_permissions (
    id              VARCHAR(26) PRIMARY KEY,
    tenant_id       VARCHAR(26) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id         VARCHAR(26) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission      VARCHAR(60) NOT NULL,
    granted         BOOLEAN NOT NULL,      -- FALSE = cabut izin bawaan peran
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_user_perm ON user_permissions(tenant_id, user_id, permission);

-- +goose Down
DROP TABLE IF EXISTS user_permissions;
DROP TABLE IF EXISTS role_templates;
DROP TABLE IF EXISTS distributor_tenant_links;
DROP TABLE IF EXISTS distributors;
DROP TABLE IF EXISTS identities;
DROP TABLE IF EXISTS breakglass_sessions;
DROP TABLE IF EXISTS platform_admins;
