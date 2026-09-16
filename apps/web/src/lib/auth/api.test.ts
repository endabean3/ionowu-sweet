import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthDitolakError, JaringanError, apiRefresh } from "./api";

/**
 * Yang diuji di sini bukan HTTP-nya, melainkan **klasifikasi kegagalannya**:
 * mana yang berarti "token perangkat tidak sah" dan mana yang berarti "server
 * sedang tidak terjangkau".
 *
 * Bedanya menentukan apakah kasir bisa berjualan saat internet mati. Sebelum
 * pemisahan ini, keduanya dilempar sebagai Error yang sama dan AuthProvider
 * menghapus refresh token pada dua-duanya — mengunci kasir keluar justru saat
 * offline (lihat catatan di context.tsx).
 */

function stubFetch(impl: () => Promise<Response> | never) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("klasifikasi kegagalan apiFetch", () => {
  it("⭐ server tidak terjangkau → JaringanError, BUKAN penolakan auth", async () => {
    // fetch melempar bila permintaannya tidak pernah sampai (offline, DNS
    // gagal, koneksi ditolak). Kalau baris ini berubah jadi AuthDitolakError,
    // kasir offline akan kehilangan sesinya dan toko berhenti berjualan.
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    const err = await apiRefresh("rt").catch((e) => e);
    expect(err).toBeInstanceOf(JaringanError);
    expect(err).not.toBeInstanceOf(AuthDitolakError);
  });

  it("401 → AuthDitolakError (token memang tidak sah)", async () => {
    stubFetch(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: { message: "refresh token kedaluwarsa" } }), {
          status: 401,
        }),
      ),
    );
    const err = await apiRefresh("rt").catch((e) => e);
    expect(err).toBeInstanceOf(AuthDitolakError);
    expect((err as AuthDitolakError).status).toBe(401);
    expect((err as Error).message).toBe("refresh token kedaluwarsa");
  });

  it("403 → AuthDitolakError", async () => {
    stubFetch(() => Promise.resolve(new Response("{}", { status: 403 })));
    expect(await apiRefresh("rt").catch((e) => e)).toBeInstanceOf(AuthDitolakError);
  });

  it("500 → Error biasa; server rusak bukan bukti token tidak sah", async () => {
    stubFetch(() => Promise.resolve(new Response("{}", { status: 500 })));
    const err = await apiRefresh("rt").catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(AuthDitolakError);
    expect(err).not.toBeInstanceOf(JaringanError);
  });

  it("200 → sesi dikembalikan apa adanya", async () => {
    const sesi = { access_token: "a", refresh_token: "b", expires_in: 900, user: { id: "u" } };
    stubFetch(() => Promise.resolve(new Response(JSON.stringify(sesi), { status: 200 })));
    await expect(apiRefresh("rt")).resolves.toMatchObject({ access_token: "a" });
  });
});
