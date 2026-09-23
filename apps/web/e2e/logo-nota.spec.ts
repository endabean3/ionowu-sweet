import { expect, test } from "@playwright/test";
import {
  type TenantFixture,
  bukaShiftBilaPerlu,
  klikBayar,
  loginViaUI,
  pilihTunai,
  provisionTenant,
} from "./helpers";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

/**
 * Logo toko di kepala nota: diunggah di Pengaturan, diubah menjadi bitmap
 * 1-bit di peramban, lalu dipakai nota browser DAN printer termal.
 */
test.describe("Logo nota", () => {
  let fx: TenantFixture;

  /** PNG 64×32 dua warna — cukup untuk membuktikan jalurnya, tanpa aset biner di repo. */
  const pngUji = async (page: import("@playwright/test").Page) =>
    Buffer.from(
      await page.evaluate(() => {
        const c = document.createElement("canvas");
        c.width = 64;
        c.height = 32;
        const ctx = c.getContext("2d") as CanvasRenderingContext2D;
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, 64, 32);
        ctx.fillStyle = "#101820";
        ctx.fillRect(8, 8, 48, 16);
        return c.toDataURL("image/png").split(",")[1];
      }),
      "base64",
    );

  test.beforeEach(async ({ page }) => {
    fx = await provisionTenant();
    await loginViaUI(page, fx);
  });

  test("unggah logo → tersimpan di server → tampil di nota", async ({ page }) => {
    await page.goto("/pengaturan");
    await expect(page.getByLabel("Nama toko")).toBeVisible({ timeout: 20000 });

    await page.setInputFiles("input[type=file]", {
      name: "logo.png",
      mimeType: "image/png",
      buffer: await pngUji(page),
    });
    await expect(page.getByAltText("Pratinjau logo nota")).toBeVisible();
    // Lebar mengikuti kertas 58 mm (384 titik), tinggi ikut rasio 64×32.
    await expect(page.getByText(/^384×\d+ titik$/)).toBeVisible();

    await page.getByRole("button", { name: /^Simpan$/ }).click();
    await expect(page.getByText("Pengaturan toko tersimpan").first()).toBeVisible();

    // Tersimpan di server sebagai bitmap 1-bit, bukan berkas gambar.
    const { data } = await (
      await fetch(`${API_URL}/outlets`, { headers: { Authorization: `Bearer ${fx.accessToken}` } })
    ).json();
    const logo = data[0].receipt_logo as string;
    const [w, h, b64] = logo.split(",", 3);
    expect(Number(w)).toBe(384);
    expect(Number(h)).toBeGreaterThan(0);
    expect(Buffer.from(b64, "base64").length).toBe((Number(w) / 8) * Number(h));

    // Nota memuat logonya.
    await page.goto("/kasir");
    await expect(page.getByText(fx.productName).first()).toBeVisible({ timeout: 20000 });
    await bukaShiftBilaPerlu(page);
    await page.getByText(fx.productName).first().click();
    await klikBayar(page);
    await pilihTunai(page);
    await page.fill("#given_amount", "50000");
    await page.locator('button:has-text("Selesaikan Pembayaran")').click();
    await expect(page.getByText(/^Lunas/).first()).toBeVisible();
    await expect(page.locator("#receipt-print-root img.receipt-logo")).toHaveCount(1);
  });

  test("logo bisa dihapus lagi", async ({ page }) => {
    await page.goto("/pengaturan");
    await expect(page.getByLabel("Nama toko")).toBeVisible({ timeout: 20000 });
    await page.setInputFiles("input[type=file]", {
      name: "logo.png",
      mimeType: "image/png",
      buffer: await pngUji(page),
    });
    await page.getByRole("button", { name: /^Simpan$/ }).click();
    await expect(page.getByText("Pengaturan toko tersimpan").first()).toBeVisible();

    // Toast simpan pertama dibiarkan hilang dulu; dua toast serupa membuat
    // pemeriksaan berikutnya ambigu.
    await page.waitForTimeout(4500);
    await page.getByRole("button", { name: "Hapus logo nota" }).click();
    await expect(page.getByAltText("Pratinjau logo nota")).toBeHidden();
    await page.getByRole("button", { name: /^Simpan$/ }).click();
    await expect(page.getByText("Pengaturan toko tersimpan").first()).toBeVisible();

    const { data } = await (
      await fetch(`${API_URL}/outlets`, { headers: { Authorization: `Bearer ${fx.accessToken}` } })
    ).json();
    expect(data[0].receipt_logo ?? null).toBeNull();
  });
});
