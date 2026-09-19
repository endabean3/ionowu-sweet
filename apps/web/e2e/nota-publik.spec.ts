import { expect, test } from "@playwright/test";
import {
  type TenantFixture,
  bukaShiftBilaPerlu,
  klikBayar,
  loginViaUI,
  provisionTenant,
} from "./helpers";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
const WEB_NOTA = "https://warungwangi.ionowu.com/nota";

/**
 * Nota ber-QR (ADR-0013): QR menunjuk halaman nota publik di web toko, yang
 * servernya membaca GET /public/v1/nota/{tenant}/{nota} dan mendaftarkan
 * member lewat POST …/member — tanpa login, satu pendaftaran per nota.
 */
test.describe("Nota publik: QR garansi & daftar member", () => {
  let fx: TenantFixture;
  let tenantId: string;

  test.beforeEach(async ({ page }) => {
    fx = await provisionTenant();
    const h = { "Content-Type": "application/json", Authorization: `Bearer ${fx.accessToken}` };
    const { data } = await (await fetch(`${API_URL}/outlets`, { headers: h })).json();
    tenantId = data[0].tenant_id;
    const patch = await fetch(`${API_URL}/outlets/${data[0].id}`, {
      method: "PATCH",
      headers: h,
      body: JSON.stringify({ nota_web_url: `${WEB_NOTA}/`, warranty_days: 7 }),
    });
    expect(patch.status).toBe(200);

    await loginViaUI(page, fx);
    await page.goto("/kasir");
    await expect(page.getByText(fx.productName).first()).toBeVisible({ timeout: 20000 });
    await bukaShiftBilaPerlu(page);
  });

  test("jual → nota ber-QR → nota publik → daftar member sekali saja", async ({ page }) => {
    await page.getByText(fx.productName).first().click();
    await klikBayar(page);
    await page.click("text=Tunai");
    await page.fill("#given_amount", "50000");
    await page.locator('button:has-text("Selesaikan Pembayaran")').click();
    await expect(page.getByText(/^Lunas/)).toBeVisible();

    const nota = page.locator("#receipt-print-root");
    await expect(nota).toContainText("Cek garansi & daftar member");
    await expect(nota.locator("svg.receipt-qr")).toHaveCount(1);
    const saleId = ((await nota.textContent()) ?? "").match(/No\. ([0-9A-Z]{26})/)?.[1] as string;
    expect(saleId).toBeTruthy();

    // Kirim antrean sekarang, lalu tunggu nota tiba di server.
    await page.locator('button:has-text("Sinkron")').filter({ visible: true }).first().click();
    const url = `${API_URL}/public/v1/nota/${tenantId}/${saleId}`;
    await expect
      .poll(async () => (await fetch(url)).status, { timeout: 30000, intervals: [1000] })
      .toBe(200);

    const { data } = await (await fetch(url)).json();
    // Nomor di nota = id penjualan di server (dulu dua ULID berbeda).
    expect(data.receipt_number.endsWith(saleId.slice(-6))).toBe(true);
    expect(data.member_signup_open).toBe(true);
    expect(data.warranty.days).toBe(7);
    expect(data.warranty.active).toBe(true);
    expect(data.items[0].name).toContain(fx.productName);
    // Halaman publik: tidak ada kasir / id internal / pelanggan di jawaban.
    const mentah = JSON.stringify(data);
    expect(mentah).not.toContain("Pemilik Uji");
    expect(mentah).not.toContain(tenantId);

    const daftar = (phone: string) =>
      fetch(`${url}/member`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, name: "Sari", follows_store_social: true }),
      });
    const r1 = await daftar("0812-3456-7890");
    expect(r1.status).toBe(201);
    expect((await r1.json()).data.member_code).toMatch(/^M-[0-9A-Z]{6}$/);

    // Nota yang sama tidak bisa dipakai lagi, meski nomornya berbeda.
    const r2 = await daftar("0813-0000-1111");
    expect(r2.status).toBe(409);
    expect((await r2.json()).error.code).toBe("NOTA_SIGNUP_CLOSED");
    expect((await (await fetch(url)).json()).data.member_signup_open).toBe(false);

    // Tenant lain / id asal-asalan: 404 yang sama.
    const salah = await fetch(`${API_URL}/public/v1/nota/01K5TENANT0000000000000000/${saleId}`);
    expect(salah.status).toBe(404);
  });
});
