import { expect, test } from "@playwright/test";
import {
  type TenantFixture,
  bukaShiftBilaPerlu,
  loginViaUI,
  provisionTenant,
  tambahProduk,
} from "./helpers";

/**
 * Scan barcode BARANG di kolom cari kasir.
 *
 * Sebelumnya kolom ini bertuliskan "scan barcode" tetapi hanya mencocokkan
 * NAMA — barcode dan SKU tidak pernah ikut sampai ke layar, jadi memindai
 * barang tidak pernah menemukan apa pun.
 */
const BARCODE = "8991002109999";
const SKU = "BTL-KOSONG-30";
const NAMA = "Botol Kaca Kosong 30 ml";

test.describe("Scan barcode barang", () => {
  let fx: TenantFixture;

  test.beforeEach(async ({ page }) => {
    fx = await provisionTenant();
    await tambahProduk(fx, { name: NAMA, barcode: BARCODE, sku: SKU });
    await loginViaUI(page, fx);
    await page.goto("/kasir");
    await expect(page.getByText(NAMA).first()).toBeVisible({ timeout: 20000 });
    await bukaShiftBilaPerlu(page);
  });

  const kolom = (page: import("@playwright/test").Page) =>
    page.locator('input[aria-label^="Cari produk"]');

  test("barcode yang dipindai langsung masuk keranjang dan kolom dikosongkan", async ({ page }) => {
    await kolom(page).fill(BARCODE);
    await expect(page.getByText(`${NAMA} ditambahkan`).first()).toBeVisible();
    // Kolom bersih = siap untuk barang berikutnya tanpa menyentuh layar.
    await expect(kolom(page)).toHaveValue("");
    await expect(page.getByRole("button", { name: /^Bayar/ }).first()).toBeVisible();
  });

  test("SKU juga diterima, tanpa peduli huruf besar-kecil", async ({ page }) => {
    await kolom(page).fill(SKU.toLowerCase());
    await expect(page.getByText(`${NAMA} ditambahkan`).first()).toBeVisible();
  });

  // Kalau potongan kode ikut dianggap cocok, kasir yang baru mengetik tiga
  // digit pertama sudah kejatuhan barang ke keranjang.
  test("potongan barcode hanya menyaring grid, tidak menambah apa pun", async ({ page }) => {
    await kolom(page).fill(BARCODE.slice(0, 8));
    await expect(page.getByText(NAMA).first()).toBeVisible();
    await expect(kolom(page)).toHaveValue(BARCODE.slice(0, 8));
    await expect(page.getByText(`${NAMA} ditambahkan`)).toHaveCount(0);
  });

  test("mengetik nama tetap menyaring seperti biasa", async ({ page }) => {
    await kolom(page).fill("botol kaca");
    await expect(page.getByText(NAMA).first()).toBeVisible();
    await expect(page.getByText(fx.productName)).toHaveCount(0);
  });
});
