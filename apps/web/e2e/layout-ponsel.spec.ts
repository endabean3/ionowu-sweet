import { expect, test } from "@playwright/test";
import { type TenantFixture, bukaShiftBilaPerlu, loginViaUI, provisionTenant } from "./helpers";

/**
 * Tata letak portrait ponsel murah (Redmi 9C: 360×800 CSS px) — layar yang
 * dipakai kasir Warung Wangi seharian. Yang dijaga: header satu baris,
 * tanpa geser samping, dan keranjang lewat panel bawah (bukan di bawah
 * seluruh katalog).
 */
test.use({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true });

test.describe("Layout ponsel 360 px", () => {
  let fx: TenantFixture;

  test.beforeEach(async ({ page }) => {
    fx = await provisionTenant();
    await loginViaUI(page, fx);
    await page.goto("/kasir");
    await expect(page.getByText(fx.productName).first()).toBeVisible({ timeout: 20000 });
    await bukaShiftBilaPerlu(page);
  });

  test("header ringkas, tanpa geser samping, keranjang di panel bawah", async ({ page }) => {
    const header = await page.locator("header").first().boundingBox();
    expect(header?.height ?? 999).toBeLessThan(80);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);

    // Keranjang samping tidak dirender terlihat di ponsel.
    await expect(page.getByText("Keranjang Belanja")).toBeHidden();

    await page.getByText(fx.productName).first().click();

    await page.getByRole("button", { name: /Buka keranjang/ }).click();
    const panel = page.getByRole("dialog", { name: "Keranjang" });
    await expect(panel).toBeVisible();
    await expect(panel.getByText(fx.productName)).toBeVisible();

    await panel.getByRole("button", { name: /Bayar Sekarang/ }).click();
    await expect(panel).toBeHidden();
    await page.click("text=Tunai");
    await page.fill("#given_amount", "1000000");
    await page.locator('button:has-text("Selesaikan Pembayaran")').click();
    await expect(page.getByText(/^Lunas/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Buka keranjang/ })).toBeHidden();
  });
});
