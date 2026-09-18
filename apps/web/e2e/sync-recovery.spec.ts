import { expect, test } from "@playwright/test";
import { type TenantFixture, bukaShiftBilaPerlu, loginViaUI, provisionTenant } from "./helpers";

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
    await expect(page.getByText("Offline · tersimpan")).toBeVisible();

    await kartuProduk.click();
    await page.locator('button:has-text("Bayar Sekarang")').first().click();
    await expect(page.getByRole("heading", { name: "Pembayaran" })).toBeVisible();
    await page.click("text=Tunai");
    await page.fill("#given_amount", "50000");
    await page.locator('button:has-text("Selesaikan Pembayaran")').click();

    const badgeAntrean = page.getByText(/\d+ transaksi belum terkirim/);
    await expect(badgeAntrean).toBeVisible({ timeout: 10000 });

    // Koneksi pulih.
    await context.setOffline(false);
    await expect(page.getByText("Online")).toBeVisible({ timeout: 15000 });

    await page.click('button:has-text("Sinkron")');

    // Antrean habis = transaksi benar-benar mendarat di server.
    await expect(badgeAntrean).toBeHidden({ timeout: 20000 });
  });
});
