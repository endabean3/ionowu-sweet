import { test, expect } from "@playwright/test";

test.describe("Sync Recovery", () => {
  test("Harus menyimpan antrean dan memulihkannya saat kembali online", async ({ page, context }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "owner@kopi-senja.test");
    await page.fill('input[type="password"]', "devpass");
    await page.click('button:has-text("Masuk ke Kasir")');
    await expect(page).toHaveURL(/\/dashboard|\/kasir/);
    await page.goto("/kasir");

    // Simulasi offline
    await context.setOffline(true);
    await expect(page.locator("text=Offline (Tersimpan Lokal)")).toBeVisible();

    // Buka shift jika perlu
    const shiftButton = page.locator('button:has-text("Buka Shift Sekarang")');
    if (await shiftButton.isVisible()) {
      await page.fill('input[placeholder="100000"]', "100000");
      await shiftButton.click();
    }

    // Klik produk
    const productCard = page.locator(".flex.flex-col.justify-between.rounded-xl").first();
    await expect(productCard).toBeVisible({ timeout: 5000 });
    await productCard.click();

    // Bayar
    await page.keyboard.press("Enter");
    await page.click("text=Tunai");
    await page.click('button:has-text("Selesaikan Pembayaran")');

    // Pastikan ada queue offline
    await expect(page.locator("text=antrean")).toBeVisible();

    // Simulasi online
    await context.setOffline(false);
    await expect(page.locator("text=Online")).toBeVisible();

    // Tekan Sync Now
    await page.click('button:has-text("Sync Now")');
    
    // Cek badge antrean hilang
    await expect(page.locator("text=antrean")).not.toBeVisible();
  });
});
