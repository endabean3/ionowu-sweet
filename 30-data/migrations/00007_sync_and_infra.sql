-- +goose Up
-- Idempotensi sinkronisasi, webhook, job, outbox, audit.
-- Rujukan: DATA-MODEL §4F–H · EVENT-ARCHITECTURE §5 · SECURITY §6

-- Mengandalkan INSERT ... ON CONFLICT saja tidak cukup: klien butuh RESPONS
-- YANG IDENTIK saat mengirim ulang batch setelah timeout jaringan. Tanpa ini,
-- transaksi yang sudah aman di server tersangkut selamanya di antrean lokal.
CREATE TABLE sync_receipts (
    idempotency_key VARCHAR(64) PRIMARY KEY,
    tenant_id       VARCHAR(26) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    outlet_id       VARCHAR(26) NOT NULL,
    device_id       VARCHAR(64) NOT NULL,
    request_hash    VARCHAR(64) NOT NULL,   -- key sama + hash beda = 409
    response_status INT NOT NULL,
    response_body   JSONB NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ NOT NULL    -- retensi 7 hari (RETENTION §2)
);
CREATE INDEX idx_sync_receipts_expiry ON sync_receipts(expires_at);

CREATE TABLE device_sync_state (
    id                  VARCHAR(26) PRIMARY KEY,
    tenant_id           VARCHAR(26) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    outlet_id           VARCHAR(26) NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    device_id           VARCHAR(64) NOT NULL,
    last_pull_cursor    VARCHAR(64),
    last_pull_at        TIMESTAMPTZ,
    last_push_at        TIMESTAMPTZ,
    pending_count       INT NOT NULL DEFAULT 0,
    -- Peringatan dini sebelum IndexedDB penuh — satu-satunya jalur menuju
    -- "kasir tidak bisa berjualan". (SCALABILITY-RELIABILITY §3)
    storage_used_pct    SMALLINT,
    persistent_storage_granted BOOLEAN,
    app_version         VARCHAR(20)
);
CREATE UNIQUE INDEX idx_device_sync ON device_sync_state(tenant_id, outlet_id, device_id);
CREATE INDEX idx_device_pressure ON device_sync_state(tenant_id, storage_used_pct DESC);

CREATE TABLE webhook_events (
    id                  VARCHAR(26) PRIMARY KEY,
    provider            VARCHAR(40) NOT NULL,
    external_event_id   VARCHAR(120) NOT NULL,
    tenant_id           VARCHAR(26) REFERENCES tenants(id) ON DELETE CASCADE,
    transaction_id      VARCHAR(26) REFERENCES sales_transactions(id),
    signature_valid     BOOLEAN NOT NULL,
    payload             JSONB NOT NULL,
    received_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at        TIMESTAMPTZ,
    process_status      VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (process_status IN ('pending','processed',
                                                  'rejected_replay','rejected_signature'))
);
CREATE UNIQUE INDEX idx_webhook_dedup ON webhook_events(provider, external_event_id);

-- EVENT-ARCHITECTURE §5: Postgres & Redis tidak berbagi transaksi.
-- Outbox menjaga prinsip inti — Redis boleh mati, transaksi tetap tercatat,
-- event menyusul saat Redis kembali.
CREATE TABLE event_outbox (
    id              VARCHAR(26) PRIMARY KEY,
    tenant_id       VARCHAR(26) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    event_type      VARCHAR(60) NOT NULL,
    version         SMALLINT NOT NULL DEFAULT 1,
    payload         JSONB NOT NULL,
    occurred_at     TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at    TIMESTAMPTZ
);
CREATE INDEX idx_outbox_unpublished ON event_outbox(created_at) WHERE published_at IS NULL;

CREATE TABLE background_jobs (
    id              VARCHAR(26) PRIMARY KEY,
    tenant_id       VARCHAR(26) REFERENCES tenants(id) ON DELETE CASCADE,
    job_type        VARCHAR(40) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued','running','succeeded','failed','dead_letter')),
    payload         JSONB,
    result          JSONB,
    error_message   TEXT,
    attempt_count   INT NOT NULL DEFAULT 0,
    max_attempts    INT NOT NULL DEFAULT 5,
    next_retry_at   TIMESTAMPTZ,
    created_by      VARCHAR(26) REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at     TIMESTAMPTZ
);
CREATE INDEX idx_jobs_pickup ON background_jobs(status, next_retry_at);
CREATE INDEX idx_jobs_tenant ON background_jobs(tenant_id, job_type, created_at DESC);
-- Antrean mati tidak boleh senyap. (EVENT-ARCHITECTURE §4 aturan 2)
CREATE INDEX idx_jobs_dead ON background_jobs(created_at DESC) WHERE status = 'dead_letter';

-- SECURITY §6 — append-only. Hak UPDATE/DELETE dicabut di level GRANT,
-- bukan sekadar konvensi. (THREAT-MODEL: Tampering)
CREATE TABLE audit_logs (
    id              VARCHAR(26) PRIMARY KEY,
    tenant_id       VARCHAR(26) NOT NULL,
    outlet_id       VARCHAR(26),
    actor_user_id   VARCHAR(26),
    actor_admin_id  VARCHAR(26),        -- diisi bila pelakunya platform admin (break-glass)
    action_type     VARCHAR(50) NOT NULL,
    reference_id    VARCHAR(100),
    metadata        JSONB,
    ip_address      VARCHAR(45),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (actor_user_id IS NOT NULL OR actor_admin_id IS NOT NULL)
);
CREATE INDEX idx_audit_tenant_action ON audit_logs(tenant_id, action_type, created_at DESC);
CREATE INDEX idx_audit_actor ON audit_logs(tenant_id, actor_user_id, created_at DESC);
-- Tenant berhak melihat setiap akses platform admin ke datanya.
CREATE INDEX idx_audit_admin ON audit_logs(tenant_id, created_at DESC)
    WHERE actor_admin_id IS NOT NULL;

-- +goose Down
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS background_jobs;
DROP TABLE IF EXISTS event_outbox;
DROP TABLE IF EXISTS webhook_events;
DROP TABLE IF EXISTS device_sync_state;
DROP TABLE IF EXISTS sync_receipts;
