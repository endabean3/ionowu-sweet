"use client";

import { type ReactNode, createContext, useCallback, useContext, useEffect, useState } from "react";
import { useAuth } from "../auth/context";
import { pullCatalog, pushQueue } from "./engine";

interface SyncContextValue {
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  syncNow: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const { accessToken } = useAuth();
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const syncNow = useCallback(async () => {
    if (!accessToken || isSyncing) return;

    setIsSyncing(true);
    try {
      // Hardcode device_id sementara (bisa disimpan di localStorage)
      const deviceId = "dev_1234567890";

      // Push lokal ke server dulu
      await pushQueue(accessToken, deviceId);

      // Pull dari server ke lokal
      const pullOk = await pullCatalog(accessToken, deviceId);
      if (pullOk) {
        setLastSyncedAt(new Date());
      }
    } finally {
      setIsSyncing(false);
    }
  }, [accessToken, isSyncing]);

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
