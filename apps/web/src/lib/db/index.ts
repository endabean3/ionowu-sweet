import Dexie, { type EntityTable } from "dexie";

export interface LocalCategory {
  id: string;
  tenant_id: string;
  name: string;
  sort_order: number;
  color_token?: string;
}

export interface LocalProduct {
  id: string;
  tenant_id: string;
  category_id: string;
  name: string;
  description?: string;
  is_active: boolean;
  updated_at: string;
}

export interface LocalVariant {
  id: string;
  tenant_id: string;
  product_id: string;
  name: string;
  sku?: string;
  barcode?: string;
  item_type: "single" | "composite" | "weight" | "bulk_liquid";
  uom: string;
  uom_precision: number;
  price: string;
  cost_price?: string;
  stock_quantity: string;
  min_stock_alert: string;
  is_active: boolean;
  /** Satuan tempat stock_quantity dihitung bila berbeda dari uom (ADR-0012):
   *  bibit dijual per ml, stoknya gram. Kosong/undefined = sama dengan uom. */
  stock_uom?: string;
}

export interface LocalCartItem {
  id: string;
  variant_id: string;
  product_name: string;
  variant_name: string;
  unit_price: string;
  quantity: string;
  discount: string;
  barcode?: string;
}

export interface LocalShift {
  id: string;
  tenant_id: string;
  outlet_id: string;
  cashier_id: string;
  opened_at: string;
  opening_cash: string;
  closed_at?: string;
  expected_cash?: string;
  counted_cash?: string;
  status: "open" | "closed";
}

export interface SyncQueueEntry {
  id: string; // ULID
  tenant_id: string;
  outlet_id: string;
  type: "sale" | "shift_open" | "shift_close" | "stock_event";
  payload: Record<string, unknown>;
  status: "pending" | "syncing" | "synced" | "failed";
  retry_count: number;
  created_at: string;
  synced_at?: string;
  error_message?: string;
}

export interface LocalSetting {
  key: string;
  value: string;
}

// Cache lokal dari GET /outlets. Tanpa ini, ShiftModal gagal total saat
// kasir membuka shift dalam kondisi benar-benar offline (pelanggaran
// invarian #2 "kasir tetap bisa berjualan meski internet mati") — dan
// POSHeader tidak punya cara menampilkan nama outlet asli tanpa panggilan
// jaringan setiap render.
export interface LocalOutlet {
  id: string;
  tenant_id: string;
  name: string;
  // Profil toko untuk struk (Pengaturan). Ikut di-cache supaya struk yang
  // dicetak saat OFFLINE tetap memuat alamat, telepon, dan penutupnya.
  // Kolom tak berindeks → tidak perlu menaikkan versi skema Dexie.
  address?: string | null;
  phone?: string | null;
  receipt_footer?: string | null;
}

export class IonowuDB extends Dexie {
  categories!: EntityTable<LocalCategory, "id">;
  products!: EntityTable<LocalProduct, "id">;
  variants!: EntityTable<LocalVariant, "id">;
  cartItems!: EntityTable<LocalCartItem, "id">;
  shifts!: EntityTable<LocalShift, "id">;
  syncQueue!: EntityTable<SyncQueueEntry, "id">;
  settings!: EntityTable<LocalSetting, "key">;
  outlets!: EntityTable<LocalOutlet, "id">;

  constructor() {
    super("ionowu_pos_offline");
    this.version(1).stores({
      categories: "id, tenant_id, sort_order",
      products: "id, tenant_id, category_id, is_active",
      variants: "id, tenant_id, product_id, sku, barcode, is_active",
      cartItems: "id, variant_id",
      shifts: "id, tenant_id, cashier_id, status, opened_at",
      syncQueue: "id, tenant_id, status, created_at, type",
      settings: "key",
    });
    this.version(2).stores({
      outlets: "id, tenant_id",
    });
  }
}

export const db = new IonowuDB();
