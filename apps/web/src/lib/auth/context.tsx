"use client";

/**
 * AuthProvider dan useAuth hook.
 *
 * Strategi penyimpanan token (SECURITY.md §4B):
 *   - access_token  : disimpan di memori React state saja (tidak di localStorage).
 *                     Hilang saat tab ditutup — otomatis di-refresh saat mount.
 *   - refresh_token : disimpan di localStorage dengan prefix 'ionowu_rt'.
 *                     Trade-off: lebih mudah untuk PWA offline-first tanpa httpOnly cookie
 *                     karena Next.js App Router tidak punya server session saat offline.
 *   - Auto-refresh  : 2 menit sebelum access_token expired, timer di-set untuk refresh.
 */

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { type AuthSession, apiLogin, apiLogout, apiRefresh } from "./api";

const RT_KEY = "ionowu_rt";

interface AuthUser {
  id: string;
  tenant_id: string;
  name: string;
  email: string;
  role: "owner" | "manager" | "cashier" | "warehouse" | "sales_floor";
}

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Simpan sesi baru ke state dan jadwalkan auto-refresh. */
  const applySession = useCallback((session: AuthSession) => {
    setUser(session.user as AuthUser);
    setAccessToken(session.access_token);
    localStorage.setItem(RT_KEY, session.refresh_token);

    // Refresh 2 menit sebelum expired
    const msUntilRefresh = (session.expires_in - 120) * 1000;
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(
      async () => {
        try {
          const newSession = await apiRefresh(session.refresh_token);
          applySession(newSession);
        } catch {
          // Refresh gagal → paksa logout
          clearSession();
        }
      },
      Math.max(msUntilRefresh, 5000),
    );
  }, []);

  /** Bersihkan semua state auth. */
  const clearSession = useCallback(() => {
    setUser(null);
    setAccessToken(null);
    localStorage.removeItem(RT_KEY);
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
  }, []);

  /** Coba restore sesi dari localStorage saat mount. */
  useEffect(() => {
    const storedRefreshToken = localStorage.getItem(RT_KEY);
    if (!storedRefreshToken) {
      setIsLoading(false);
      return;
    }

    apiRefresh(storedRefreshToken)
      .then(applySession)
      .catch(clearSession)
      .finally(() => setIsLoading(false));

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [applySession, clearSession]);

  const login = useCallback(
    async (email: string, password: string) => {
      const session = await apiLogin({ email, password });
      applySession(session);
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    const rt = localStorage.getItem(RT_KEY);
    clearSession();
    if (rt) {
      try {
        await apiLogout(rt);
      } catch {
        // Ignore — token mungkin sudah expired di server
      }
    }
  }, [clearSession]);

  return (
    <AuthContext.Provider value={{ user, accessToken, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

/** Hook untuk menggunakan AuthContext. Throw bila dipakai di luar AuthProvider. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth harus dipakai di dalam <AuthProvider>");
  return ctx;
}
