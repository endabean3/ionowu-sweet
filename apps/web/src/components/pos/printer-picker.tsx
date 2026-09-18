"use client";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { type PairedDevice, listPairedDevices, printerErrorMessage } from "@/lib/printer/bluetooth";
import type { ReceiptPrinter } from "@/lib/printer/use-receipt-printer";
import type { PaperWidth } from "@/lib/receipt/escpos";
import { Check, Printer, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

/**
 * Pengaturan printer termal: printer mana, lebar kertas, cetak otomatis, dan
 * cetak uji — semuanya di satu layar.
 *
 * Hanya muncul di APK. Tidak ada tombol "cetak lewat dialog sistem" sebagai
 * jalan keluar: WebView Android mengabaikan `window.print()`, jadi tombol itu
 * akan terlihat bekerja padahal tidak mencetak apa pun.
 *
 * Sebelumnya layar ini hanya bisa dicapai lewat struk yang gagal dicetak,
 * dan mengubah lebar kertas baru berlaku setelah printer dipilih ulang —
 * kasir yang salah pilih 80 mm pada printer 58 mm tidak punya cara
 * memperbaikinya selain mencetak struk rusak lebih dulu.
 */
export function PrinterPicker({ rp }: { rp: ReceiptPrinter }) {
  const [paper, setPaper] = useState<PaperWidth>(rp.printer?.paper ?? 58);
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

  const gantiKertas = (w: PaperWidth) => {
    setPaper(w);
    // Langsung berlaku pada printer yang sudah dipilih — tidak perlu memilih
    // ulang perangkatnya hanya untuk membetulkan lebar kertas.
    if (rp.printer && rp.printer.paper !== w) rp.pilihPrinter({ ...rp.printer, paper: w });
  };

  return (
    <Modal title="Pengaturan Printer" onClose={rp.tutupPicker}>
      <div className="flex flex-col gap-6 p-6">
        <section aria-labelledby="judul-kertas">
          <h3 id="judul-kertas" className="mb-2 font-sans text-sm font-bold text-main">
            Lebar kertas
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {([58, 80] as const).map((w) => (
              <Button
                key={w}
                size="pos"
                variant={paper === w ? "custard" : "ghost"}
                className={paper === w ? "" : "border-card-border"}
                aria-pressed={paper === w}
                onClick={() => gantiKertas(w)}
              >
                {w} mm
              </Button>
            ))}
          </div>
          <p className="mt-2 font-sans text-xs text-main">
            Tidak yakin? Pilih 58 mm — ukuran printer kecil yang paling umum.
          </p>
        </section>

        <section aria-labelledby="judul-perangkat">
          <div className="mb-2 flex items-center justify-between">
            <h3 id="judul-perangkat" className="font-sans text-sm font-bold text-main">
              Printer Bluetooth
            </h3>
            <Button size="sm" variant="ghost" onClick={() => void muat()} disabled={loading}>
              <RefreshCw
                className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              Muat ulang
            </Button>
          </div>

          {loading && devices === null && (
            <p className="py-6 text-center font-bold text-main">Membaca perangkat Bluetooth…</p>
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
            <ol className="list-decimal space-y-1 rounded-2xl border-2 border-card-border bg-surface p-4 pl-8 font-sans text-sm text-main">
              <li>Nyalakan printer.</li>
              <li>
                Buka <b>Pengaturan → Bluetooth</b> di ponsel ini dan pasangkan printernya (PIN
                biasanya <b>0000</b> atau <b>1234</b>).
              </li>
              <li>
                Kembali ke sini dan ketuk <b>Muat ulang</b>.
              </li>
            </ol>
          )}

          <ul className="flex flex-col gap-2">
            {devices?.map((d) => {
              const dipakai = rp.printer?.address === d.address;
              return (
                <li key={d.address}>
                  <button
                    type="button"
                    aria-pressed={dipakai}
                    onClick={() => rp.pilihPrinter({ ...d, paper })}
                    className={`mochi-button pos-touch-target flex w-full items-center gap-3 rounded-2xl border-2 border-card-border px-4 py-3 text-left shadow-hard-sm ${
                      dipakai ? "bg-sweet-matcha" : "bg-card hover:bg-sweet-custard/40"
                    }`}
                  >
                    <Printer className="h-5 w-5 shrink-0 text-main" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block break-words font-sans font-bold text-main">
                        {d.name}
                      </span>
                      <span className="block font-mono text-xs text-main">{d.address}</span>
                    </span>
                    {dipakai && (
                      <span className="flex shrink-0 items-center gap-1 font-sans text-xs font-bold text-main">
                        <Check className="h-4 w-4" aria-hidden="true" />
                        Dipakai
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="rounded-2xl border-2 border-card-border bg-surface p-4">
          <label className="flex cursor-pointer items-center justify-between gap-4">
            <span>
              <span className="block font-sans text-sm font-bold text-main">
                Cetak struk otomatis
              </span>
              <span className="block font-sans text-xs text-main">
                Struk langsung keluar setiap selesai bayar.
              </span>
            </span>
            <input
              type="checkbox"
              role="switch"
              aria-checked={rp.autoPrint}
              checked={rp.autoPrint}
              onChange={(e) => rp.setAutoPrint(e.target.checked)}
              className="h-7 w-12 shrink-0 cursor-pointer accent-sweet-strawberry"
            />
          </label>
        </section>

        <div className="grid grid-cols-2 gap-3">
          <Button
            size="pos"
            variant="ghost"
            className="border-card-border"
            disabled={!rp.printer || rp.printing}
            onClick={() => rp.printer && void rp.cetakUji(rp.printer)}
          >
            {rp.printing ? "Mencetak…" : "Cetak uji"}
          </Button>
          <Button size="pos" variant="primary" onClick={rp.tutupPicker}>
            Selesai
          </Button>
        </div>
      </div>
    </Modal>
  );
}
