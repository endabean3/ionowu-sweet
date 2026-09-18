"use client";

import { db } from "@/lib/db";
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

  // Kirim antrean BARU secara berkala selama online. Sebelumnya antrean hanya
  // dikirim saat aplikasi dibuka, saat jaringan kembali online, atau saat
  // tombol "Sinkron" ditekan — penjualan dan member dari toko yang terus
  // online tertahan di perangkat sampai aplikasi dibuka ulang, jadi dasbor
  // pemilik dan penanda "merchandise pertama" tertinggal. Hanya item
  // "pending": item "failed" (ditolak server) tidak diulang otomatis tiap
  // 20 detik — ia tetap bisa diulang lewat tombol Sinkron.
  useEffect(() => {
    if (!accessToken) return;
    const t = setInterval(async () => {
      if (!navigator.onLine) return;
      try {
        const baru = await db.syncQueue.where("status").equals("pending").count();
        if (baru > 0) void syncNow();
      } catch {
        // IndexedDB tak terbaca sesaat: coba lagi di putaran berikutnya.
      }
    }, 20_000);
    return () => clearInterval(t);
  }, [accessToken, syncNow]);

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
