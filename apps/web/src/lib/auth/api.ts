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

export interface ApiError {
  error: {
    code: string;
    message: string;
    request_id: string;
    timestamp: string;
  };
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });

  if (!res.ok) {
    const err: ApiError = await res.json().catch(() => ({
      error: { code: "NETWORK_ERROR", message: res.statusText, request_id: "", timestamp: "" },
    }));
    throw new Error(err.error?.message ?? "Terjadi kesalahan");
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
}): Promise<AuthSession> {
  return apiFetch("/auth/register", { method: "POST", body: JSON.stringify(data) });
}

/** Login dengan email + password */
export function apiLogin(data: {
  tenant_id: string;
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
