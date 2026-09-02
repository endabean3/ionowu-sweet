import { ulid } from "ulid";
import { type SyncQueueEntry, db } from "../db";

export interface EnqueueTransactionOptions {
  tenantId: string;
  outletId: string;
  type: SyncQueueEntry["type"];
  payload: Record<string, unknown>;
  customUlid?: string;
}

/**
 * enqueueOfflineAction memasukkan transaksi/aksi kasir ke antrean IndexedDB
 * dengan ULID unik yang di-generate di sisi klien (D-02, OFFLINE-SYNC-SPEC).
 */
export async function enqueueOfflineAction(opts: EnqueueTransactionOptions): Promise<string> {
  const transactionId = opts.customUlid || ulid();

  const entry: SyncQueueEntry = {
    id: transactionId,
    tenant_id: opts.tenantId,
    outlet_id: opts.outletId,
    type: opts.type,
    payload: opts.payload,
    status: "pending",
    retry_count: 0,
    created_at: new Date().toISOString(),
  };

  await db.syncQueue.put(entry);
  return transactionId;
}

/**
 * getPendingQueueCount mengembalikan jumlah item yang belum tersinkronisasi.
 */
export async function getPendingQueueCount(): Promise<number> {
  return await db.syncQueue.where("status").equals("pending").count();
}

/**
 * markSynced menandai transaksi telah diterima oleh server pos-engine.
 */
export async function markSynced(id: string): Promise<void> {
  await db.syncQueue.update(id, {
    status: "synced",
    synced_at: new Date().toISOString(),
  });
}

/**
 * markFailed menandai transaksi gagal sinkronisasi dengan catatan error.
 */
export async function markFailed(id: string, errorMessage: string): Promise<void> {
  const item = await db.syncQueue.get(id);
  if (!item) return;

  await db.syncQueue.update(id, {
    status: item.retry_count > 5 ? "failed" : "pending",
    retry_count: item.retry_count + 1,
    error_message: errorMessage,
  });
}
