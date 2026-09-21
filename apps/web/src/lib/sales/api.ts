import { JaringanError } from "@/lib/auth/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

/**
 * Riwayat transaksi, refund, dan void.
 *
 * Semuanya butuh online, dan itu disengaja: riwayat adalah catatan SERVER
 * (transaksi dari perangkat lain ikut terlihat), sedangkan refund dan void
 * mengubah uang serta stok yang dipakai bersama. Menjual tetap offline-first
 * seperti biasa (CLAUDE.md §6.2).
 */

export interface SaleRow {
  id: string;
  receipt_number: string;
  grand_total: string;
  payment_status: "paid" | "void" | "pending";
  sold_at: string;
  customer_id?: string | null;
  member_code?: string | null;
  cashier_name?: string | null;
  refunded_total: string;
  item_count: number;
}

export interface SaleItem {
  id: string;
  variant_id: string;
  product_name: string;
  variant_name: string;
  quantity: string;
  uom: string;
  unit_price: string;
  subtotal: string;
}

export interface SaleDetail {
  sale: SaleRow & {
    subtotal: string;
    discount_total: string;
    tax_total: string;
    outlet_id: string;
    shift_id?: string | null;
    customer_name?: string | null;
    /** Void hanya boleh selama shift transaksi masih terbuka. */
    shift_open: boolean;
  };
  items: SaleItem[];
  payments: { payment_method: string; amount: string }[];
  refunds: {
    id: string;
    refund_type: string;
    amount: string;
    reason: string;
    restock: boolean;
    created_at: string;
    approved_by_name?: string | null;
  }[];
}

export class RiwayatError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function panggil<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...init?.headers,
      },
    });
  } catch {
    throw new JaringanError();
  }
  const b = await res.json().catch(() => null);
  if (!res.ok) {
    throw new RiwayatError(b?.error?.message ?? "Gagal memuat data", b?.error?.code);
  }
  return b?.data as T;
}

export function fetchSales(
  accessToken: string,
  outletId: string,
  opsi: { cari?: string; dari?: string; sampai?: string; limit?: number } = {},
): Promise<SaleRow[]> {
  const q = new URLSearchParams({ outlet_id: outletId });
  if (opsi.cari) q.set("cari", opsi.cari);
  if (opsi.dari) q.set("dari", opsi.dari);
  if (opsi.sampai) q.set("sampai", opsi.sampai);
  if (opsi.limit) q.set("limit", String(opsi.limit));
  return panggil<SaleRow[]>(accessToken, `/sales?${q}`).then((r) => r ?? []);
}

export function fetchSale(accessToken: string, id: string): Promise<SaleDetail> {
  return panggil<SaleDetail>(accessToken, `/sales/${encodeURIComponent(id)}`);
}

/**
 * Owner/manager yang bisa dimintai PIN dari layar kasir (GET /approvers).
 * Isinya sengaja minim — tidak ada email, tidak ada hash PIN.
 */
export interface Approver {
  id: string;
  name: string;
  role: "owner" | "manager";
  /** false = akunnya ada tetapi PIN-nya belum pernah diatur. */
  punya_pin: boolean;
}

export function fetchApprovers(accessToken: string): Promise<Approver[]> {
  return panggil<Approver[]>(accessToken, "/approvers").then((r) => r ?? []);
}

/**
 * Persetujuan manager untuk aksi yang tidak boleh dilakukan kasir sendiri.
 * Kosong bila yang login memang owner/manager — server mengabaikannya.
 */
export interface Persetujuan {
  approver_user_id: string;
  pin: string;
}

/**
 * Mengatur PIN persetujuan MILIK SENDIRI. `pin` kosong = hapus PIN.
 * Password diminta lagi di server, bukan hanya di layar.
 */
export function aturPinSendiri(
  accessToken: string,
  password: string,
  pin: string,
): Promise<{ punya_pin: boolean }> {
  return panggil<{ punya_pin: boolean }>(accessToken, "/me/pin", {
    method: "PATCH",
    body: JSON.stringify({ password, pin }),
  }) as Promise<{ punya_pin: boolean }>;
}

/**
 * Memeriksa PIN manager TANPA mengubah apa pun. Dipakai gerbang diskon
 * besar, yang diputuskan sebelum transaksi ada — jadi tidak ada payload
 * tempat menitipkan PIN seperti pada refund/void.
 */
export function verifikasiPin(accessToken: string, p: Persetujuan): Promise<unknown> {
  return panggil<unknown>(accessToken, "/approvals/verify", {
    method: "POST",
    body: JSON.stringify(p),
  });
}

export interface RefundPayload {
  shift_id?: string;
  refund_type: "full" | "partial";
  /** String desimal rupiah. */
  amount: string;
  reason: string;
  restock: boolean;
  items?: { sales_item_id: string; quantity: string; amount: string }[];
  approver_user_id?: string;
  pin?: string;
}

export function kirimRefund(accessToken: string, id: string, body: RefundPayload) {
  return panggil<unknown>(accessToken, `/sales/${encodeURIComponent(id)}/refund`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function batalkanTransaksi(
  accessToken: string,
  id: string,
  reason: string,
  persetujuan?: Persetujuan,
) {
  return panggil<unknown>(accessToken, `/sales/${encodeURIComponent(id)}/void`, {
    method: "POST",
    body: JSON.stringify({ reason, ...persetujuan }),
  });
}
