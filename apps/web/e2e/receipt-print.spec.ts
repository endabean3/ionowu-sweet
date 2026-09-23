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
 * Struk harus bisa dicetak SAAT OFFLINE — justru itu saat ia paling
 * dibutuhkan. Karena itu transaksi di uji ini sengaja dilakukan dengan
 * koneksi terputus.
 */
test.describe("Cetak Struk", () => {
  let fx: TenantFixture;

  test.beforeEach(async () => {
    fx = await provisionTenant();
  });

  test("struk tersusun dari data lokal setelah transaksi offline", async ({ page, context }) => {
    await loginViaUI(page, fx);
    await page.goto("/kasir");

    const kartuProduk = page.getByText(fx.productName).first();
    await expect(kartuProduk).toBeVisible({ timeout: 20000 });
    await bukaShiftBilaPerlu(page);

    await context.setOffline(true);
    await expect(
      page.getByText("Offline · tersimpan").filter({ visible: true }).first(),
    ).toBeVisible();

    await kartuProduk.click();
    await klikBayar(page);
    await pilihTunai(page);
    await page.fill("#given_amount", "50000");
    await page.locator('button:has-text("Selesaikan Pembayaran")').click();

    const struk = page.locator("#receipt-print-root");
    await expect(struk).toHaveCount(1, { timeout: 10000 });

    // Di LAYAR struk tidak boleh mengganggu apa pun.
    await expect(struk).toBeHidden();

    const isi = (await struk.textContent()) ?? "";
    expect(isi).toContain(fx.productName);
    expect(isi).toContain("TOTAL");
    // Harga varian 25.000, dibayar 50.000 → kembalian wajib muncul.
    expect(isi).toContain("Kembali");
    // Transaksi ini dibuat offline, jadi harus ditandai belum tersinkronisasi.
    expect(isi).toContain("belum tersinkronisasi");

    // Gerbang sebenarnya: dengan media cetak, struk MUNCUL dan sisa aplikasi
    // menghilang. Tanpa pemeriksaan ini, @media print bisa saja salah dan
    // hasil cetak keluar sebagai halaman kosong — dan tak seorang pun tahu
    // sampai ada yang benar-benar menekan Cetak.
    await page.emulateMedia({ media: "print" });
    await expect(struk).toBeVisible();
    await expect(page.locator("header")).toBeHidden();
    await page.emulateMedia({ media: "screen" });
  });
});
