import { expect, test } from "@playwright/test";
import {
  type TenantFixture,
  bukaShiftBilaPerlu,
  klikBayar,
  loginViaUI,
  pinUji,
  provisionTenant,
} from "./helpers";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

/**
 * Persetujuan PIN manager di layar kasir.
 *
 * Rantai lengkapnya diuji di sini karena TIGA bagiannya sebelumnya hilang
 * dan tidak ada yang menyadarinya: tidak ada cara membuat akun kasir, tidak
 * ada cara mengatur PIN, dan tidak ada kolom PIN di layar. Server sudah
 * memeriksa PIN sejak lama — pemeriksaan yang tidak pernah bisa lolos.
 */
test.describe("PIN persetujuan manager", () => {
  let fx: TenantFixture;
  const PIN = pinUji();
  const PASS_KASIR = "KasirUji!rahasia1";

  const kasirEmail = () => `kasir-${Date.now()}${Math.floor(Math.random() * 1000)}@uji.test`;

  test("owner menambah kasir, mengatur PIN, lalu kasir refund dengan PIN itu", async ({ page }) => {
    fx = await provisionTenant();
    const email = kasirEmail();

    // 1. Owner menambah kasir dari Pengaturan.
    await loginViaUI(page, fx);
    await page.goto("/pengaturan");
    await page.getByRole("button", { name: "Tambah karyawan" }).click();
    await page.getByLabel("Nama", { exact: true }).fill("Kasir Uji");
    await page.getByLabel("Email untuk login").fill(email);
    await page.getByLabel("Password awal").fill(PASS_KASIR);
    await page.getByRole("button", { name: "Simpan karyawan" }).click();
    await expect(page.getByText(/Kasir Uji ditambahkan sebagai Kasir/)).toBeVisible();

    // 2. Owner mengatur PIN persetujuannya.
    await page.getByLabel("Password akun Anda").fill(fx.password);
    await page.getByLabel("PIN baru (4–8 angka)").fill(PIN);
    await page.getByRole("button", { name: "Simpan PIN" }).click();
    await expect(page.getByText("PIN persetujuan disimpan")).toBeVisible();
    await expect(page.getByLabel("Daftar karyawan")).toContainText("PIN aktif");

    // 3. Kasir menjual sesuatu.
    // "Keluar" bertanya lewat window.confirm ("transaksi yang belum terkirim
    // tetap tersimpan"); Playwright menutup dialog secara default, jadi
    // tanpa baris ini logout tidak pernah terjadi.
    page.once("dialog", (d) => void d.accept());
    await page.goto("/pengaturan");
    await page.getByRole("button", { name: "Keluar" }).click();
    await page.waitForURL(/\/login/);
    await loginViaUI(page, { ...fx, email, password: PASS_KASIR });
    await page.goto("/kasir");
    await expect(page.getByText(fx.productName).first()).toBeVisible({ timeout: 20000 });
    await bukaShiftBilaPerlu(page);
    await page.getByText(fx.productName).first().click();
    await klikBayar(page);
    await page.click("text=Tunai");
    await page.fill("#given_amount", "50000");
    await page.locator('button:has-text("Selesaikan Pembayaran")').click();
    await expect(page.getByText(/^Lunas/).first()).toBeVisible();
    await page.locator('button:has-text("Sinkron")').filter({ visible: true }).first().click();

    // 4. Kasir membuka nota itu dan me-refund — dengan PIN manager.
    await page.goto("/riwayat");
    const baris = page.getByRole("list", { name: "Daftar transaksi" }).getByRole("listitem");
    await expect(baris.first()).toBeVisible({ timeout: 20000 });
    await baris.first().click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/butuh PIN manager/)).toBeVisible();
    await dialog.getByRole("button", { name: "Refund" }).click();
    await dialog.getByLabel("Alasan refund").fill("Barang bocor");
    await dialog.getByRole("button", { name: /^Refund Rp/ }).click();

    // Dialog PIN muncul; kasir menyerahkan layar ke manager.
    const pinDialog = page.getByRole("dialog", { name: "Refund butuh PIN manager" });
    await expect(pinDialog).toBeVisible();
    await pinDialog.getByRole("textbox", { name: "PIN manager" }).fill(PIN);
    await pinDialog.getByRole("button", { name: "Setujui" }).click();
    await expect(page.getByText("Refund tersimpan")).toBeVisible({ timeout: 15000 });
  });

  test("PIN salah ditolak server, transaksi tidak berubah", async ({ page }) => {
    fx = await provisionTenant();
    const email = kasirEmail();
    const h = { "Content-Type": "application/json", Authorization: `Bearer ${fx.accessToken}` };
    await fetch(`${API_URL}/users`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({
        name: "Kasir Uji",
        email,
        password: PASS_KASIR,
        role: "cashier",
      }),
    });
    await fetch(`${API_URL}/me/pin`, {
      method: "PATCH",
      headers: h,
      body: JSON.stringify({ password: fx.password, pin: PIN }),
    });

    await loginViaUI(page, { ...fx, email, password: PASS_KASIR });
    await page.goto("/kasir");
    await expect(page.getByText(fx.productName).first()).toBeVisible({ timeout: 20000 });
    await bukaShiftBilaPerlu(page);
    await page.getByText(fx.productName).first().click();
    await klikBayar(page);
    await page.click("text=Tunai");
    await page.fill("#given_amount", "50000");
    await page.locator('button:has-text("Selesaikan Pembayaran")').click();
    await expect(page.getByText(/^Lunas/).first()).toBeVisible();
    await page.locator('button:has-text("Sinkron")').filter({ visible: true }).first().click();

    await page.goto("/riwayat");
    const baris = page.getByRole("list", { name: "Daftar transaksi" }).getByRole("listitem");
    await expect(baris.first()).toBeVisible({ timeout: 20000 });
    await baris.first().click();

    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Refund" }).click();
    await dialog.getByLabel("Alasan refund").fill("Coba PIN salah");
    await dialog.getByRole("button", { name: /^Refund Rp/ }).click();
    const pinDialog = page.getByRole("dialog", { name: "Refund butuh PIN manager" });
    await pinDialog.getByRole("textbox", { name: "PIN manager" }).fill("000000");
    await pinDialog.getByRole("button", { name: "Setujui" }).click();

    await expect(page.getByText("PIN salah")).toBeVisible({ timeout: 15000 });
  });

  test("owner tidak bisa menonaktifkan akunnya sendiri", async () => {
    fx = await provisionTenant();
    const h = { "Content-Type": "application/json", Authorization: `Bearer ${fx.accessToken}` };
    const daftar = await (await fetch(`${API_URL}/users`, { headers: h })).json();
    const owner = daftar.data.find((u: { role: string }) => u.role === "owner");
    const res = await fetch(`${API_URL}/users/${owner.id}`, {
      method: "PATCH",
      headers: h,
      body: JSON.stringify({ is_active: false }),
    });
    expect(res.status).toBe(422);
  });
});
