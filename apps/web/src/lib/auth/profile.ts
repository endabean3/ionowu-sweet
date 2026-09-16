/**
 * Identitas terakhir yang berhasil login di perangkat ini.
 *
 * Kenapa perlu disimpan terpisah dari sesi: access token hanya hidup di
 * memori, jadi kasir yang membuka aplikasi saat toko offline punya `user ===
 * null` — padahal ia jelas bukan orang asing. Tanpa catatan ini, kode yang
 * membutuhkan `tenant_id` terpaksa menebak, dan tebakannya menulis data
 * sampah ke perangkat:
 *
 *   - shift dibuat dengan tenant `"tenant_default"` (shift-modal.tsx)
 *   - penjualan masuk antrean dengan `tenant_id: ""` (kasir/page.tsx)
 *   - cache outlet tidak bisa dibaca sama sekali, sehingga fitur "buka shift
 *     saat offline" yang memang dirancang untuk keadaan ini justru mati
 *
 * Isinya BUKAN kredensial — tidak ada token di sini, jadi ia tidak menambah
 * permukaan serangan di luar apa yang sudah ada di IndexedDB perangkat.
 * Dihapus saat logout dan saat server benar-benar menolak sesi.
 */

const PROFIL_KEY = "ionowu_profil";

/** Bentuknya sengaja identik dengan AuthUser, supaya bisa dipakai bergantian. */
export interface ProfilPerangkat {
  id: string;
  tenant_id: string;
  name: string;
  email: string;
  role: "owner" | "manager" | "cashier" | "warehouse" | "sales_floor";
}

export function simpanProfil(profil: ProfilPerangkat): void {
  try {
    localStorage.setItem(PROFIL_KEY, JSON.stringify(profil));
  } catch {
    // Penyimpanan diblokir. Aplikasi tetap jalan selama sesi hidup; yang
    // hilang hanya kemampuan bekerja offline setelah sesi mati.
  }
}

export function profilTerakhir(): ProfilPerangkat | null {
  try {
    const raw = localStorage.getItem(PROFIL_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    // tenant_id adalah alasan berkas ini ada. Tanpa itu, profilnya tidak
    // berguna dan lebih baik dianggap tidak ada daripada dipakai setengah.
    if (typeof p?.tenant_id !== "string" || p.tenant_id === "") return null;
    if (typeof p?.id !== "string" || p.id === "") return null;
    return p as ProfilPerangkat;
  } catch {
    return null;
  }
}

export function hapusProfil(): void {
  try {
    localStorage.removeItem(PROFIL_KEY);
  } catch {
    // Tidak ada yang bisa dilakukan; bukan kegagalan yang perlu dilaporkan.
  }
}
