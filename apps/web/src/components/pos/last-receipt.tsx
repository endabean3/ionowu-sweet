"use client";

import { Button } from "@/components/ui/button";
import { rupiah } from "@/lib/receipt/format";
import type { ReceiptData } from "@/lib/receipt/format";
import { Printer, ReceiptText } from "lucide-react";

/**
 * Struk transaksi terakhir, selalu bisa dicetak ulang sampai transaksi
 * berikutnya dimulai.
 *
 * Menggantikan satu-satunya jalan lama: tombol di dalam toast yang hilang
 * sendiri. Pembeli yang baru minta struk setelah kasir selesai menghitung
 * kembalian tidak lagi mendapat jawaban "maaf, sudah tidak bisa".
 */
export function LastReceipt({
  data,
  printing,
  onPrint,
}: {
  data: ReceiptData;
  printing: boolean;
  onPrint: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <ReceiptText className="h-6 w-6 shrink-0 text-main" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-sans text-xs font-bold text-main">
          Struk #{data.transactionId.slice(-6)}
        </p>
        <p className="truncate font-mono text-lg font-black tabular-nums text-main">
          {rupiah(data.grandTotal)}
        </p>
      </div>
      <Button
        size="pos"
        variant="custard"
        className="shrink-0 gap-2"
        disabled={printing}
        onClick={onPrint}
      >
        <Printer className="h-5 w-5" aria-hidden="true" />
        {printing ? "Mencetak…" : "Cetak"}
      </Button>
    </div>
  );
}
