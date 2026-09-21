import { JaringanError } from "@/lib/auth/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

/**
 * Karyawan satu tenant.
 *
 * Sampai endpoint ini ada, satu-satunya cara membuat user adalah mendaftar
 * TENANT BARU — jadi setiap toko di produksi hanya punya akun owner, dan
 * peran "kasir" yang dipakai di seluruh aturan RBAC tidak pernah benar-benar
 * ada. Tanpa layar ini, PIN persetujuan kasir juga tidak akan pernah terpakai.
 */
export interface Karyawan {
  id: string;
  name: string;
  email: string;
  role: "owner" | "manager" | "cashier" | "warehouse" | "sales_floor";
  is_active: boolean;
  punya_pin: boolean;
}

export const PERAN_KARYAWAN = [
  { nilai: "cashier", label: "Kasir" },
  { nilai: "manager", label: "Manager" },
  { nilai: "warehouse", label: "Gudang" },
  { nilai: "sales_floor", label: "Pramuniaga" },
] as const;

export class KaryawanError extends Error {
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
    throw new KaryawanError(b?.error?.message ?? "Gagal menghubungi server", b?.error?.code);
  }
  return b?.data as T;
}

export function fetchKaryawan(accessToken: string): Promise<Karyawan[]> {
  return panggil<Karyawan[]>(accessToken, "/users").then((r) => r ?? []);
}

export function tambahKaryawan(
  accessToken: string,
  body: { name: string; email: string; password: string; role: string },
): Promise<Karyawan> {
  return panggil<Karyawan>(accessToken, "/users", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Karyawan yang berhenti DINONAKTIFKAN, tidak dihapus — transaksi dan
 *  ledger stok yang ia catat tetap merujuk namanya. */
export function setAktifKaryawan(accessToken: string, id: string, isActive: boolean) {
  return panggil<unknown>(accessToken, `/users/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ is_active: isActive }),
  });
}
