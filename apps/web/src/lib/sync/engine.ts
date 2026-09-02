import type { AuthSession } from "../auth/api";
import { db } from "../db";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export async function pullCatalog(accessToken: string, deviceId: string) {
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

    const data = await res.json();

    // Tulis ke Dexie
    await db.transaction("rw", db.products, db.variants, async () => {
      // Upsert products
      if (data.products && data.products.length > 0) {
        // Hapus semua dulu untuk MVP (nanti pakai delta sync)
        await db.products.clear();
        await db.products.bulkAdd(
          data.products.map((p: any) => ({
            id: p.id,
            tenant_id: "tenant", // Harus ambil dari token
            category_id: p.category_id,
            name: p.name,
            is_active: p.is_active,
            updated_at: p.updated_at,
          })),
        );
      }

      // Upsert variants
      if (data.variants && data.variants.length > 0) {
        await db.variants.clear();
        await db.variants.bulkAdd(
          data.variants.map((v: any) => ({
            id: v.id,
            tenant_id: "tenant",
            product_id: v.product_id,
            name: v.name,
            sku: v.sku,
            barcode: v.barcode,
            item_type: v.item_type,
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

export async function pushQueue(accessToken: string, deviceId: string) {
  // Ambil semua item dari queue yang pending atau failed
  const pendingItems = await db.syncQueue.where("status").anyOf(["pending", "failed"]).toArray();

  if (pendingItems.length === 0) return true;

  const payload: any = {
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

    const result = await res.json();

    // Update status di lokal menjadi synced
    if (result.results) {
      await db.transaction("rw", db.syncQueue, async () => {
        for (const resItem of result.results) {
          if (resItem.status === "accepted" || resItem.status === "duplicate") {
            const queueItem = pendingItems.find((q) => q.payload.id === resItem.client_id);
            if (queueItem) {
              await db.syncQueue.update(queueItem.id, {
                status: "synced",
                synced_at: new Date().toISOString(),
              });
            }
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
