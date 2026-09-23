import { expect, test } from "@playwright/test";
import {
  type TenantFixture,
  bukaShiftBilaPerlu,
  klikBayar,
  loginViaUI,
  pilihTunai,
  provisionTenant,
} from "./helpers";

/**
 * Klaim inti produk: "kasir tetap bisa berjualan meski VPS, Redis, internet,
 * atau gateway mati" (CLAUDE.md §6.2). Sebelum berkas ini benar-benar bisa
 * dijalankan, klaim itu tidak pernah diverifikasi end-to-end sekali pun.
 */
test.describe("Offline Checkout & Sync", () => {
  let fx: TenantFixture;

  test.beforeEach(async () => {
    fx = await provisionTenant();
  });

  test("harus bisa transaksi dalam keadaan offline dan masuk ke queue", async ({
    page,
    context,
  }) => {
    await loginViaUI(page, fx);
    await page.goto("/kasir");

    // Produk baru dibuat lewat API; layar kasir memperolehnya lewat /sync/pull.
    // Ditunggu SELAGI ONLINE — offline-first berarti data yang sudah pernah
    // ditarik tetap ada, bukan bahwa data bisa muncul dari ketiadaan.
    const kartuProduk = page.getByText(fx.productName).first();
    await expect(kartuProduk).toBeVisible({ timeout: 20000 });

    await bukaShiftBilaPerlu(page);

    // Baru sekarang koneksi diputus.
    await context.setOffline(true);
    await expect(
      page.getByText("Offline · tersimpan").filter({ visible: true }).first(),
    ).toBeVisible();

    await kartuProduk.click();

    // Ada dua pemicu: CTA keranjang (desktop) dan bar ringkas (mobile).
    await klikBayar(page);
    await expect(page.getByRole("heading", { name: "Pembayaran" })).toBeVisible();
    await pilihTunai(page);

    // Tunai wajib menyebut uang diterima — tombolnya tetap mati sampai
    // nominalnya menutupi total.
    await page.fill("#given_amount", "50000");

    const tombolBayar = page.locator('button:has-text("Selesaikan Pembayaran")');
    await expect(tombolBayar).toBeEnabled();
    await tombolBayar.click();

    // Inti pengujian: transaksi diterima saat offline dan mendarat di antrean,
    // bukan hilang atau ditolak.
    await expect(
      page
        .getByText(/\d+ transaksi belum terkirim/)
        .filter({ visible: true })
        .first(),
    ).toBeVisible({ timeout: 10000 });
  });
});
