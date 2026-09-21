import { expect, test } from "@playwright/test";
import {
  type TenantFixture,
  bukaShiftBilaPerlu,
  klikBayar,
  loginViaUI,
  provisionTenant,
} from "./helpers";

/**
 * Daftar member (/member). Sebelumnya member hanya bisa DICARI dari kolom
 * kasir — tidak ada cara melihat siapa saja yang terdaftar, memperbaiki
 * nomor WA yang salah ketik, atau tahu siapa yang belum menerima
 * merchandise perdananya.
 */
test.describe("Daftar member", () => {
  let fx: TenantFixture;

  const daftarkanMember = async (page: import("@playwright/test").Page, wa: string) => {
    await page.goto("/kasir");
    await expect(page.getByText(fx.productName).first()).toBeVisible({ timeout: 20000 });
    await bukaShiftBilaPerlu(page);
    await page.getByRole("button", { name: /Pilih atau daftar member/ }).click();
    await page.getByRole("tab", { name: /Daftar baru/ }).click();
    await page.getByLabel("Nomor WhatsApp *").fill(wa);
    await page.getByText(/Sudah follow TikTok/).click();
    await page.getByRole("button", { name: /Daftarkan & pakai/ }).click();
    await expect(page.getByText(/Member M-[A-Z0-9]{6} dipakai/).first()).toBeVisible();
  };

  test.beforeEach(async ({ page }) => {
    fx = await provisionTenant();
    await loginViaUI(page, fx);
  });

  test("member tampil, bisa dicari, dan datanya bisa diperbaiki", async ({ page }) => {
    await daftarkanMember(page, "0812-3456-7890");
    await page.locator('button:has-text("Sinkron")').filter({ visible: true }).first().click();

    await page.goto("/member");
    const baris = page.getByRole("list", { name: "Daftar member" }).getByRole("listitem");
    await expect(baris.first()).toBeVisible({ timeout: 20000 });
    await expect(baris.first()).toContainText("0812-3456-7890");
    // Belum pernah belanja → merchandise belum diberikan.
    await expect(baris.first()).toContainText("belum");

    // Perbaiki nama & nomor yang salah ketik.
    await baris.first().getByRole("button").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nama").fill("Ibu Sari");
    await dialog.getByLabel("Nomor WhatsApp").fill("0812-3456-7899");
    await dialog.getByRole("button", { name: "Simpan" }).click();
    await expect(page.getByText("Member diperbarui")).toBeVisible();
    await expect(baris.first()).toContainText("Ibu Sari");
    await expect(baris.first()).toContainText("0812-3456-7899");

    // Pencarian menyaring daftar.
    await page.getByLabel("Cari member").fill("Sari");
    await expect(baris).toHaveCount(1);
    await page.getByLabel("Cari member").fill("tidak-ada-orang-ini");
    await expect(page.getByText(/Tidak ada member cocok/)).toBeVisible();
  });

  test("penanda merchandise terisi setelah pembelian pertama dan bisa dibatalkan", async ({
    page,
  }) => {
    await daftarkanMember(page, "0813-1111-2222");
    await page.getByText(fx.productName).first().click();
    await klikBayar(page);
    await page.click("text=Tunai");
    await page.fill("#given_amount", "50000");
    await page.locator('button:has-text("Selesaikan Pembayaran")').click();
    await expect(page.getByText(/^Lunas/).first()).toBeVisible();
    await page.locator('button:has-text("Sinkron")').filter({ visible: true }).first().click();

    await page.goto("/member");
    const baris = page.getByRole("list", { name: "Daftar member" }).getByRole("listitem");
    await expect(baris.first()).toBeVisible({ timeout: 20000 });
    await expect
      .poll(
        async () => {
          await page.getByRole("button", { name: "Muat ulang daftar member" }).click();
          return (await baris.first().textContent()) ?? "";
        },
        { timeout: 30000 },
      )
      .toContain("merchandise ✓");

    // Ternyata merchandise-nya belum sempat diserahkan — penandanya dicabut.
    await baris.first().getByRole("button").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByText("Merchandise perdana sudah diberikan").click();
    await dialog.getByRole("button", { name: "Simpan" }).click();
    await expect(page.getByText("Member diperbarui")).toBeVisible();
    await expect(baris.first()).toContainText("belum");
  });
});
