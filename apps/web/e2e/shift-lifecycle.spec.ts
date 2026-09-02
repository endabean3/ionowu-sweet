import { test, expect } from "@playwright/test";

test.describe("Shift Lifecycle", () => {
  test("Buka shift, lakukan transaksi, dan tutup shift (TBD)", async ({ page, context }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "owner@kopi-senja.test");
    await page.fill('input[type="password"]', "devpass");
    await page.click('button:has-text("Masuk ke Kasir")');
    await expect(page).toHaveURL(/\/dashboard|\/kasir/);
    await page.goto("/kasir");

    // Pastikan shift modal muncul pertama kali
    const modalTitle = page.locator("text=Toko Belum Dibuka");
    await expect(modalTitle).toBeVisible();

    await page.fill('input[type="number"]', "250000");
    await page.click('button:has-text("Buka Shift Sekarang")');

    // Modal hilang, masuk ke dashboard/kasir
    await expect(modalTitle).not.toBeVisible();
    
    // Nanti ditambahkan flow untuk tutup shift jika UI header-nya diklik
    // Tunggu Sprint lanjutan
  });
});
