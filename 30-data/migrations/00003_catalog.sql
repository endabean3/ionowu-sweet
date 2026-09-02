-- +goose Up
-- Katalog produk dengan PRIMITIF UNIVERSAL untuk 6 arketipe usaha.
-- Rujukan: docs/00-product/MARKET-SEGMENTS.md §4, §4b · MULTI-OUTLET.md §2

CREATE TABLE categories (
    id          VARCHAR(26) PRIMARY KEY,
    tenant_id   VARCHAR(26) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,
    sort_order  INT NOT NULL DEFAULT 0,
    color_token VARCHAR(40),          -- token 70-design-system (matcha/custard/strawberry)
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_categories_tenant ON categories(tenant_id, sort_order) WHERE is_active;

CREATE TABLE products (
    id          VARCHAR(26) PRIMARY KEY,
    tenant_id   VARCHAR(26) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    -- FDR versi awal membiarkan kolom ini menggantung tanpa tabel categories.
    category_id VARCHAR(26) REFERENCES categories(id) ON DELETE SET NULL,
    name        VARCHAR(200) NOT NULL,
    description TEXT,
    image_url   VARCHAR(500),
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_tenant ON products(tenant_id, category_id) WHERE is_active;

-- ═══════════════════════════════════════════════════════════════════
--  variants — inti perbaikan MARKET-SEGMENTS §4
--
--  Skema versi awal memakai stock_quantity INT tanpa kolom satuan.
--  Akibatnya KEDUA pelanggan fix tidak bisa dilayani:
--    · Warung Wangi  — parfum refill, jual per 30/50/100 ml
--    · Media Boga    — bahan kue, jual per gram dari karung 25 kg
--
--  DECIMAL, bukan FLOAT: galat pecahan biner menumpuk dan muncul saat
--  opname sebagai selisih yang tak bisa dijelaskan siapa pun.
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE variants (
    id              VARCHAR(26) PRIMARY KEY,
    tenant_id       VARCHAR(26) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id      VARCHAR(26) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,      -- "Large / Less Ice", "100 ml", "per kg"
    sku             VARCHAR(100),
    barcode         VARCHAR(100),

    -- Primitif universal (MARKET-SEGMENTS §4b): satu kolom yang membuat
    -- keenam arketipe muat tanpa migrasi di kemudian hari.
    item_type       VARCHAR(20) NOT NULL DEFAULT 'stock'
                    CHECK (item_type IN (
                        'stock',       -- barang berstok            (arketipe A, B)
                        'composite',   -- punya resep/BOM           (arketipe C, parfum refill)
                        'service',     -- jasa, tanpa stok          (arketipe E, F)
                        'time_based'   -- dijual per satuan waktu   (arketipe D)
                    )),

    uom             VARCHAR(10) NOT NULL DEFAULT 'pcs',   -- pcs, g, kg, ml, l, jam, menit
    uom_precision   SMALLINT NOT NULL DEFAULT 0
                    CHECK (uom_precision BETWEEN 0 AND 3),

    price           DECIMAL(14,2) NOT NULL CHECK (price >= 0),
    cost_price      DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),

    -- Denormal demi kecepatan POS <5ms. Kebenarannya berasal dari stock_events (00006).
    -- Boleh NEGATIF: transaksi offline sudah terjadi secara fisik, menolaknya
    -- berarti menghapus penjualan nyata. (OFFLINE-SYNC-SPEC §3A)
    stock_quantity  DECIMAL(14,3) NOT NULL DEFAULT 0,
    min_stock_alert DECIMAL(14,3) NOT NULL DEFAULT 0,

    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Jasa & sewa tidak punya stok; menyimpan angka stok untuknya menyesatkan.
    CHECK (item_type IN ('stock','composite') OR stock_quantity = 0)
);
CREATE UNIQUE INDEX idx_variants_barcode ON variants(tenant_id, barcode)
    WHERE barcode IS NOT NULL;
CREATE INDEX idx_variants_product ON variants(tenant_id, product_id) WHERE is_active;
CREATE INDEX idx_variants_low_stock ON variants(tenant_id, stock_quantity)
    WHERE is_active AND item_type IN ('stock','composite');

-- Beli karung 25 kg → jual per 100 gram. Depot air: beli galon → jual per liter.
CREATE TABLE uom_conversions (
    id          VARCHAR(26) PRIMARY KEY,
    tenant_id   VARCHAR(26) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    variant_id  VARCHAR(26) NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
    from_uom    VARCHAR(10) NOT NULL,        -- 'karung'
    to_uom      VARCHAR(10) NOT NULL,        -- 'g'
    factor      DECIMAL(14,4) NOT NULL CHECK (factor > 0),   -- 25000
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_uom_conv ON uom_conversions(tenant_id, variant_id, from_uom, to_uom);

-- BOM ringan. Dibutuhkan arketipe C (warung kopi: 18 g biji + 150 ml susu + 1 cup)
-- dan parfum refill (bibit ml + botol pcs + alkohol ml).
CREATE TABLE bom_components (
    id                  VARCHAR(26) PRIMARY KEY,
    tenant_id           VARCHAR(26) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    parent_variant_id   VARCHAR(26) NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
    component_variant_id VARCHAR(26) NOT NULL REFERENCES variants(id) ON DELETE RESTRICT,
    quantity            DECIMAL(14,3) NOT NULL CHECK (quantity > 0),
    uom                 VARCHAR(10) NOT NULL,
    waste_pct           DECIMAL(5,2) NOT NULL DEFAULT 0 CHECK (waste_pct >= 0),  -- susut
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (parent_variant_id <> component_variant_id)
);
CREATE UNIQUE INDEX idx_bom ON bom_components(tenant_id, parent_variant_id, component_variant_id);

-- MULTI-OUTLET §2: harga dasar di tenant, override opsional per outlet.
-- Bukan harga penuh per outlet — sebagian besar cabang memakai harga yang sama,
-- dan menduplikasinya membuat setiap perubahan harga jadi operasi massal yang rawan.
CREATE TABLE outlet_price_overrides (
    id              VARCHAR(26) PRIMARY KEY,
    tenant_id       VARCHAR(26) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    outlet_id       VARCHAR(26) NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    variant_id      VARCHAR(26) NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
    price           DECIMAL(14,2) NOT NULL CHECK (price >= 0),
    effective_from  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_price_override ON outlet_price_overrides(tenant_id, outlet_id, variant_id);

-- +goose Down
DROP TABLE IF EXISTS outlet_price_overrides;
DROP TABLE IF EXISTS bom_components;
DROP TABLE IF EXISTS uom_conversions;
DROP TABLE IF EXISTS variants;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS categories;
