# Data Model — Skema Basis Data Lengkap

> **Status:** 🟡 Draft (butuh review Owner Engineering)
> **Versi:** 0.1
> **Dokumen Terkait:** [FDR.md](../10-architecture/FDR.md), [openapi.yaml](../20-api/openapi.yaml), [SECURITY.md](../40-security/SECURITY.md)

---

## 1. Mengapa Dokumen Ini Ada

`FDR.md` §2 mendefinisikan 8 tabel: `tenants`, `outlets`, `users`, `products`, `variants`,
`sales_transactions`, `sales_items`, `payments`. `SECURITY.md` §6 menambahkan `audit_logs`.

Namun `20-api/openapi.yaml` sudah mengekspos **22 endpoint**, dan sebagian besar di antaranya
tidak punya tabel penyangga sama sekali. Dokumen ini menutup celah tersebut agar tim backend
tidak mengarang skema sendiri-sendiri saat implementasi.

### Celah yang Ditemukan (audit 21 Agustus 2026)

| Endpoint / Kebutuhan di API & PRD | Tabel Penyangga di FDR | Status |
|---|---|---|
| `products.category_id` (FDR §2) | *tidak ada `CREATE TABLE categories`* | ❌ FK menggantung |
| `sales_transactions.shift_id` (FDR §2) | *tidak ada `CREATE TABLE shifts`* | ❌ FK menggantung |
| `POST /shifts/open`, `/shifts/{id}/close`, `GET /shifts` | — | ❌ Hilang |
| FR-31 Kas masuk/keluar (*petty cash*) | — | ❌ Hilang |
| `POST /stock/events`, `/stock/opname`, `GET /stock/history/{variantId}` | — | ❌ Hilang |
| `POST /sales/{saleId}/refund` | — | ❌ Hilang |
| `POST /auth/refresh` + revocation (SECURITY §4B) | — | ❌ Hilang |
| `POST /products/import` (FR-13, job asinkron) | — | ❌ Hilang |
| `POST /sync/push` idempotensi (FDR §3B langkah 4) | — | ❌ Hilang |
| Webhook QRIS + anti-replay (SECURITY §5) | — | ❌ Hilang |
| FR-50 / FR-51 notifikasi WhatsApp | — | ❌ Hilang |

---

## 2. Konvensi Wajib

* **Primary key:** `VARCHAR(26)` ULID, dibuat di sisi klien untuk entitas yang bisa lahir offline.
* **Tenant scoping:** setiap tabel transaksional **wajib** punya kolom `tenant_id` dan
  indeks komposit berawalan `(tenant_id, ...)`. Lihat aturan emas di [SECURITY.md](../40-security/SECURITY.md) §2B.
* **Uang:** `DECIMAL(14,2)`. Tidak pernah `FLOAT`.
* **Waktu:** `TIMESTAMP WITH TIME ZONE`, disimpan UTC, dirender `Asia/Jakarta` di klien.
* **Soft delete:** gunakan `is_active BOOLEAN`, bukan `DELETE`, untuk entitas katalog.

---

## 3. Tabel Inti

> ⚠️ **Sumber kebenaran skema kini ada di [`migrations/`](./migrations/)** (22 Agustus 2026).
> Blok SQL di dokumen ini adalah **penjelasan rancangan**, bukan DDL yang dijalankan.
> Bila keduanya berbeda, **berkas migrasi yang benar** — ia yang dieksekusi.
>
> Perbedaan yang disengaja: migrasi sudah memakai `DECIMAL(14,3)` + `uom` + `item_type`
> ([MARKET-SEGMENTS](../00-product/MARKET-SEGMENTS.md) §4), sementara blok di bawah masih
> menampilkan bentuk asli dari FDR agar riwayat keputusannya terbaca.

> Dipindahkan dari `FDR.md` §2 pada 21 Agustus 2026 agar seluruh definisi skema
> berada di satu tempat. FDR kini hanya memuat arsitektur.

Semua tabel transaksional memiliki indeks komposit pada `(tenant_id, ...)` untuk menjamin isolasi data multi-tenant dan kecepatan query sub-milidetik.

```sql
-- 1. Tenants & Outlets
CREATE TABLE tenants (
    id VARCHAR(26) PRIMARY KEY, -- ULID
    name VARCHAR(200) NOT NULL,
    plan_tier VARCHAR(20) DEFAULT 'free', -- free, premium
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE outlets (
    id VARCHAR(26) PRIMARY KEY,
    tenant_id VARCHAR(26) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    address TEXT,
    phone VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_outlets_tenant ON outlets(tenant_id);

-- 2. Users & Roles
CREATE TABLE users (
    id VARCHAR(26) PRIMARY KEY,
    tenant_id VARCHAR(26) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL, -- owner, manager, cashier, warehouse, sales_floor (ADR-0007)
    pin_code VARCHAR(6), -- Quick PIN for cashier shift switch
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_users_tenant_role ON users(tenant_id, role);

-- 3. Products & Variants
CREATE TABLE products (
    id VARCHAR(26) PRIMARY KEY,
    tenant_id VARCHAR(26) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category_id VARCHAR(26),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    image_url VARCHAR(500),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE variants (
    id VARCHAR(26) PRIMARY KEY,
    tenant_id VARCHAR(26) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id VARCHAR(26) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL, -- e.g. "Large / Less Ice"
    sku VARCHAR(100),
    barcode VARCHAR(100),
    price DECIMAL(14, 2) NOT NULL,
    cost_price DECIMAL(14, 2) NOT NULL,
    stock_quantity INT DEFAULT 0,   -- ⚠️ BENTUK LAMA. Migrasi memakai DECIMAL(14,3) + uom + item_type
    min_stock_alert INT DEFAULT 5,    -- ⚠️ BENTUK LAMA. Migrasi: DECIMAL(14,3)
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX idx_variants_barcode ON variants(tenant_id, barcode);

-- 4. Sales Transactions & Payments
CREATE TABLE sales_transactions (
    id VARCHAR(26) PRIMARY KEY, -- Generated via Client ULID (Idempotent)
    tenant_id VARCHAR(26) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    outlet_id VARCHAR(26) NOT NULL REFERENCES outlets(id),
    cashier_id VARCHAR(26) NOT NULL REFERENCES users(id),
    shift_id VARCHAR(26),
    receipt_number VARCHAR(100) NOT NULL,
    subtotal DECIMAL(14, 2) NOT NULL,
    discount_total DECIMAL(14, 2) DEFAULT 0,
    tax_total DECIMAL(14, 2) DEFAULT 0,
    grand_total DECIMAL(14, 2) NOT NULL,
    payment_status VARCHAR(20) NOT NULL, -- paid, void, pending
    offline_created_at TIMESTAMP WITH TIME ZONE,
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_sales_tenant_outlet ON sales_transactions(tenant_id, outlet_id, created_at);

CREATE TABLE sales_items (
    id VARCHAR(26) PRIMARY KEY,
    tenant_id VARCHAR(26) NOT NULL,
    transaction_id VARCHAR(26) NOT NULL REFERENCES sales_transactions(id) ON DELETE CASCADE,
    variant_id VARCHAR(26) NOT NULL REFERENCES variants(id),
    quantity INT NOT NULL,             -- ⚠️ BENTUK LAMA. Migrasi: DECIMAL(14,3) + kolom uom
    unit_price DECIMAL(14, 2) NOT NULL,
    unit_cost DECIMAL(14, 2) NOT NULL,
    subtotal DECIMAL(14, 2) NOT NULL
);

CREATE TABLE payments (
    id VARCHAR(26) PRIMARY KEY,
    tenant_id VARCHAR(26) NOT NULL,
    transaction_id VARCHAR(26) NOT NULL REFERENCES sales_transactions(id) ON DELETE CASCADE,
    payment_method VARCHAR(20) NOT NULL, -- cash, qris, transfer, debit
    amount DECIMAL(14, 2) NOT NULL,
    reference_id VARCHAR(100), -- QRIS settlement ID / Ref Code
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

---

## 4. Tabel Pelengkap

### A. Categories — menutup FK menggantung `products.category_id`

```sql
CREATE TABLE categories (
    id VARCHAR(26) PRIMARY KEY,
    tenant_id VARCHAR(26) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    sort_order INT DEFAULT 0,
    color_token VARCHAR(40),  -- token dari 70-design-system (matcha/custard/strawberry)
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_categories_tenant ON categories(tenant_id, sort_order);

-- Perbaikan pada tabel products (FDR §2):
-- ALTER TABLE products ADD CONSTRAINT fk_products_category
--   FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL;
```

### B. Shifts & Cash Movements — FR-30 s.d. FR-32

```sql
CREATE TABLE shifts (
    id VARCHAR(26) PRIMARY KEY,
    tenant_id VARCHAR(26) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    outlet_id VARCHAR(26) NOT NULL REFERENCES outlets(id),
    cashier_id VARCHAR(26) NOT NULL REFERENCES users(id),
    opened_at TIMESTAMP WITH TIME ZONE NOT NULL,
    closed_at TIMESTAMP WITH TIME ZONE,
    opening_cash DECIMAL(14, 2) NOT NULL,          -- FR-30 saldo awal laci
    expected_cash DECIMAL(14, 2),                  -- dihitung sistem saat tutup
    counted_cash DECIMAL(14, 2),                   -- hasil hitung fisik kasir
    variance DECIMAL(14, 2),                       -- counted - expected (bisa negatif)
    status VARCHAR(20) NOT NULL DEFAULT 'open',    -- open, closed, force_closed
    closed_by VARCHAR(26) REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_shifts_tenant_outlet ON shifts(tenant_id, outlet_id, opened_at DESC);
-- Hanya boleh ada 1 shift terbuka per kasir per outlet:
CREATE UNIQUE INDEX idx_shifts_one_open ON shifts(tenant_id, outlet_id, cashier_id)
    WHERE status = 'open';

CREATE TABLE cash_movements (                      -- FR-31 petty cash
    id VARCHAR(26) PRIMARY KEY,
    tenant_id VARCHAR(26) NOT NULL,
    shift_id VARCHAR(26) NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    direction VARCHAR(10) NOT NULL,                -- in, out
    amount DECIMAL(14, 2) NOT NULL CHECK (amount > 0),
    reason VARCHAR(200) NOT NULL,                  -- "beli es batu darurat"
    actor_user_id VARCHAR(26) NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_cash_movements_shift ON cash_movements(tenant_id, shift_id);
```

> **Keputusan terbuka:** `expected_cash` dihitung dari `opening_cash + Σ(payments tunai) + Σ(cash_movements in) − Σ(cash_movements out)`.
> Perlu dipastikan transaksi offline yang belum sync **tidak** merusak angka ini — lihat §5.

### C. Stock Ledger — `POST /stock/events`, `/stock/opname`, `/stock/history`

Stok saat ini disimpan denormal di `variants.stock_quantity` demi kecepatan POS (<5ms),
tetapi **kebenarannya** berasal dari ledger append-only berikut. Setiap perubahan stok wajib
menulis satu baris di sini.

```sql
CREATE TABLE stock_events (
    id VARCHAR(26) PRIMARY KEY,
    tenant_id VARCHAR(26) NOT NULL,
    outlet_id VARCHAR(26) NOT NULL REFERENCES outlets(id),
    variant_id VARCHAR(26) NOT NULL REFERENCES variants(id),
    event_type VARCHAR(30) NOT NULL,   -- sale, refund, restock, opname_adjust, waste, transfer_in, transfer_out
    quantity_delta INT NOT NULL,       -- negatif untuk pengurangan  ⚠️ BENTUK LAMA → DECIMAL(14,3)
    balance_after INT NOT NULL,        -- snapshot untuk rekonsiliasi cepat
    reference_id VARCHAR(26),          -- sales_transactions.id / stock_opname.id
    actor_user_id VARCHAR(26) REFERENCES users(id),
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_stock_events_variant ON stock_events(tenant_id, variant_id, created_at DESC);

CREATE TABLE stock_opname (
    id VARCHAR(26) PRIMARY KEY,
    tenant_id VARCHAR(26) NOT NULL,
    outlet_id VARCHAR(26) NOT NULL REFERENCES outlets(id),
    status VARCHAR(20) NOT NULL DEFAULT 'draft',  -- draft, submitted, approved
    started_by VARCHAR(26) NOT NULL REFERENCES users(id),
    approved_by VARCHAR(26) REFERENCES users(id),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE stock_opname_items (
    id VARCHAR(26) PRIMARY KEY,
    tenant_id VARCHAR(26) NOT NULL,
    opname_id VARCHAR(26) NOT NULL REFERENCES stock_opname(id) ON DELETE CASCADE,
    variant_id VARCHAR(26) NOT NULL REFERENCES variants(id),
    system_quantity INT NOT NULL,      -- ⚠️ BENTUK LAMA. Migrasi: DECIMAL(14,3)
    counted_quantity INT NOT NULL,     -- ⚠️ BENTUK LAMA. Migrasi: DECIMAL(14,3)
    variance INT GENERATED ALWAYS AS (counted_quantity - system_quantity) STORED
);
```

### D. Refunds — `POST /sales/{saleId}/refund`

```sql
CREATE TABLE refunds (
    id VARCHAR(26) PRIMARY KEY,
    tenant_id VARCHAR(26) NOT NULL,
    transaction_id VARCHAR(26) NOT NULL REFERENCES sales_transactions(id),
    shift_id VARCHAR(26) REFERENCES shifts(id),
    refund_type VARCHAR(20) NOT NULL,   -- full, partial
    amount DECIMAL(14, 2) NOT NULL,
    reason TEXT NOT NULL,
    approved_by VARCHAR(26) NOT NULL REFERENCES users(id),  -- wajib PIN manager (SECURITY §3)
    restock BOOLEAN DEFAULT TRUE,       -- apakah barang kembali ke stok
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_refunds_tenant_tx ON refunds(tenant_id, transaction_id);

CREATE TABLE refund_items (
    id VARCHAR(26) PRIMARY KEY,
    tenant_id VARCHAR(26) NOT NULL,
    refund_id VARCHAR(26) NOT NULL REFERENCES refunds(id) ON DELETE CASCADE,
    sales_item_id VARCHAR(26) NOT NULL REFERENCES sales_items(id),
    quantity INT NOT NULL,            -- ⚠️ BENTUK LAMA. Migrasi: DECIMAL(14,3)
    amount DECIMAL(14, 2) NOT NULL
);
```

### E. Refresh Tokens — SECURITY §4B *Instant Revocation*

```sql
CREATE TABLE refresh_tokens (
    id VARCHAR(26) PRIMARY KEY,
    tenant_id VARCHAR(26) NOT NULL,
    user_id VARCHAR(26) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,   -- SHA-256 dari token, JANGAN simpan plaintext
    device_label VARCHAR(120),          -- "Kasir Depan - Android Tab"
    device_fingerprint VARCHAR(64),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE,
    revoked_reason VARCHAR(50),         -- logout, rotated, device_lost, staff_offboarded
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX idx_refresh_token_hash ON refresh_tokens(token_hash);
CREATE INDEX idx_refresh_user_active ON refresh_tokens(tenant_id, user_id) WHERE revoked_at IS NULL;
```

> **Wajib:** setiap `POST /auth/refresh` melakukan **rotasi** — token lama ditandai
> `revoked_reason = 'rotated'`. Jika token yang sudah di-revoke dipakai lagi, itu indikasi
> pencurian token: revoke **seluruh** sesi user tersebut dan tulis ke `audit_logs`.

### F. Idempotensi Sync — FDR §3B langkah 4

FDR menyatakan Go Engine "memeriksa `id` transaksi (ULID)", tetapi tidak menyebut di mana
hasil pemeriksaan itu disimpan. Mengandalkan `INSERT ... ON CONFLICT` pada `sales_transactions`
saja tidak cukup, karena klien perlu **respons yang identik** saat mengirim ulang batch yang
sama setelah timeout jaringan.

```sql
CREATE TABLE sync_receipts (
    idempotency_key VARCHAR(64) PRIMARY KEY,   -- header Idempotency-Key (API-GUIDELINES §5)
    tenant_id VARCHAR(26) NOT NULL,
    outlet_id VARCHAR(26) NOT NULL,
    device_id VARCHAR(64) NOT NULL,
    request_hash VARCHAR(64) NOT NULL,         -- SHA-256 body; beda hash + key sama = 409
    response_status INT NOT NULL,
    response_body JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL  -- retensi 7 hari, dibersihkan job harian
);
CREATE INDEX idx_sync_receipts_expiry ON sync_receipts(expires_at);

CREATE TABLE device_sync_state (
    id VARCHAR(26) PRIMARY KEY,
    tenant_id VARCHAR(26) NOT NULL,
    outlet_id VARCHAR(26) NOT NULL,
    device_id VARCHAR(64) NOT NULL,
    last_pull_cursor VARCHAR(64),              -- untuk GET /sync/pull inkremental
    last_pull_at TIMESTAMP WITH TIME ZONE,
    last_push_at TIMESTAMP WITH TIME ZONE,
    pending_count INT DEFAULT 0,               -- dilaporkan klien, untuk alerting
    app_version VARCHAR(20)
);
CREATE UNIQUE INDEX idx_device_sync ON device_sync_state(tenant_id, outlet_id, device_id);
```

### G. Webhook Events — SECURITY §5 anti-replay

```sql
CREATE TABLE webhook_events (
    id VARCHAR(26) PRIMARY KEY,
    provider VARCHAR(40) NOT NULL,             -- midtrans, xendit, dll
    external_event_id VARCHAR(120) NOT NULL,
    tenant_id VARCHAR(26),                     -- nullable: diisi setelah payload di-resolve
    transaction_id VARCHAR(26) REFERENCES sales_transactions(id),
    signature_valid BOOLEAN NOT NULL,
    payload JSONB NOT NULL,
    received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE,
    process_status VARCHAR(20) DEFAULT 'pending'  -- pending, processed, rejected_replay, rejected_signature
);
CREATE UNIQUE INDEX idx_webhook_dedup ON webhook_events(provider, external_event_id);
```

### H. Jobs Asinkron — FR-13 impor & FR-50/51 WhatsApp

```sql
CREATE TABLE background_jobs (
    id VARCHAR(26) PRIMARY KEY,
    tenant_id VARCHAR(26) NOT NULL,
    job_type VARCHAR(40) NOT NULL,     -- product_import, wa_restock_order, wa_daily_report, ml_restock_forecast
    status VARCHAR(20) NOT NULL DEFAULT 'queued',  -- queued, running, succeeded, failed, dead_letter
    payload JSONB,
    result JSONB,
    error_message TEXT,
    attempt_count INT DEFAULT 0,
    max_attempts INT DEFAULT 5,
    next_retry_at TIMESTAMP WITH TIME ZONE,
    created_by VARCHAR(26) REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX idx_jobs_pickup ON background_jobs(status, next_retry_at);
CREATE INDEX idx_jobs_tenant ON background_jobs(tenant_id, job_type, created_at DESC);
```

---

## 5. Tabel CRM

> Ditambahkan 21 Agustus 2026 — [ADR-0006](../10-architecture/adr/0006-crm-bi-and-python-service.md).
> Sebelum ini sistem **tidak menyimpan satu pun data pribadi pelanggan**.

### A. Pelanggan

```sql
CREATE TABLE customers (
    id VARCHAR(26) PRIMARY KEY,          -- ULID; dibuat klien agar bisa lahir offline
    tenant_id VARCHAR(26) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(200),
    phone VARCHAR(30),                   -- identitas utama di POS Indonesia
    email VARCHAR(255),
    birth_date DATE,                     -- opsional; promo ulang tahun
    notes TEXT,
    first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
-- Pelanggan dimiliki TENANT, bukan outlet: satu pelanggan bisa belanja di cabang mana pun
CREATE UNIQUE INDEX idx_customers_phone ON customers(tenant_id, phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_customers_tenant ON customers(tenant_id, last_seen_at DESC);

-- Menghubungkan transaksi ke pelanggan (opsional — sebagian besar transaksi anonim)
-- ALTER TABLE sales_transactions ADD COLUMN customer_id VARCHAR(26) REFERENCES customers(id);
-- CREATE INDEX idx_sales_customer ON sales_transactions(tenant_id, customer_id, created_at DESC);
```

> **`customer_id` wajib nullable.** Sebagian besar transaksi UMKM bersifat anonim, dan
> memaksa kasir memasukkan identitas pelanggan akan **melanggar prinsip #1 "kasir tidak boleh
> menunggu"** ([VISION-SCOPE](../00-product/VISION-SCOPE.md) §5). CRM harus menjadi
> percepatan opsional, bukan langkah wajib di jalur checkout.

### B. Persetujuan (*Consent*) — wajib, bukan opsional

```sql
CREATE TABLE customer_consents (
    id VARCHAR(26) PRIMARY KEY,
    tenant_id VARCHAR(26) NOT NULL,
    customer_id VARCHAR(26) NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    consent_type VARCHAR(30) NOT NULL,   -- data_storage, whatsapp_marketing, birthday_promo
    granted BOOLEAN NOT NULL,
    granted_at TIMESTAMP WITH TIME ZONE,
    revoked_at TIMESTAMP WITH TIME ZONE,
    captured_by VARCHAR(26) REFERENCES users(id),
    source VARCHAR(30)                   -- pos_checkout, dashboard, import
);
CREATE INDEX idx_consent_customer ON customer_consents(tenant_id, customer_id, consent_type);
```

**Tanpa `granted = TRUE` pada `whatsapp_marketing`, sistem tidak boleh mengirim pesan
pemasaran ke pelanggan itu.** Ini harus ditegakkan di kode, bukan diserahkan pada kebijakan
tenant — karena kewajibannya melekat pada kita sebagai pemroses data
([COMPLIANCE-ID](../40-security/COMPLIANCE-ID.md)).

### C. Segmentasi & Interaksi

```sql
CREATE TABLE customer_segments (        -- hasil RFM, ditulis worker Python
    id VARCHAR(26) PRIMARY KEY,
    tenant_id VARCHAR(26) NOT NULL,
    customer_id VARCHAR(26) NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    segment VARCHAR(30) NOT NULL,        -- champion, loyal, at_risk, hibernating, new
    recency_days INT,
    frequency_count INT,
    monetary_total DECIMAL(14,2),
    churn_risk VARCHAR(10),              -- low, medium, high
    reasoning TEXT,                      -- kalimat penjelas untuk pemilik
    computed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX idx_segment_current ON customer_segments(tenant_id, customer_id, computed_at DESC);

CREATE TABLE customer_interactions (
    id VARCHAR(26) PRIMARY KEY,
    tenant_id VARCHAR(26) NOT NULL,
    customer_id VARCHAR(26) NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    interaction_type VARCHAR(30) NOT NULL,  -- wa_sent, note, complaint, visit
    channel VARCHAR(20),
    content TEXT,
    actor_user_id VARCHAR(26) REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_interactions ON customer_interactions(tenant_id, customer_id, created_at DESC);
```

### D. ⚠️ Dedup Pelanggan pada Sinkronisasi Offline

Masalah baru yang dibawa CRM, dan tidak punya padanan di transaksi:

```
Perangkat A (offline)  → daftarkan "Budi 0812-3456" → ULID-A
Perangkat B (offline)  → daftarkan "Budi 0812-3456" → ULID-B
Keduanya sync → indeks unik (tenant_id, phone) ditolak untuk salah satunya
```

Berbeda dari transaksi — di mana ULID ganda **tidak boleh** digabung — dua pelanggan dengan
nomor telepon sama **adalah orang yang sama**.

| Aturan | |
|---|---|
| Nomor telepon adalah kunci identitas | ULID hanya kunci teknis |
| ULID kalah → digabung ke ULID menang (yang `first_seen_at` lebih awal) | |
| Seluruh transaksi & interaksi ULID kalah **dipindahkan**, tidak dihapus | |
| Penggabungan dicatat di `audit_logs` | Dapat ditinjau ulang bila salah |
| Pelanggan **tanpa** nomor telepon tidak pernah digabung otomatis | Terlalu berisiko |

Rincian penyelesaian konflik masuk ke
[OFFLINE-SYNC-SPEC](./OFFLINE-SYNC-SPEC.md).

### E. 🔴 Konsekuensi Keamanan yang Baru

Katalog pelanggan akan tersimpan di **IndexedDB perangkat kasir** agar bisa dilayani saat
offline. Artinya:

> **Perangkat kasir yang hilang kini membawa data pribadi pelanggan** — nama, nomor telepon,
> riwayat belanja. Sebelum CRM, perangkat hilang hanya membawa katalog produk dan transaksi
> yang belum tersinkron.

Mitigasi yang wajib diputuskan sebelum implementasi:

- [ ] Batasi jumlah pelanggan yang di-cache di perangkat (mis. hanya yang aktif 90 hari)
- [x] Jangan simpan email & tanggal lahir di perangkat — cukup nama & telepon. **Ditegakkan
      2026-09-19:** `/sync/pull` hanya mengirim nama, WA, kode member, akun media sosial, dan
      tanggal merchandise (`ListCustomersForSync`); galat member tidak pernah memuat nomor WA.
- [ ] Pencabutan perangkat (`refresh_tokens.revoked_reason = 'device_lost'`) harus memicu
      penghapusan data lokal saat perangkat online kembali
- [ ] Tinjau ulang [THREAT-MODEL](../40-security/THREAT-MODEL.md) untuk pelaku "pencuri perangkat"

---

## 5b. Principal & Pihak Eksternal (ADR-0007)

Tabel `platform_admins`, `breakglass_sessions`, `identities`, `customer_links`,
`distributors`, dan `distributor_tenant_links` didefinisikan di
**[40-security/RBAC-MODEL.md](../40-security/RBAC-MODEL.md) §5** — ditaruh di sana karena
alasan keberadaannya bersifat keamanan, bukan pemodelan data.

Yang perlu diketahui dari sisi data:

| Fakta | Konsekuensi |
|---|---|
| `super_admin` **tidak punya `tenant_id`** | Tidak boleh berada di `users`; kueri berbasis `tenant_id` tidak berlaku |
| Identitas pelanggan & distributor **lintas-tenant** | Login global, data tetap per-tenant lewat tabel penghubung |
| Satu distributor melayani banyak tenant | Tidak boleh bisa menyimpulkan tenant lain yang dilayaninya |

---

## 6. Peta Relasi Ringkas

```
tenants ─┬─ outlets ─┬─ shifts ──┬─ cash_movements
         │           │           └─ sales_transactions ─┬─ sales_items ── (variant)
         │           │                                  ├─ payments
         │           │                                  └─ refunds ── refund_items
         │           ├─ stock_events        (ledger append-only)
         │           ├─ stock_opname ── stock_opname_items
         │           └─ device_sync_state
         ├─ users ── refresh_tokens
         ├─ categories ── products ── variants
         ├─ audit_logs                      (append-only, SECURITY §6)
         └─ background_jobs

webhook_events  (lintas-tenant, di-resolve saat diproses)

platform_admins ── breakglass_sessions ──► tenants   (ADR-0007, akses beralasan & berbatas waktu)
identities ─┬─ customer_links ──► customers          (login pelanggan, lintas-tenant)
            └─ distributor_tenant_links ──► tenants  (satu distributor, banyak tenant)
sync_receipts  (kunci idempotensi, retensi 7 hari)
```

---

## 7. Pertanyaan Terbuka (butuh keputusan sebelum implementasi)

1. **Shift vs transaksi offline terlambat.** Kasir menutup shift saat offline, lalu 3 transaksi
   ter-sync 2 jam kemudian. Apakah masuk ke shift yang sudah tertutup (mengubah `variance`
   yang sudah dicetak di Z-Report) atau ke bucket `late_arrivals`? Rekomendasi: **bucket terpisah**,
   karena Z-Report yang sudah dicetak tidak boleh berubah retroaktif.
2. **Stok minus.** FDR §5 menjanjikan *atomic in-memory lock* mencegah stok minus, tetapi transaksi
   offline sudah terjadi secara fisik — barang sudah keluar. Menolak sync akan kehilangan data penjualan.
   Rekomendasi: **selalu terima**, izinkan `balance_after` negatif, dan naikkan alert rekonsiliasi.
3. **Retensi data.** Berapa lama `stock_events` dan `audit_logs` disimpan? Ada implikasi biaya
   dan kewajiban hukum (lihat gap *Compliance* di [DOCS-MAP.md](../DOCS-MAP.md)).
4. **Row Level Security.** Apakah pakai RLS PostgreSQL sebagai jaring pengaman kedua di atas
   `WHERE tenant_id = $1`? Menambah keamanan, tetapi berbiaya latensi — perlu diukur terhadap target <5ms.
