import { expect, test } from "@playwright/test";
import {
  type TenantFixture,
  bukaShiftBilaPerlu,
  klikBayar,
  loginViaUI,
  provisionTenant,
} from "./helpers";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

/**
 * Riwayat transaksi: mencari nota lama, cetak ulang, refund, dan void.
 * Void hanya boleh selama shift masih terbuka (Z-Report yang sudah dicetak
 * tidak pernah berubah); refund selalu boleh.
 */
test.describe("Riwayat transaksi", () => {
  let fx: TenantFixture;

  const levels = async () => {
    const res = await fetch(`${API_URL}/stock/levels`, {
      headers: { Authorization: `Bearer ${fx.accessToken}` },
    });
    return (await res.json()).data as { stock_quantity: string }[];
  };

  const jual = async (page: import("@playwright/test").Page) => {
    await page.goto("/kasir");
    await expect(page.getByText(fx.productName).first()).toBeVisible({ timeout: 20000 });
    await bukaShiftBilaPerlu(page);
    await page.getByText(fx.productName).first().click();
    await klikBayar(page);
    await page.click("text=Tunai");
    await page.fill("#given_amount", "50000");
    await page.locator('button:has-text("Selesaikan Pembayaran")').click();
    await expect(page.getByText(/^Lunas/)).toBeVisible();
    await page.locator('button:has-text("Sinkron")').filter({ visible: true }).first().click();
  };

  const baris = (page: import("@playwright/test").Page) =>
    page.getByRole("list", { name: "Daftar transaksi" }).getByRole("listitem");

  test.beforeEach(async ({ page }) => {
    fx = await provisionTenant();
    await loginViaUI(page, fx);
    // Stok awal supaya pengembalian barang terlihat angkanya.
    const h = { "Content-Type": "application/json", Authorization: `Bearer ${fx.accessToken}` };
    const outlets = await (await fetch(`${API_URL}/outlets`, { headers: h })).json();
    const variant = (await (await fetch(`${API_URL}/stock/levels`, { headers: h })).json()).data[0];
    await fetch(`${API_URL}/stock/events`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({
        outlet_id: outlets.data[0].id,
        variant_id: variant.variant_id,
        event_type: "restock",
        quantity: "100",
      }),
    });
  });

  test("nota tampil, bisa di-void, dan stoknya kembali", async ({ page }) => {
    await jual(page);
    await page.goto("/riwayat");
    await expect(baris(page).first()).toBeVisible({ timeout: 20000 });
    // Terjual 1 dari 100.
    await expect.poll(async () => Number((await levels())[0].stock_quantity)).toBe(99);

    await baris(page).first().click();
    const dialog = page.getByRole("dialog", { name: /^Nota / });
    await expect(dialog).toContainText(fx.productName);

    await dialog.getByRole("button", { name: /Batalkan transaksi \(void\)/ }).click();
    await dialog.getByLabel("Alasan pembatalan").fill("Salah input barang");
    await dialog.getByRole("button", { name: "Ya, batalkan transaksi" }).click();
    await expect(page.getByText("Transaksi dibatalkan")).toBeVisible();

    // Barang kembali ke rak, dan notanya bertanda Void.
    await expect.poll(async () => Number((await levels())[0].stock_quantity)).toBe(100);
    await expect(baris(page).first()).toContainText("Void");
  });

  test("refund penuh mengembalikan uang dan stok", async ({ page }) => {
    await jual(page);
    await page.goto("/riwayat");
    await expect(baris(page).first()).toBeVisible({ timeout: 20000 });
    await baris(page).first().click();
    const dialog = page.getByRole("dialog", { name: /^Nota / });
    await dialog.getByRole("button", { name: "Refund" }).click();
    await dialog.getByLabel("Alasan refund").fill("Barang bocor");
    await dialog.getByRole("button", { name: /^Refund Rp/ }).click();
    await expect(page.getByText("Refund tersimpan")).toBeVisible();
    await expect(baris(page).first()).toContainText("Refund");
    await expect.poll(async () => Number((await levels())[0].stock_quantity)).toBe(100);
  });

  test("nota yang sudah direfund tidak bisa di-void", async ({ page }) => {
    await jual(page);
    await page.goto("/riwayat");
    await baris(page).first().click();
    const dialog = page.getByRole("dialog", { name: /^Nota / });
    await dialog.getByRole("button", { name: "Refund" }).click();
    await dialog.getByLabel("Alasan refund").fill("Barang bocor");
    await dialog.getByRole("button", { name: /^Refund Rp/ }).click();
    await expect(page.getByText("Refund tersimpan")).toBeVisible();

    await baris(page).first().click();
    await expect(dialog.getByRole("button", { name: /Batalkan transaksi/ })).toBeHidden();
  });
});
