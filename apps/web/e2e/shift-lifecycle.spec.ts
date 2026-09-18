import { expect, test } from "@playwright/test";
import { type TenantFixture, loginViaUI, provisionTenant } from "./helpers";

/**
 * Kasir tidak bisa berjualan sebelum shift dibuka — modal ini adalah gerbang
 * pertama yang ditemui setiap pagi, jadi kalau ia macet, toko tidak buka.
 */
test.describe("Shift Lifecycle", () => {
  let fx: TenantFixture;

  test.beforeEach(async () => {
    fx = await provisionTenant();
  });

  test("Toko yang belum dibuka menampilkan modal, dan shift bisa dibuka", async ({ page }) => {
    await loginViaUI(page, fx);
    await page.goto("/kasir");

    const judulModal = page.getByText("Toko Belum Dibuka");
    await expect(judulModal).toBeVisible({ timeout: 20000 });

    await page.fill('input[placeholder="100000"]', "250000");
    await page.click('button:has-text("Buka Shift Sekarang")');

    await expect(judulModal).toBeHidden({ timeout: 15000 });

    // Setelah shift terbuka, layar kasir benar-benar bisa dipakai.
    await expect(page.getByText(fx.productName).first()).toBeVisible({ timeout: 20000 });
  });
});
