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
 * Transaksi offline tidak boleh cuma "diterima" — ia harus benar-benar sampai
 * ke server saat koneksi pulih. Antrean yang tidak pernah terkirim sama saja
 * dengan penjualan yang hilang, dan itu justru lebih buruk daripada menolak
 * transaksi sejak awal karena pemilik tidak pernah tahu ada yang hilang.
 */
test.describe("Sync Recovery", () => {
  let fx: TenantFixture;

  test.beforeEach(async () => {
    fx = await provisionTenant();
  });

  test("Harus menyimpan antrean dan memulihkannya saat kembali online", async ({
    page,
    context,
  }) => {
    await loginViaUI(page, fx);
    await page.goto("/kasir");

    const kartuProduk = page.getByText(fx.productName).first();
    await expect(kartuProduk).toBeVisible({ timeout: 20000 });
    await bukaShiftBilaPerlu(page, "100000");

    await context.setOffline(true);
    await expect(
      page.getByText("Offline · tersimpan").filter({ visible: true }).first(),
    ).toBeVisible();

    await kartuProduk.click();
    await klikBayar(page);
    await expect(page.getByRole("heading", { name: "Pembayaran" })).toBeVisible();
    await pilihTunai(page);
    await page.fill("#given_amount", "50000");
    await page.locator('button:has-text("Selesaikan Pembayaran")').click();

    const badgeAntrean = page
      .getByText(/\d+ transaksi belum terkirim/)
      .filter({ visible: true })
      .first();
    await expect(badgeAntrean).toBeVisible({ timeout: 10000 });

    // Koneksi pulih.
    await context.setOffline(false);
    await expect(page.getByText("Online").filter({ visible: true }).first()).toBeVisible({
      timeout: 15000,
    });

    await page.locator('button:has-text("Sinkron")').filter({ visible: true }).first().click();

    // Antrean habis = transaksi benar-benar mendarat di server.
    await expect(badgeAntrean).toBeHidden({ timeout: 20000 });
  });
});
