import { expect, test } from "@playwright/test";
import {
  type TenantFixture,
  imporKatalogCsv,
  loginViaUI,
  provisionTenant,
  tambahProduk,
} from "./helpers";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

/**
 * Dua isian yang servernya sudah lama siap tetapi tidak punya kolom di layar:
 * HPP (harga modal) dan faktor satuan stok (gram per ml, ADR-0012).
 */
test.describe("Katalog: HPP & faktor satuan stok", () => {
  let fx: TenantFixture;

  const detailVarian = async (id: string) => {
    const res = await fetch(`${API_URL}/variants/${id}`, {
      headers: { Authorization: `Bearer ${fx.accessToken}` },
    });
    return (await res.json()).data as { cost_price?: string; stock_factor: string };
  };

  const idVarianPertama = async () => {
    const res = await fetch(`${API_URL}/sync/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${fx.accessToken}` },
      body: "{}",
    });
    return (await res.json()).variants[0].id as string;
  };

  test("HPP bisa diubah dari layar dan tersimpan di server", async ({ page }) => {
    fx = await provisionTenant();
    await loginViaUI(page, fx);
    await page.goto("/katalog");

    const tombol = page.getByRole("button", { name: `Ubah ${fx.productName}` });
    await expect(tombol).toBeVisible({ timeout: 20000 });
    await tombol.click();

    const dialog = page.getByRole("dialog", { name: "Ubah barang" });
    const hpp = dialog.getByLabel(/Harga modal \(HPP\)/);
    // Terisi dari server (POST /products fixture memakai cost_price 10000).
    await expect(hpp).toHaveValue(/10000/, { timeout: 15000 });
    await hpp.fill("12500");
    await dialog.getByRole("button", { name: "Simpan" }).click();
    await expect(page.getByText("Barang disimpan")).toBeVisible();

    const d = await detailVarian(await idVarianPertama());
    expect(Number(d.cost_price)).toBe(12500);
  });

  // HPP tidak pernah ikut /sync/pull: apa pun yang disinkronkan menetap di
  // IndexedDB setiap ponsel kasir, dan margin adalah data paling sensitif
  // bagi pemilik UMKM.
  test("HPP tidak ikut terkirim ke perangkat lewat sync", async ({ page }) => {
    fx = await provisionTenant();
    await loginViaUI(page, fx);
    const res = await fetch(`${API_URL}/sync/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${fx.accessToken}` },
      body: "{}",
    });
    const pull = await res.json();
    expect(pull.variants[0]).not.toHaveProperty("cost_price");
  });

  test("faktor gram per ml bisa dikoreksi tanpa impor CSV", async ({ page }) => {
    fx = await provisionTenant();
    await imporKatalogCsv(
      fx,
      [
        "ProductName,VariantName,SKU,Barcode,Price,CostPrice,Uom,UomPrecision,StockQuantity,ItemType,StockUom,StockFactor",
        "Bibit Vanilla,Default,BBT-VAN,,1500,800,ml,1,250,stock,g,0.9",
      ].join("\n"),
    );
    await loginViaUI(page, fx);
    await page.goto("/katalog");

    await page.getByRole("button", { name: "Ubah Bibit Vanilla" }).click();
    const dialog = page.getByRole("dialog", { name: "Ubah barang" });

    const faktor = dialog.getByLabel("1 ml = berapa g?");
    await expect(faktor).toHaveValue("0.9", { timeout: 15000 });
    // Timbang ulang: 1 ml ternyata 0,92 g.
    await faktor.fill("0,92");
    await dialog.getByRole("button", { name: "Simpan" }).click();
    await expect(page.getByText("Barang disimpan")).toBeVisible();

    const res = await fetch(`${API_URL}/sync/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${fx.accessToken}` },
      body: "{}",
    });
    const v = (await res.json()).variants.find((x: { sku?: string }) => x.sku === "BBT-VAN");
    expect(Number(v.stock_factor)).toBeCloseTo(0.92, 4);
    // Satuan stoknya sendiri tidak berubah — ledger tetap dalam gram.
    expect(v.stock_uom).toBe("g");
  });

  test("barang tanpa satuan stok berbeda tidak menampilkan kolom faktor", async ({ page }) => {
    fx = await provisionTenant();
    await tambahProduk(fx, { name: "Botol Spray", price: "5000" });
    await loginViaUI(page, fx);
    await page.goto("/katalog");

    await page.getByRole("button", { name: "Ubah Botol Spray" }).click();
    const dialog = page.getByRole("dialog", { name: "Ubah barang" });
    await expect(dialog.getByLabel(/Harga modal/)).toBeVisible({ timeout: 15000 });
    await expect(dialog.getByLabel(/= berapa/)).toHaveCount(0);
  });
});
