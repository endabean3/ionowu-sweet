import { db } from "../db";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

// Bentuk PERSIS respons Go (services/pos-engine/internal/httpapi/sync.go
// syncProduct/syncVariant) — products dan variants adalah dua larik
// TERPISAH, bukan satu larik variant dengan nama produk ikut nempel.
interface SyncPullProduct {
  id: string;
  category_id: string;
  name: string;
  is_active: boolean;
  updated_at: string;
}

interface SyncPullVariant {
  id: string;
  product_id: string;
  name: string;
  sku?: string;
  barcode?: string;
  item_type: string;
  uom: string;
  uom_precision: number;
  price: string;
  stock_quantity: string;
  min_stock_alert: string;
  is_active: boolean;
}

interface SyncPullResponse {
  products: SyncPullProduct[];
  variants: SyncPullVariant[];
}

export async function pullCatalog(accessToken: string, deviceId: string, tenantId: string) {
  try {
    const res = await fetch(`${API_URL}/sync/pull`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ device_id: deviceId }),
    });

    if (!res.ok) {
      throw new Error("Gagal pull katalog dari server");
    }

    const data: SyncPullResponse = await res.json();

    // Tulis ke Dexie. `tenant_id` diambil dari sesi login (bukan
    // dihardcode) — field ini terindeks di skema Dexie (lihat db/index.ts)
    // dan dipakai memfilter data lokal per tenant. Nilai hardcode
    // sebelumnya membuat filter itu tidak berarti apa-apa.
    await db.transaction("rw", db.products, db.variants, async () => {
      if (data.products && data.products.length > 0) {
        await db.products.clear();
        await db.products.bulkAdd(
          data.products.map((p) => ({
            id: p.id,
            tenant_id: tenantId,
            category_id: p.category_id,
            name: p.name,
            is_active: p.is_active,
            updated_at: p.updated_at,
          })),
        );
      }

      if (data.variants && data.variants.length > 0) {
        await db.variants.clear();
        await db.variants.bulkAdd(
          data.variants.map((v) => ({
            id: v.id,
            tenant_id: tenantId,
            product_id: v.product_id,
            name: v.name,
            sku: v.sku,
            barcode: v.barcode,
            item_type: v.item_type as "single" | "composite" | "weight" | "bulk_liquid",
            uom: v.uom,
            uom_precision: v.uom_precision,
            price: v.price,
            stock_quantity: v.stock_quantity,
            min_stock_alert: v.min_stock_alert,
            is_active: v.is_active,
          })),
        );
      }
    });

    return true;
  } catch (error) {
    console.error("Sync pull error:", error);
    return false;
  }
}

interface SyncPushResult {
  client_id: string;
  status: "accepted" | "duplicate" | "rejected";
  detail?: string;
}

interface SyncPushResponse {
  results?: SyncPushResult[];
}

interface SyncPushPayload {
  device_id: string;
  shifts_open: Record<string, unknown>[];
  sales: Record<string, unknown>[];
  stock_events: Record<string, unknown>[];
  shifts_close: Record<string, unknown>[];
}

export async function pushQueue(accessToken: string, deviceId: string) {
  // Ambil semua item dari queue yang pending atau failed
  const pendingItems = await db.syncQueue.where("status").anyOf(["pending", "failed"]).toArray();

  if (pendingItems.length === 0) return true;

  const payload: SyncPushPayload = {
    device_id: deviceId,
    shifts_open: [],
    sales: [],
    stock_events: [],
    shifts_close: [],
  };

  for (const item of pendingItems) {
    if (item.type === "shift_open") payload.shifts_open.push(item.payload);
    else if (item.type === "sale") payload.sales.push(item.payload);
    else if (item.type === "stock_event") payload.stock_events.push(item.payload);
    else if (item.type === "shift_close") payload.shifts_close.push(item.payload);
  }

  try {
    const res = await fetch(`${API_URL}/sync/push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error("Gagal push data ke server");
    }

    const result: SyncPushResponse = await res.json();

    // Update status di lokal. SEBELUMNYA hanya menangani "accepted"/"duplicate"
    // — status "rejected" diam-diam diabaikan, item tertahan selamanya di
    // antrean "pending" tanpa pesan apa pun ke kasir. Ditemukan lewat replay
    // payload manual yang mengungkap FOREIGN KEY VIOLATION di server padahal
    // klien tidak pernah tahu ada yang salah.
    const pushResults = result.results;
    if (pushResults) {
      await db.transaction("rw", db.syncQueue, async () => {
        for (const resItem of pushResults) {
          const queueItem = pendingItems.find((q) => q.payload.id === resItem.client_id);
          if (!queueItem) continue;

          if (resItem.status === "accepted" || resItem.status === "duplicate") {
            await db.syncQueue.update(queueItem.id, {
              status: "synced",
              synced_at: new Date().toISOString(),
            });
          } else {
            await db.syncQueue.update(queueItem.id, {
              status: "failed",
              retry_count: queueItem.retry_count + 1,
              error_message: resItem.detail || "Ditolak server tanpa keterangan",
            });
          }
        }
      });
    }

    return true;
  } catch (error) {
    console.error("Sync push error:", error);
    return false;
  }
}
