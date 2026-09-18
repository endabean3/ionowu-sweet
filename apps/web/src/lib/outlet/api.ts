import { JaringanError } from "@/lib/auth/api";
import { db } from "@/lib/db";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

/** Bentuk baris dari GET /outlets (store.Outlet, json snake_case). */
export interface OutletRow {
  id: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  receipt_footer?: string | null;
}

export interface OutletProfile {
  name: string;
  address: string;
  phone: string;
  receipt_footer: string;
}

/**
 * Menyimpan daftar outlet ke IndexedDB — SATU tempat, dipakai ShiftModal dan
 * Pengaturan. Profil toko ikut tersimpan supaya struk offline lengkap.
 */
export async function cacheOutlets(tenantId: string, rows: OutletRow[]): Promise<void> {
  if (!tenantId || rows.length === 0) return;
  await db.outlets.bulkPut(
    rows.map((o) => ({
      id: o.id,
      tenant_id: tenantId,
      name: o.name,
      address: o.address ?? null,
      phone: o.phone ?? null,
      receipt_footer: o.receipt_footer ?? null,
    })),
  );
}

export async function fetchOutlets(accessToken: string): Promise<OutletRow[]> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/outlets`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new JaringanError();
  }
  if (!res.ok) throw new Error("Gagal memuat daftar outlet");
  const { data }: { data: OutletRow[] | null } = await res.json();
  return data ?? [];
}

/**
 * PATCH /outlets/{id}. Pesan galat server (403 peran, 422 validasi) sudah
 * berbahasa Indonesia dan ditujukan ke pengguna, jadi diteruskan apa adanya.
 */
export async function patchOutlet(
  accessToken: string,
  id: string,
  profile: OutletProfile,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/outlets/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(profile),
    });
  } catch {
    throw new JaringanError();
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Gagal menyimpan pengaturan toko");
  }
}
