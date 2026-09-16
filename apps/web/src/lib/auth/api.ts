/**
 * HTTP client untuk endpoint /auth/*.
 * Semua panggilan ke pos-engine menggunakan base URL dari env NEXT_PUBLIC_API_URL.
 *
 * Di dev: http://localhost:8080 (port workspace yang di-expose docker-compose.expose.yml)
 * Di prod: URL Dokploy pos-engine service
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: {
    id: string;
    tenant_id: string;
    name: string;
    email: string;
    role: "owner" | "manager" | "cashier" | "warehouse" | "sales_floor";
  };
}

/**
 * Server BENAR-BENAR menolak kredensialnya (401/403).
 *
 * Hanya kegagalan jenis ini yang boleh membuat sesi dihapus. Membedakannya
 * penting karena kasir offline memakai jalur kode yang sama persis.
 */
export class AuthDitolakError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthDitolakError";
    this.status = status;
  }
}

/**
 * Server tidak terjangkau sama sekali — internet mati, VPS mati, DNS salah.
 *
 * Token perangkat TIDAK boleh dihapus karena ini: ia belum terbukti tidak
 * sah, dan menghapusnya mengunci kasir keluar dari aplikasi yang seharusnya
 * tetap bisa berjualan offline (CLAUDE.md §6.2). Untuk login ulang ia butuh
 * internet — yang justru sedang tidak ada.
 */
export class JaringanError extends Error {
  constructor(message = "Tidak bisa menghubungi server") {
    super(message);
    this.name = "JaringanError";
  }
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    request_id: string;
    timestamp: string;
  };
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      headers: { "Content-Type": "application/json", ...options.headers },
      ...options,
    });
  } catch (err) {
    // fetch hanya melempar bila permintaannya tidak pernah sampai: DNS gagal,
    // koneksi ditolak, perangkat offline. Tidak ada jawaban server sama
    // sekali — jadi tidak ada yang membuktikan kredensialnya salah.
    throw new JaringanError(err instanceof Error ? err.message : undefined);
  }

  if (!res.ok) {
    const err: ApiError = await res.json().catch(() => ({
      error: { code: "NETWORK_ERROR", message: res.statusText, request_id: "", timestamp: "" },
    }));
    const pesan = err.error?.message ?? "Terjadi kesalahan";
    if (res.status === 401 || res.status === 403) {
      throw new AuthDitolakError(pesan, res.status);
    }
    // 5xx: server hidup tapi rusak. Sama seperti jaringan mati, ini BUKAN
    // bukti bahwa token perangkat tidak sah.
    throw new Error(pesan);
  }

  // 204 No Content (logout) tidak punya body
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

/** Daftarkan tenant baru + owner */
export function apiRegister(data: {
  organization_name: string;
  outlet_name?: string;
  owner_name: string;
  owner_email: string;
  owner_password: string;
  /** Slug dari src/lib/business-type. Opsional — kolomnya nullable. */
  business_type?: string;
}): Promise<AuthSession> {
  return apiFetch("/auth/register", { method: "POST", body: JSON.stringify(data) });
}

/** Login dengan email + password */
export function apiLogin(data: {
  email: string;
  password: string;
}): Promise<AuthSession> {
  return apiFetch("/auth/login", { method: "POST", body: JSON.stringify(data) });
}

/** Rotate refresh token → dapat access token baru */
export function apiRefresh(refresh_token: string): Promise<AuthSession> {
  return apiFetch("/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refresh_token }),
  });
}

/** Logout — revoke refresh token */
export function apiLogout(refresh_token: string): Promise<void> {
  return apiFetch("/auth/logout", {
    method: "POST",
    body: JSON.stringify({ refresh_token }),
  });
}
