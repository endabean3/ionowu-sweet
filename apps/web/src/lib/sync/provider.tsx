"use client";

import { type ReactNode, createContext, useCallback, useContext, useEffect, useState } from "react";
import { useAuth } from "../auth/context";
import { pullCatalog, pushQueue } from "./engine";

const DEVICE_ID_KEY = "ionowu_device_id";

/** Device ID persisten per-perangkat, dibuat sekali dan disimpan di
 * localStorage. Nilai literal sebelumnya ("dev_1234567890") sama untuk
 * SEMUA perangkat kasir — server tidak bisa membedakan satu kasir dari
 * yang lain lewat device_sync_state (OBSERVABILITY §3), dan idempotensi
 * sync per-device jadi tidak berarti. */
function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = `dev_${crypto.randomUUID()}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

interface SyncContextValue {
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  syncNow: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const { accessToken, user } = useAuth();
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const syncNow = useCallback(async () => {
    if (!accessToken || !user || isSyncing) return;

    setIsSyncing(true);
    try {
      const deviceId = getOrCreateDeviceId();

      // Push lokal ke server dulu
      await pushQueue(accessToken, deviceId);

      // Pull dari server ke lokal
      const pullOk = await pullCatalog(accessToken, deviceId, user.tenant_id);
      if (pullOk) {
        setLastSyncedAt(new Date());
      }
    } finally {
      setIsSyncing(false);
    }
  }, [accessToken, user, isSyncing]);

  // Auto sync saat pertama kali load dan ada token (online)
  useEffect(() => {
    if (accessToken && !lastSyncedAt) {
      syncNow();
    }
  }, [accessToken, lastSyncedAt, syncNow]);

  return (
    <SyncContext.Provider value={{ isSyncing, lastSyncedAt, syncNow }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSync harus dipakai di dalam <SyncProvider>");
  return ctx;
}
