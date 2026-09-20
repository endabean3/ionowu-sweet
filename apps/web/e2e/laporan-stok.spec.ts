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
 * Laporan stok: pergerakan dari ledger (masuk, terjual, rusak, koreksi),
 * bukan selisih angka stok. Inilah "laporan stok keluar dalam gram" yang
 * diminta pemilik Warung Wangi.
 */
test.describe("Laporan stok", () => {
  let fx: TenantFixture;

  test.beforeEach(async ({ page }) => {
    fx = await provisionTenant();
    const h = { "Content-Type": "application/json", Authorization: `Bearer ${fx.accessToken}` };
    const outlets = await (await fetch(`${API_URL}/outlets`, { headers: h })).json();
    const variant = (await (await fetch(`${API_URL}/stock/levels`, { headers: h })).json()).data[0];
    const mutasi = (event_type: string, quantity: string, note?: string) =>
      fetch(`${API_URL}/stock/events`, {
        method: "POST",
        headers: h,
        body: JSON.stringify({
          outlet_id: outlets.data[0].id,
          variant_id: variant.variant_id,
          event_type,
          quantity,
          note,
        }),
      });
    await mutasi("restock", "500", "Kiriman pemasok");
    await mutasi("waste", "7.5", "Tumpah");

    await loginViaUI(page, fx);
  });

  test("penjualan & mutasi tampil dengan satuan dan tanda yang benar", async ({ page }) => {
    // Satu penjualan supaya ada baris "Terjual".
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

    await page.goto("/laporan-stok");
    const daftar = page.getByRole("list", { name: "Pergerakan stok" });
    await expect(daftar.getByRole("listitem").first()).toBeVisible({ timeout: 20000 });

    // Ringkasan: masuk 500, rusak 7,5, terjual 1 (semuanya ml untuk produk uji).
    await expect(page.getByLabel("Ringkasan Stok masuk")).toContainText("500 ml");
    await expect(page.getByLabel("Ringkasan Rusak/hilang")).toContainText("7,5 ml");
    await expect.poll(async () => daftar.getByRole("listitem").count()).toBeGreaterThanOrEqual(3);

    // Barang masuk bertanda +, keluar bertanda −.
    await expect(daftar.getByRole("listitem").filter({ hasText: "Stok masuk" })).toContainText(
      "+500 ml",
    );
    await expect(daftar.getByRole("listitem").filter({ hasText: "Rusak/hilang" })).toContainText(
      "−7,5 ml",
    );
    await expect(daftar.getByRole("listitem").filter({ hasText: "Terjual" })).toContainText(
      "−1 ml",
    );
    // Catatan mutasi ikut tampil — itu yang menjelaskan selisih ke pemilik.
    await expect(daftar.getByRole("listitem").filter({ hasText: "Kiriman pemasok" })).toBeVisible();
  });
});
