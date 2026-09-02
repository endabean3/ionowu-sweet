"use client";

import { db } from "@/lib/db";
import { useSync } from "@/lib/sync/provider";
import { Moon, RefreshCw, Sun, Wifi, WifiOff } from "lucide-react";
import React, { useEffect, useState } from "react";

interface HeaderProps {
  outletName?: string;
  cashierName?: string;
}

export function POSHeader({
  outletName = "Kopi Senja — Senopati",
  cashierName = "Sari (Kasir)",
}: HeaderProps) {
  const { isSyncing, syncNow, lastSyncedAt } = useSync();
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isDark, setIsDark] = useState<boolean>(false);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      syncNow();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const interval = setInterval(async () => {
      try {
        const count = await db.syncQueue.where("status").anyOf(["pending", "failed"]).count();
        setPendingCount(count);
      } catch {}
    }, 3000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, [syncNow]);

  const toggleTheme = () => {
    const nextTheme = !isDark;
    setIsDark(nextTheme);
    if (nextTheme) {
      document.documentElement.setAttribute("data-theme", "dark-cocoa");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  };

  return (
    <header className="milky-glass flex flex-wrap items-center justify-between gap-4 rounded-squircle p-4">
      {/* Brand & Outlet */}
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-pill border-2 border-card-border bg-sweet-strawberry text-xl shadow-hard-sm">
          🍓
        </span>
        <div>
          <h1 className="font-display text-lg font-bold tracking-tight text-main">
            ionowu <span className="font-italic text-sweet-strawberry">sweet</span>
          </h1>
          <p className="font-sans text-xs font-semibold text-muted">
            {outletName} • {cashierName}
          </p>
        </div>
      </div>

      {/* Status Badges & Controls */}
      <div className="flex items-center gap-3">
        {/* Sync trigger button */}
        <button
          type="button"
          onClick={() => syncNow()}
          disabled={!isOnline || isSyncing}
          className="rounded-pill border-2 border-card-border bg-white px-3 py-1.5 font-sans text-xs font-bold text-main shadow-hard-sm hover:bg-gray-50 active:translate-y-px disabled:opacity-50"
          title={
            lastSyncedAt
              ? `Terakhir sync: ${lastSyncedAt.toLocaleTimeString()}`
              : "Belum pernah sync"
          }
        >
          {isSyncing ? "Syncing..." : "Sync Now"}
        </button>

        {/* Offline/Online Indicator */}
        <div
          className={`flex items-center gap-2 rounded-pill border-2 border-card-border px-3 py-1.5 font-sans text-xs font-bold shadow-hard-sm ${
            isOnline ? "bg-sweet-matcha text-main" : "bg-sweet-taro text-main"
          }`}
        >
          {isOnline ? (
            <>
              <Wifi className="h-4 w-4" />
              <span>Online</span>
            </>
          ) : (
            <>
              <WifiOff className="h-4 w-4" />
              <span>Offline (Tersimpan Lokal)</span>
            </>
          )}
        </div>

        {/* Sync Queue Badge */}
        {pendingCount > 0 && (
          <div className="flex items-center gap-1.5 rounded-pill border-2 border-card-border bg-sweet-custard px-3 py-1.5 font-mono text-xs font-bold text-main shadow-hard-sm">
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
            <span>{pendingCount} antrean</span>
          </div>
        )}

        {/* Dark/Light Toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Toggle Theme"
          className="flex h-9 w-9 items-center justify-center rounded-pill border-2 border-card-border bg-base text-main shadow-hard-sm transition-transform hover:scale-105"
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>
    </header>
  );
}
