import { expect, test } from "@playwright/test";
import { type TenantFixture, bukaShiftBilaPerlu, loginViaUI, provisionTenant } from "./helpers";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

/**
 * Pemilik memperbaiki barang dari Katalog (nama salah ketik, harga) lalu
 * menonaktifkan barang yang tidak dijual lagi. Perubahan harus terlihat di
 * kasir perangkat ini SEKARANG, dan tersimpan di server (bertahan setelah
 * sync pull menimpa cermin lokal).
 */
test.describe("Katalog: ubah & nonaktifkan barang", () => {
  let fx: TenantFixture;

  test.beforeEach(async ({ page }) => {
    fx = await provisionTenant();
    await loginViaUI(page, fx);
    await page.goto("/kasir");
    await expect(page.getByText(fx.productName).first()).toBeVisible({ timeout: 20000 });
    await bukaShiftBilaPerlu(page);
  });

  test("ubah nama + harga, lalu nonaktifkan", async ({ page }) => {
    await page.goto("/katalog");
    await page.getByRole("button", { name: `Ubah ${fx.productName}` }).click();
    const dialog = page.getByRole("dialog", { name: "Ubah barang" });
    await dialog.getByLabel("Nama barang").fill("Parfum Refil Melati Spicy");
    await dialog.getByLabel(/Harga jual per/).fill("27500");
    await dialog.getByRole("button", { name: "Simpan" }).click();
    await expect(page.getByText("Barang disimpan")).toBeVisible();

    // Tersimpan di server, bukan hanya di cermin lokal.
    const res = await fetch(`${API_URL}/sync/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${fx.accessToken}` },
      body: "{}",
    });
    const pull = await res.json();
    expect(pull.variants[0].price).toMatch(/^27500(\.0+)?$/);
    expect(pull.products[0].name).toBe("Parfum Refil Melati Spicy");

    await page.goto("/kasir");
    await expect(page.getByText("Parfum Refil Melati Spicy").first()).toBeVisible();
    await expect(page.getByText(/27\.500/).first()).toBeVisible();

    // Nonaktifkan: hilang dari kasir, tetap di katalog berlabel Nonaktif.
    await page.goto("/katalog");
    await page.getByRole("button", { name: "Ubah Parfum Refil Melati Spicy" }).click();
    await page.getByText("Dijual di kasir").click();
    await page.getByRole("button", { name: "Simpan" }).click();
    await expect(page.getByText(/Barang dinonaktifkan/)).toBeVisible();
    await expect(page.getByText(/Nonaktif · tidak tampil di kasir/)).toBeVisible();

    await page.goto("/kasir");
    await expect(page.getByText("Belum ada produk di katalog.")).toBeVisible({ timeout: 15000 });
  });

  test("harga tidak sah ditolak sebelum dikirim", async ({ page }) => {
    await page.goto("/katalog");
    await page.getByRole("button", { name: `Ubah ${fx.productName}` }).click();
    const dialog = page.getByRole("dialog", { name: "Ubah barang" });
    await dialog.getByLabel(/Harga jual per/).fill("");
    await dialog.getByRole("button", { name: "Simpan" }).click();
    await expect(dialog.getByText("Isi harga, mis. 1000")).toBeVisible();
  });
});
