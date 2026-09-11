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
