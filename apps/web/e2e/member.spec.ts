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
 * Member Warung Wangi: daftar lewat form (WA wajib + wajib follow TikTok
 * toko), bonus tester di SETIAP pembelian, merchandise HANYA di pembelian
 * pertama, dan kode member yang dipindai ke kolom cari langsung menempel.
 * Semuanya di perangkat — berjalan juga saat offline.
 */
test.describe("Member pelanggan", () => {
  let fx: TenantFixture;

  test.beforeEach(async ({ page }) => {
    fx = await provisionTenant();
    await loginViaUI(page, fx);
    await page.goto("/kasir");
    await expect(page.getByText(fx.productName).first()).toBeVisible({ timeout: 20000 });
    await bukaShiftBilaPerlu(page);
  });

  const jual = async (page: import("@playwright/test").Page) => {
    await page.getByText(fx.productName).first().click();
    await klikBayar(page);
    await pilihTunai(page);
    await page.fill("#given_amount", "50000");
    await page.locator('button:has-text("Selesaikan Pembayaran")').click();
    await expect(page.getByText(/^Lunas/)).toBeVisible();
  };
  const nota = (page: import("@playwright/test").Page) =>
    page.locator("#receipt-print-root").textContent();

  test("daftar, bonus pembelian pertama, lalu scan kode di transaksi berikutnya", async ({
    page,
  }) => {
    await page.getByRole("button", { name: /Pilih atau daftar member/ }).click();
    await page.getByRole("tab", { name: /Daftar baru/ }).click();
    await page.getByLabel("Nomor WhatsApp *").fill("0812-3456-7890");

    // Tanpa centang follow: ditolak.
    await page.getByRole("button", { name: /Daftarkan & pakai/ }).click();
    await expect(page.getByText(/wajib follow akun TikTok toko/)).toBeVisible();

    await page.getByText(/Sudah follow TikTok/).click();
    await page.getByRole("button", { name: /Daftarkan & pakai/ }).click();
    await expect(page.getByText(/Member M-[A-Z0-9]{6} dipakai/).first()).toBeVisible();

    await jual(page);
    await expect(page.getByText(/beri 1 tester \+ merchandise perdana/)).toBeVisible();
    const nota1 = (await nota(page)) ?? "";
    expect(nota1).toContain("Bonus: 1 tester");
    expect(nota1).toContain("Bonus: merchandise perdana");
    const kode = nota1.match(/Member (M-[A-Z0-9]{6})/)?.[1];
    expect(kode).toBeTruthy();

    // Transaksi kedua: kode dipindai ke kolom cari → member menempel,
    // tester saja (bukan merchandise lagi).
    await page.fill('input[aria-label^="Cari produk"]', kode as string);
    await expect(page.getByText(`Member ${kode} dipakai`).first()).toBeVisible();
    await jual(page);
    // Toast "Lunas" transaksi pertama bisa masih tampil — tunggu sampai
    // nomor nota benar-benar berganti, baru baca isinya.
    const no1 = nota1.match(/No\. (\w+)/)?.[1];
    await expect.poll(async () => (await nota(page))?.match(/No\. (\w+)/)?.[1]).not.toBe(no1);
    const nota2 = (await nota(page)) ?? "";
    expect(nota2).toContain(`Member ${kode}`);
    expect(nota2).toContain("Bonus: 1 tester");
    expect(nota2).not.toContain("merchandise perdana");
  });

  test("tanpa member: nota tidak memuat blok member", async ({ page }) => {
    await jual(page);
    expect(await nota(page)).not.toContain("Member");
  });
});
