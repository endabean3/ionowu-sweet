import { test, expect } from "@playwright/test";

test.describe("Offline Checkout & Sync", () => {
  test("harus bisa transaksi dalam keadaan offline dan masuk ke queue", async ({ page, context }) => {
    // 1. Login dulu (harus online)
    await page.goto("/login");
    await page.fill('input[type="email"]', "owner@kopi-senja.test");
    await page.fill('input[type="password"]', "devpass"); // Gunakan password dev
    await page.click('button:has-text("Masuk ke Kasir")');
    
    // Tunggu sampai redirect ke dasbor atau kasir
    await expect(page).toHaveURL(/\/dashboard|\/kasir/);
    
    // Pergi ke kasir
    await page.goto("/kasir");

    // 2. Putus koneksi (simulasikan offline)
    await context.setOffline(true);
    
    // 3. Pastikan UI merespons offline
    await expect(page.locator("text=Offline (Tersimpan Lokal)")).toBeVisible();

    // 4. Buka shift (modal)
    // Tunggu modal muncul
    const shiftButton = page.locator('button:has-text("Buka Shift Sekarang")');
    if (await shiftButton.isVisible()) {
      await page.fill('input[placeholder="100000"]', "150000");
      await shiftButton.click();
    }

    // 5. Pilih produk pertama (misal: ada produk Es Kopi Susu Senja)
    // Note: Jika produk blm di-seed ke dexie, mungkin kosong. Kita tunggu item muncul.
    // Asumsikan ada 1 produk hasil pull.
    const productCard = page.locator(".flex.flex-col.justify-between.rounded-xl").first();
    await expect(productCard).toBeVisible({ timeout: 5000 });
    await productCard.click();

    // 6. Cek keranjang
    await expect(page.locator("text=Keranjang Belanja")).toBeVisible();
    await expect(page.locator("text=1 item")).toBeVisible();

    // 7. Bayar
    await page.click('button:has-text("Selesaikan Pembayaran")'); // Jika ada tombol ini (oh ini ada di modal bayar!)
    
    // Buka modal bayar dulu
    await page.keyboard.press("Enter"); // Trigger keyboard shortcut
    
    // Di modal bayar
    await expect(page.locator("text=Pembayaran")).toBeVisible();
    
    // Pilih cash dan masukkan uang (atau tekan tombol sugesti)
    await page.click("text=Tunai");
    const payButton = page.locator('button:has-text("Selesaikan Pembayaran")');
    await expect(payButton).toBeEnabled();
    await payButton.click();

    // 8. Verifikasi indikator sync badge (karena offline, queue nambah)
    await expect(page.locator("text=antrean")).toBeVisible();
  });
});
