"use client";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import {
  type PairedDevice,
  type SavedPrinter,
  listPairedDevices,
  loadSavedPrinter,
  printerErrorMessage,
  savePrinter,
} from "@/lib/printer/bluetooth";
import type { PaperWidth } from "@/lib/receipt/escpos";
import { Printer, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

/**
 * Memilih printer termal dari perangkat Bluetooth yang SUDAH dipasangkan.
 *
 * Hanya muncul di APK. Tidak ada tombol "cetak lewat dialog sistem" sebagai
 * jalan keluar: WebView Android mengabaikan `window.print()`, jadi tombol itu
 * akan terlihat bekerja padahal tidak mencetak apa pun.
 */
export function PrinterPicker({
  onClose,
  onSelected,
}: {
  onClose: () => void;
  onSelected: (printer: SavedPrinter) => void;
}) {
  const [saved] = useState(loadSavedPrinter);
  const [paper, setPaper] = useState<PaperWidth>(saved?.paper ?? 58);
  const [devices, setDevices] = useState<PairedDevice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const muat = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDevices(await listPairedDevices());
    } catch (err) {
      setDevices(null);
      setError(printerErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void muat();
  }, [muat]);

  const pilih = (device: PairedDevice) => {
    const printer: SavedPrinter = { ...device, paper };
    savePrinter(printer);
    onSelected(printer);
  };

  return (
    <Modal title="Pilih Printer" onClose={onClose}>
      <div className="p-6">
        <p className="mb-2 font-sans text-sm font-bold text-main">Lebar kertas</p>
        <div className="mb-6 grid grid-cols-2 gap-3">
          {([58, 80] as const).map((w) => (
            <Button
              key={w}
              size="pos"
              variant={paper === w ? "custard" : "ghost"}
              className={paper === w ? "" : "border-card-border"}
              onClick={() => setPaper(w)}
            >
              {w} mm
            </Button>
          ))}
        </div>

        <div className="mb-2 flex items-center justify-between">
          <p className="font-sans text-sm font-bold text-main">Perangkat terpasang</p>
          <Button size="sm" variant="ghost" onClick={() => void muat()} disabled={loading}>
            <RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Muat ulang
          </Button>
        </div>

        {loading && devices === null && (
          <p className="py-6 text-center font-bold text-muted">Membaca perangkat Bluetooth…</p>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-2xl border-2 border-card-border bg-[#ffd6d6] p-4 font-sans text-sm font-bold text-main"
          >
            {error}
          </p>
        )}

        {devices?.length === 0 && (
          <p className="rounded-2xl border-2 border-card-border bg-surface p-4 font-sans text-sm text-main">
            Belum ada perangkat yang dipasangkan. Nyalakan printer, pasangkan lewat{" "}
            <b>Pengaturan → Bluetooth</b> di ponsel ini (PIN tertera di manual printer), lalu ketuk{" "}
            <b>Muat ulang</b>.
          </p>
        )}

        <ul className="flex flex-col gap-2">
          {devices?.map((d) => (
            <li key={d.address}>
              <button
                type="button"
                onClick={() => pilih(d)}
                className="mochi-button pos-touch-target flex w-full items-center gap-3 rounded-2xl border-2 border-card-border bg-card px-4 py-3 text-left shadow-hard-sm hover:bg-sweet-custard/40"
              >
                <Printer className="h-5 w-5 shrink-0 text-main" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-sans font-bold text-main">{d.name}</span>
                  <span className="block font-mono text-xs text-muted">{d.address}</span>
                </span>
                {saved?.address === d.address && (
                  <span className="font-sans text-xs font-bold text-main">Dipakai</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
