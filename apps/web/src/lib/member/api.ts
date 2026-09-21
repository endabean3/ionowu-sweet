import { JaringanError } from "@/lib/auth/api";
import type { LocalCustomer } from "@/lib/db";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

/**
 * Daftar member untuk layar /member.
 *
 * Dibaca dari SERVER, bukan Dexie: cermin lokal hanya berisi kolom yang
 * kasir butuhkan saat offline (lib/db/index.ts) dan tidak pernah memuat
 * riwayat belanja. Daftar yang menghitung total belanja dari satu ponsel
 * akan melaporkan angka yang lebih kecil dari yang sebenarnya.
 */
export interface MemberRow {
  id: string;
  name?: string | null;
  phone: string;
  member_code: string;
  social_handle?: string | null;
  follows_store_social: boolean;
  merchandise_given_at?: string | null;
  first_seen_at: string;
  last_seen_at?: string | null;
  jumlah_transaksi: number;
  total_belanja: string;
}

export interface MemberPatch {
  name?: string;
  phone?: string;
  social_handle?: string;
  /** true = tandai merchandise sudah diberikan; false = batalkan. */
  merchandise_given?: boolean;
}

export class MemberError extends Error {
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
    throw new MemberError(b?.error?.message ?? "Gagal menghubungi server", b?.error?.code);
  }
  return b?.data as T;
}

export function fetchMembers(accessToken: string, cari?: string): Promise<MemberRow[]> {
  const q = cari?.trim() ? `?cari=${encodeURIComponent(cari.trim())}` : "";
  return panggil<MemberRow[]>(accessToken, `/members${q}`).then((r) => r ?? []);
}

export function patchMember(accessToken: string, id: string, body: MemberPatch) {
  return panggil<unknown>(accessToken, `/members/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/**
 * Mencari SATU member di server dari kode atau nomor WA.
 *
 * Jembatan untuk member yang mendaftar sendiri lewat QR nota di web toko:
 * ia ada di server, tetapi cermin IndexedDB perangkat kasir baru memuatnya
 * pada /sync/pull berikutnya — dan sync berkala hanya berjalan bila ada
 * antrean lokal (lib/sync/provider.tsx). Tanpa ini, pelanggan yang baru saja
 * mendaftar ditolak di meja kasir.
 *
 * Mengembalikan null bila tidak ketemu; galat jaringan dilempar, supaya
 * pemanggil bisa membedakan "tidak ada" dari "sedang offline".
 */
export async function lookupMember(accessToken: string, q: string): Promise<LocalCustomer | null> {
  try {
    const row = await panggil<{
      id: string;
      name?: string | null;
      phone: string;
      member_code: string;
      social_handle?: string | null;
      merchandise_given_at?: string | null;
    }>(accessToken, `/customers/lookup?q=${encodeURIComponent(q.trim())}`);
    return {
      id: row.id,
      tenant_id: "",
      name: row.name || undefined,
      phone: row.phone,
      member_code: row.member_code,
      social_handle: row.social_handle || undefined,
      merchandise_given_at: row.merchandise_given_at ?? null,
    };
  } catch (err) {
    if (err instanceof MemberError && err.code === "CUSTOMER_NOT_FOUND") return null;
    throw err;
  }
}
