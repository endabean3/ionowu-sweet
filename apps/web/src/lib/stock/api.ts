import { JaringanError } from "@/lib/auth/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

/**
 * Mutasi stok dari layar Stok. Jumlah SELALU positif dan dalam satuan STOK
 * (gram untuk bibit, ADR-0012); arahnya ditentukan `event_type` — "-250" yang
 * salah ketik jadi "250" tidak boleh diam-diam menambah stok.
 *
 * Tidak ada jalur offline di sini, dan itu disengaja: stok adalah angka yang
 * dipakai SEMUA perangkat kasir. Mutasi yang mengantre di satu ponsel membuat
 * dua perangkat memperebutkan angka yang sama sampai antreannya terkirim.
 * Penjualan tetap offline-first seperti biasa (CLAUDE.md §6.2).
 */
export interface MutasiStok {
  outlet_id: string;
  variant_id: string;
  event_type: "restock" | "waste";
  /** String desimal positif, maksimal 3 desimal. */
  quantity: string;
  note?: string;
}

export interface OpnameItem {
  variant_id: string;
  /** Hasil timbang, satuan stok. */
  counted_quantity: string;
}

export class StokError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function kirim<T>(accessToken: string, path: string, body: object): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new JaringanError();
  }
  const b = await res.json().catch(() => null);
  if (!res.ok) {
    throw new StokError(b?.error?.message ?? "Gagal menyimpan stok", b?.error?.code);
  }
  return b as T;
}

/** Stok masuk / barang rusak. Mengembalikan saldo baru dalam satuan stok. */
export function catatMutasiStok(
  accessToken: string,
  m: MutasiStok,
): Promise<{ data: { stock_quantity: string; uom: string } }> {
  return kirim(accessToken, "/stock/events", m);
}

/** Opname: hasil timbang menjadi stok yang berlaku. */
export function kirimOpname(
  accessToken: string,
  outletId: string,
  items: OpnameItem[],
): Promise<{ data: { variant_id: string; system: string; counted: string; variance: string }[] }> {
  return kirim(accessToken, "/stock/opname", { outlet_id: outletId, items });
}

export interface StockEventRow {
  id: string;
  created_at: string;
  event_type: string;
  /** Bertanda: negatif = stok keluar. */
  quantity_delta: string;
  balance_after: string;
  uom: string;
  note?: string | null;
  reference_id?: string | null;
  variant_id: string;
  product_name: string;
  variant_name: string;
  actor_name?: string | null;
}

export interface StockSummaryRow {
  event_type: string;
  uom: string;
  total: string;
  jumlah_baris: number;
}

/** Laporan pergerakan stok (ledger) untuk satu outlet. */
export async function fetchStockEvents(
  accessToken: string,
  outletId: string,
  opsi: { dari?: string; sampai?: string; variantId?: string; limit?: number } = {},
): Promise<{ events: StockEventRow[]; summary: StockSummaryRow[] }> {
  const q = new URLSearchParams({ outlet_id: outletId });
  if (opsi.dari) q.set("dari", opsi.dari);
  if (opsi.sampai) q.set("sampai", opsi.sampai);
  if (opsi.variantId) q.set("variant_id", opsi.variantId);
  if (opsi.limit) q.set("limit", String(opsi.limit));

  let res: Response;
  try {
    res = await fetch(`${API_URL}/stock/events?${q}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new JaringanError();
  }
  const b = await res.json().catch(() => null);
  if (!res.ok)
    throw new StokError(b?.error?.message ?? "Gagal memuat laporan stok", b?.error?.code);
  return { events: b?.data?.events ?? [], summary: b?.data?.summary ?? [] };
}
