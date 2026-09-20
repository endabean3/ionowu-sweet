import { expect, test } from "@playwright/test";
import { type TenantFixture, loginViaUI, provisionTenant } from "./helpers";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

/**
 * Layar Stok: barang masuk, barang rusak/hilang, dan opname (hasil timbang).
 * Yang dijaga: stok di server BENAR-BENAR berubah — versi lama endpoint stok
 * hanya menulis ledger (dengan saldo palsu) dan opname tidak mengubah apa pun.
 */
test.describe("Stok: masuk, rusak, opname", () => {
  let fx: TenantFixture;

  const levels = async () => {
    const res = await fetch(`${API_URL}/stock/levels`, {
      headers: { Authorization: `Bearer ${fx.accessToken}` },
    });
    const { data } = await res.json();
    return data as { variant_id: string; product_name: string; stock_quantity: string }[];
  };

  test.beforeEach(async ({ page }) => {
    fx = await provisionTenant();
    await loginViaUI(page, fx);
    // Katalog harus sampai ke Dexie lewat sync pull sebelum layar Stok memuatnya.
    await page.goto("/kasir");
    await expect(page.getByText(fx.productName).first()).toBeVisible({ timeout: 20000 });
  });

  test("stok masuk lalu opname mengubah stok di server", async ({ page }) => {
    await page.goto("/stok");
    const baris = page
      .getByRole("list", { name: "Daftar stok" })
      .getByRole("listitem")
      .filter({ hasText: fx.productName });
    await expect(baris).toBeVisible({ timeout: 15000 });
    await expect(baris).toContainText("habis"); // produk uji lahir tanpa stok

    // 1. Stok masuk 250.
    await page.getByRole("button", { name: `Ubah stok ${fx.productName}` }).click();
    const dialog = page.getByRole("dialog", { name: "Ubah stok" });
    await dialog.getByLabel(/^Jumlah/).fill("250");
    await expect(dialog.getByText(/Stok menjadi/)).toContainText("250");
    await dialog.getByRole("button", { name: /Simpan stok masuk/i }).click();
    await expect(page.getByText("Stok masuk tersimpan")).toBeVisible();
    await expect(baris).toContainText("250 ml");
    expect(Number((await levels())[0].stock_quantity)).toBe(250);

    // 2. Rusak 10 → 240.
    await page.getByRole("button", { name: `Ubah stok ${fx.productName}` }).click();
    await dialog.getByRole("tab", { name: /Rusak/ }).click();
    await dialog.getByLabel(/^Jumlah/).fill("10");
    await dialog.getByRole("button", { name: /Simpan rusak/i }).click();
    await expect(page.getByText("Rusak/hilang tersimpan")).toBeVisible();
    expect(Number((await levels())[0].stock_quantity)).toBe(240);

    // 3. Opname: timbangan menunjukkan 238,5 → stok jadi persis itu.
    await page.getByRole("button", { name: `Ubah stok ${fx.productName}` }).click();
    await dialog.getByRole("tab", { name: "Opname" }).click();
    await dialog.getByLabel(/Hasil timbang/).fill("238,5");
    await expect(dialog.getByText(/Selisih kurang/)).toBeVisible();
    await dialog.getByRole("button", { name: /Simpan opname/i }).click();
    await expect(page.getByText("Opname tersimpan")).toBeVisible();
    expect(Number((await levels())[0].stock_quantity)).toBe(238.5);
    await expect(baris).toContainText("238,5 ml");
  });

  test("angka tidak sah ditolak sebelum dikirim", async ({ page }) => {
    await page.goto("/stok");
    await page.getByRole("button", { name: `Ubah stok ${fx.productName}` }).click();
    const dialog = page.getByRole("dialog", { name: "Ubah stok" });
    await dialog.getByLabel(/^Jumlah/).fill("-5");
    await dialog.getByRole("button", { name: /Simpan/ }).click();
    await expect(dialog.getByText(/Isi angka/)).toBeVisible();
    expect(Number((await levels())[0].stock_quantity)).toBe(0);
  });
});
