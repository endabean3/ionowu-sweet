"use client";

import { PinManager } from "@/components/pos/pin-manager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { JaringanError } from "@/lib/auth/api";
import { formatQuantity } from "@/lib/catalog/quantity";
import { METHOD_LABEL, type ReceiptData } from "@/lib/receipt/format";
import {
  type Persetujuan,
  RiwayatError,
  type SaleDetail,
  batalkanTransaksi,
  kirimRefund,
} from "@/lib/sales/api";
import Decimal from "decimal.js";
import { Ban, Printer, Undo2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const rupiah = (v: Decimal.Value) =>
  `Rp ${new Decimal(v).toDecimalPlaces(0).toNumber().toLocaleString("id-ID")}`;

const waktu = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(iso));

type Aksi = "lihat" | "refund" | "void";

/**
 * Nota lama: isi transaksi, cetak ulang, refund, dan void.
 *
 * Refund vs void — dua hal berbeda yang sering tertukar:
 *   - **Refund** = uang dikembalikan untuk barang yang benar-benar sudah
 *     keluar. Selalu boleh, termasuk setelah shift ditutup.
 *   - **Void** = transaksinya dianggap tidak pernah terjadi (salah input).
 *     Hanya selama shift-nya masih terbuka, karena Z-Report yang sudah
 *     dicetak tidak pernah berubah (CLAUDE.md §6 #5).
 */
export function DetailTransaksi({
  detail,
  accessToken,
  role,
  onClose,
  onSelesai,
  onCetak,
  mencetak,
}: {
  detail: SaleDetail;
  accessToken: string | null;
  role?: string;
  onClose: () => void;
  /** Dipanggil setelah refund/void berhasil, supaya daftar dimuat ulang. */
  onSelesai: () => void;
  onCetak: (data: ReceiptData) => void;
  mencetak: boolean;
}) {
  const [aksi, setAksi] = useState<Aksi>("lihat");
  const [alasan, setAlasan] = useState("");
  const [nominal, setNominal] = useState("");
  const [restock, setRestock] = useState(true);
  const [coba, setCoba] = useState(false);
  const [menyimpan, setMenyimpan] = useState(false);

  const { sale, items, payments, refunds } = detail;
  const sudahRefund = new Decimal(sale.refunded_total || 0);
  const sisaRefund = new Decimal(sale.grand_total).minus(sudahRefund);
  const isVoid = sale.payment_status === "void";
  // RBAC-MODEL §"Void transaksi": owner/manager menyetujui sendiri; kasir
  // butuh PIN manager, yang kini bisa dimasukkan langsung di layar ini
  // (sebelumnya kasir harus memanggil pemilik untuk LOGIN, dan transaksi
  // salah menganggur sampai itu terjadi).
  const sendiri = role === "owner" || role === "manager";
  const butuhPin = role === "cashier";
  const bolehUbah = sendiri || butuhPin;
  /** Terisi saat kasir sudah menyerahkan layar ke manager. */
  const [mintaPin, setMintaPin] = useState(false);
  const bisaVoid = bolehUbah && !isVoid && sudahRefund.isZero() && sale.shift_open;
  const bisaRefund = bolehUbah && !isVoid && sisaRefund.gt(0);

  const nota: ReceiptData = {
    transactionId: sale.id,
    occurredAt: sale.sold_at,
    outletName: "",
    cashierName: sale.cashier_name ?? "Kasir",
    lines: items.map((it) => ({
      name: it.variant_name && it.variant_name !== "std" ? `${it.product_name}` : it.product_name,
      quantity: it.quantity,
      unitPrice: it.unit_price,
      discount: "0",
      uom: it.uom,
    })),
    subtotal: sale.subtotal,
    taxTotal: sale.tax_total,
    grandTotal: sale.grand_total,
    method: payments[0]?.payment_method ?? "cash",
    givenAmount: Number(payments[0]?.amount ?? sale.grand_total),
    changeAmount: 0,
    pending: false,
    member: sale.member_code
      ? { code: sale.member_code, name: sale.customer_name ?? undefined, bonuses: [] }
      : null,
  };

  const nominalSah = /^\d{1,12}([.,]\d{1,2})?$/.test(nominal.trim());
  const nominalDec = nominalSah ? new Decimal(nominal.trim().replace(",", ".")) : null;

  /** Isian sudah lengkap? Dipakai sebelum meminta PIN — memanggil manager
   *  untuk sebuah form yang ternyata belum diisi hanya membuang waktunya. */
  const isianSah =
    alasan.trim().length >= 3 &&
    (aksi !== "refund" || (!!nominalDec && nominalDec.gt(0) && nominalDec.lte(sisaRefund)));

  const kirim = () => {
    setCoba(true);
    if (!isianSah) return;
    if (butuhPin) {
      setMintaPin(true);
      return;
    }
    void jalankan();
  };

  const jalankan = async (persetujuan?: Persetujuan) => {
    setCoba(true);
    if (!accessToken || menyimpan) return;
    if (alasan.trim().length < 3) return;
    if (aksi === "refund" && (!nominalDec || nominalDec.lte(0) || nominalDec.gt(sisaRefund)))
      return;
    setMenyimpan(true);
    try {
      if (aksi === "void") {
        await batalkanTransaksi(accessToken, sale.id, alasan.trim(), persetujuan);
        toast.success("Transaksi dibatalkan", { description: `Nota ${sale.receipt_number}` });
      } else {
        const penuh = nominalDec?.equals(sisaRefund) && sudahRefund.isZero();
        await kirimRefund(accessToken, sale.id, {
          shift_id: sale.shift_id ?? undefined,
          refund_type: penuh ? "full" : "partial",
          amount: (nominalDec as Decimal).toString(),
          reason: alasan.trim(),
          restock,
          // Barang kembali ke rak hanya untuk refund PENUH: refund sebagian
          // tidak tahu barang mana yang kembali, dan menebaknya membuat stok
          // salah tanpa jejak.
          items:
            restock && penuh
              ? items.map((it) => ({
                  sales_item_id: it.id,
                  quantity: it.quantity,
                  amount: it.subtotal,
                }))
              : undefined,
          ...persetujuan,
        });
        toast.success("Refund tersimpan", { description: rupiah(nominalDec as Decimal) });
      }
      onSelesai();
      onClose();
    } catch (err) {
      toast.error(
        err instanceof JaringanError
          ? "Tidak bisa menghubungi server. Coba lagi saat online."
          : err instanceof RiwayatError
            ? err.message
            : "Gagal menyimpan",
      );
    } finally {
      setMenyimpan(false);
    }
  };

  return (
    <Modal
      title={`Nota ${sale.receipt_number}`}
      onClose={onClose}
      footer={
        aksi === "lihat" ? (
          <div className="flex gap-2">
            <Button
              size="pos"
              variant="custard"
              className="flex-1 gap-2"
              disabled={mencetak}
              onClick={() => onCetak(nota)}
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
              {mencetak ? "Mencetak…" : "Cetak ulang"}
            </Button>
            {bisaRefund && (
              <Button
                size="pos"
                variant="primary"
                className="flex-1 gap-2"
                onClick={() => {
                  setAksi("refund");
                  setNominal(sisaRefund.toString());
                  setCoba(false);
                }}
              >
                <Undo2 className="h-4 w-4" aria-hidden="true" />
                Refund
              </Button>
            )}
            {bisaVoid && (
              <Button
                size="pos"
                variant="destructive"
                className="gap-2"
                aria-label="Batalkan transaksi (void)"
                onClick={() => {
                  setAksi("void");
                  setCoba(false);
                }}
              >
                <Ban className="h-4 w-4" aria-hidden="true" />
                Void
              </Button>
            )}
          </div>
        ) : (
          <div className="flex gap-2">
            <Button
              size="pos"
              variant="ghost"
              className="border-card-border"
              onClick={() => setAksi("lihat")}
            >
              Batal
            </Button>
            <Button
              size="pos"
              variant={aksi === "void" ? "destructive" : "primary"}
              className="flex-1"
              disabled={menyimpan}
              onClick={kirim}
            >
              {menyimpan
                ? "Menyimpan…"
                : aksi === "void"
                  ? "Ya, batalkan transaksi"
                  : `Refund ${nominalDec ? rupiah(nominalDec) : ""}`}
            </Button>
          </div>
        )
      }
    >
      <div className="flex flex-col gap-4 p-4 sm:p-6">
        <div className="font-sans text-sm text-main">
          <p>{waktu(sale.sold_at)}</p>
          <p>Kasir: {sale.cashier_name ?? "—"}</p>
          {sale.member_code && <p>Member: {sale.member_code}</p>}
          {isVoid && (
            <p className="mt-1 inline-flex rounded-pill border border-card-border bg-sweet-taro px-2 py-0.5 text-xs font-bold">
              Dibatalkan (void)
            </p>
          )}
        </div>

        <ul className="divide-y divide-card-border/40 border-y border-card-border/40">
          {items.map((it) => (
            <li key={it.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
              <span className="min-w-0 text-main">
                {it.product_name}
                <span className="block font-mono text-xs text-muted">
                  {formatQuantity(it.quantity, it.uom)} × {rupiah(it.unit_price)}
                </span>
              </span>
              <span className="shrink-0 font-mono tabular-nums text-main">
                {rupiah(it.subtotal)}
              </span>
            </li>
          ))}
        </ul>

        <div className="font-mono text-sm text-main">
          <p className="flex justify-between font-bold">
            <span>Total</span>
            <span className="tabular-nums">{rupiah(sale.grand_total)}</span>
          </p>
          {payments.map((p) => (
            <p key={p.payment_method} className="flex justify-between text-muted">
              <span>{METHOD_LABEL[p.payment_method] ?? p.payment_method}</span>
              <span className="tabular-nums">{rupiah(p.amount)}</span>
            </p>
          ))}
          {sudahRefund.gt(0) && (
            <p className="flex justify-between font-bold text-red-700">
              <span>Sudah direfund</span>
              <span className="tabular-nums">−{rupiah(sudahRefund)}</span>
            </p>
          )}
        </div>

        {refunds.length > 0 && (
          <ul className="flex flex-col gap-1.5 rounded-2xl border-2 border-card-border bg-surface p-3 font-sans text-xs text-main">
            {refunds.map((r) => (
              <li key={r.id}>
                {waktu(r.created_at)} · {rupiah(r.amount)} ·{" "}
                {r.refund_type === "full" ? "penuh" : "sebagian"} · {r.reason}
                {r.approved_by_name ? ` (disetujui ${r.approved_by_name})` : ""}
              </li>
            ))}
          </ul>
        )}

        {aksi === "refund" && (
          <div className="flex flex-col gap-3 rounded-2xl border-2 border-card-border bg-surface p-3">
            <Input
              label={`Nominal refund (maks. ${rupiah(sisaRefund)})`}
              value={nominal}
              onChange={(e) => setNominal(e.target.value)}
              inputMode="decimal"
              autoComplete="off"
              error={
                coba && (!nominalDec || nominalDec.lte(0) || nominalDec.gt(sisaRefund))
                  ? `Isi nominal antara 1 dan ${rupiah(sisaRefund)}`
                  : undefined
              }
            />
            <label className="flex cursor-pointer items-start gap-3 font-sans text-sm text-main">
              <input
                type="checkbox"
                checked={restock}
                onChange={(e) => setRestock(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-sweet-strawberry"
              />
              <span>
                Barang kembali ke rak
                <span className="block text-xs text-muted">
                  Hanya berlaku untuk refund penuh; refund sebagian tidak mengubah stok.
                </span>
              </span>
            </label>
          </div>
        )}

        {aksi !== "lihat" && (
          <Input
            label={aksi === "void" ? "Alasan pembatalan" : "Alasan refund"}
            value={alasan}
            onChange={(e) => setAlasan(e.target.value)}
            maxLength={500}
            autoComplete="off"
            autoFocus
            placeholder={aksi === "void" ? "Salah input barang" : "Barang bocor"}
            hint={
              aksi === "void"
                ? "Stok barang kembali, dan transaksi tidak dihitung di laporan."
                : undefined
            }
            error={coba && alasan.trim().length < 3 ? "Alasan wajib diisi" : undefined}
          />
        )}

        {aksi === "lihat" && !bolehUbah && (
          <p className="font-sans text-xs text-main">
            Peran ini tidak bisa melakukan refund atau pembatalan.
          </p>
        )}
        {aksi === "lihat" && butuhPin && (
          <p className="font-sans text-xs text-main">
            Refund dan pembatalan butuh PIN manager — manager mengetiknya langsung di layar ini.
          </p>
        )}
        {aksi === "lihat" && bolehUbah && !isVoid && !sale.shift_open && (
          <p className="font-sans text-xs text-main">
            Shift transaksi ini sudah ditutup, jadi tidak bisa di-void. Pakai refund.
          </p>
        )}
      </div>

      {mintaPin && (
        <PinManager
          accessToken={accessToken}
          judul={aksi === "void" ? "Pembatalan butuh PIN manager" : "Refund butuh PIN manager"}
          keterangan={
            aksi === "void"
              ? `Membatalkan nota ${sale.receipt_number} (${rupiah(sale.grand_total)})`
              : `Refund ${nominalDec ? rupiah(nominalDec) : ""} dari nota ${sale.receipt_number}`
          }
          onBatal={() => setMintaPin(false)}
          onSetuju={(p) => {
            setMintaPin(false);
            void jalankan(p);
          }}
        />
      )}
    </Modal>
  );
}
