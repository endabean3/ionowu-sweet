-- +goose Up
-- Modul SOP — pembeda utama produk.
-- Rujukan: docs/00-product/SOP-MODULE.md §5

CREATE TABLE sop_templates (
    id              VARCHAR(26) PRIMARY KEY,
    tenant_id       VARCHAR(26) REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = bawaan sistem
    archetype       VARCHAR(20)
                    CHECK (archetype IN ('retail_unit','bulk','fnb',
                                         'time_service','job_service','hybrid')),
    code            VARCHAR(50) NOT NULL,
    name            VARCHAR(200) NOT NULL,
    trigger_type    VARCHAR(30) NOT NULL
                    CHECK (trigger_type IN ('shift_open','shift_close','stock_alert',
                                            'goods_received','schedule','manual')),
    schedule_cron   VARCHAR(50),
    required_role   VARCHAR(20),
    -- Dipakai SANGAT hemat: SOP yang menghalangi kasir saat antrean mengular
    -- akan dimatikan tenant pada hari kedua. (SOP-MODULE §5)
    is_blocking     BOOLEAN NOT NULL DEFAULT FALSE,
    steps           JSONB NOT NULL,   -- [{text, requires_photo, requires_input, input_type}]
    is_system       BOOLEAN NOT NULL DEFAULT FALSE,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_sop_template ON sop_templates(COALESCE(tenant_id,'SYSTEM'), code);
CREATE INDEX idx_sop_trigger ON sop_templates(tenant_id, trigger_type) WHERE is_active;

CREATE TABLE sop_executions (
    id              VARCHAR(26) PRIMARY KEY,
    tenant_id       VARCHAR(26) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    outlet_id       VARCHAR(26) NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    sop_template_id VARCHAR(26) NOT NULL REFERENCES sop_templates(id),
    shift_id        VARCHAR(26) REFERENCES shifts(id),
    actor_user_id   VARCHAR(26) NOT NULL REFERENCES users(id),
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','in_progress','completed','skipped')),
    -- 'skipped' adalah status SAH. Melarang melewati langkah membuat karyawan
    -- mengisi asal-asalan — dan data palsu lebih buruk daripada data kosong.
    -- Pola melewati justru menjadi informasi berharga bagi pemilik.
    skip_reason     TEXT,
    results         JSONB,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (status <> 'skipped' OR skip_reason IS NOT NULL)
);
CREATE INDEX idx_sop_exec ON sop_executions(tenant_id, outlet_id, completed_at DESC);
CREATE INDEX idx_sop_exec_pending ON sop_executions(tenant_id, outlet_id)
    WHERE status IN ('pending','in_progress');

-- +goose Down
DROP TABLE IF EXISTS sop_executions;
DROP TABLE IF EXISTS sop_templates;
