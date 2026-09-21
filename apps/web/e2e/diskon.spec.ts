import { expect, test } from "@playwright/test";
import {
  type TenantFixture,
  bukaDiskon,
  bukaShiftBilaPerlu,
  klikBayar,
  loginViaUI,
  pinUji,
  provisionTenant,
  tambahProduk,
  teksTerlihat,
} from "./helpers";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

/**
 * Diskon seluruh transaksi. Sebelum ini nilainya SELALU "0" — tidak ada
 * cara memberi potongan sama sekali, padahal server sudah menerimanya.
 */
const NAMA = "Sabun Batang";
const HARGA = "20000";

test.describe("Diskon transaksi", () => {
  let fx: TenantFixture;

  test.beforeEach(async ({ page }) => {
    fx = await provisionTenant();
    await tambahProduk(fx, { name: NAMA, price: HARGA });
    await loginViaUI(page, fx);
    await page.goto("/kasir");
    await expect(page.getByText(NAMA).first()).toBeVisible({ timeout: 20000 });
    await bukaShiftBilaPerlu(page);
    await page.getByText(NAMA).first().click();
  });

  test("nominal rupiah mengurangi total dan tercetak di nota", async ({ page }) => {
    await bukaDiskon(page);
    const dialog = page.getByRole("dialog", { name: "Diskon transaksi" });
    await dialog.getByLabel("Diskon", { exact: true }).fill("5000");
    await dialog.getByRole("button", { name: "Simpan diskon" }).click();

    // Total turun dari 20.000 ke 15.000.
    await expect(teksTerlihat(page, "15.000")).toBeVisible();

    await klikBayar(page);
    await page.click("text=Tunai");
    await page.fill("#given_amount", "20000");
    await page.locator('button:has-text("Selesaikan Pembayaran")').click();
    await expect(page.getByText(/^Lunas/).first()).toBeVisible();

    const nota = (await page.locator("#receipt-print-root").textContent()) ?? "";
    expect(nota).toContain("Diskon");
    expect(nota).toContain("-Rp 5.000");
    expect(nota).toContain("Rp 15.000");

    // Dan SERVER menerimanya. Tanpa pemeriksaan ini uji tetap hijau meski
    // server menolak PAYMENT_AMOUNT_MISMATCH — sebab nota dicetak dari
    // hitungan perangkat, dan transaksi yang ditolak hanya mengendap diam
    // di antrean. Total klien dan server harus sepakat soal diskon.
    await page.locator('button:has-text("Sinkron")').filter({ visible: true }).first().click();
    const outlet = (
      await (
        await fetch(`${API_URL}/outlets`, {
          headers: { Authorization: `Bearer ${fx.accessToken}` },
        })
      ).json()
    ).data[0].id as string;
    await expect
      .poll(
        async () => {
          const b = await (
            await fetch(`${API_URL}/sales?outlet_id=${outlet}`, {
              headers: { Authorization: `Bearer ${fx.accessToken}` },
            })
          ).json();
          return Number(b?.data?.[0]?.grand_total ?? -1);
        },
        { timeout: 30000 },
      )
      .toBe(15000);
  });

  test("persen dihitung dari subtotal", async ({ page }) => {
    await bukaDiskon(page);
    const dialog = page.getByRole("dialog", { name: "Diskon transaksi" });
    await dialog.getByLabel("Diskon", { exact: true }).fill("10%");
    // Pratinjau menyebut nominalnya sebelum disimpan.
    await expect(dialog.getByText(/Potongan Rp 2\.000/)).toBeVisible();
    await dialog.getByRole("button", { name: "Simpan diskon" }).click();
    await expect(teksTerlihat(page, "18.000")).toBeVisible();
  });

  test("diskon melebihi belanja ditolak sebelum disimpan", async ({ page }) => {
    await bukaDiskon(page);
    const dialog = page.getByRole("dialog", { name: "Diskon transaksi" });
    await dialog.getByLabel("Diskon", { exact: true }).fill("50000");
    await expect(dialog.getByText("Diskon tidak boleh melebihi total belanja")).toBeVisible();
    await expect(dialog.getByRole("button", { name: /Simpan diskon|Minta PIN/ })).toBeDisabled();
  });

  // Owner menyetujui dirinya sendiri (RBAC-MODEL §Matriks).
  test("owner boleh memberi diskon besar tanpa PIN", async ({ page }) => {
    await bukaDiskon(page);
    const dialog = page.getByRole("dialog", { name: "Diskon transaksi" });
    await dialog.getByLabel("Diskon", { exact: true }).fill("50%");
    await expect(dialog.getByRole("button", { name: "Simpan diskon" })).toBeVisible();
    await dialog.getByRole("button", { name: "Simpan diskon" }).click();
    await expect(teksTerlihat(page, "10.000")).toBeVisible();
  });
});

test.describe("Diskon besar oleh kasir", () => {
  const PIN = pinUji();
  const PASS_KASIR = "KasirUji!rahasia1";

  test("di atas 20% wajib PIN manager", async ({ page }) => {
    const fx = await provisionTenant();
    await tambahProduk(fx, { name: NAMA, price: HARGA });
    const email = `kasir-${Date.now()}${Math.floor(Math.random() * 1000)}@uji.test`;
    const h = { "Content-Type": "application/json", Authorization: `Bearer ${fx.accessToken}` };
    await fetch(`${API_URL}/users`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({ name: "Kasir Uji", email, password: PASS_KASIR, role: "cashier" }),
    });
    await fetch(`${API_URL}/me/pin`, {
      method: "PATCH",
      headers: h,
      body: JSON.stringify({ password: fx.password, pin: PIN }),
    });

    await loginViaUI(page, { ...fx, email, password: PASS_KASIR });
    await page.goto("/kasir");
    await expect(page.getByText(NAMA).first()).toBeVisible({ timeout: 20000 });
    await bukaShiftBilaPerlu(page);
    await page.getByText(NAMA).first().click();

    // 20% masih bebas.
    await bukaDiskon(page);
    let dialog = page.getByRole("dialog", { name: "Diskon transaksi" });
    await dialog.getByLabel("Diskon", { exact: true }).fill("20%");
    await expect(dialog.getByRole("button", { name: "Simpan diskon" })).toBeVisible();

    // 25% memicu gerbang PIN.
    await dialog.getByLabel("Diskon", { exact: true }).fill("25%");
    await expect(dialog.getByText(/butuh PIN manager/)).toBeVisible();
    await dialog.getByRole("button", { name: "Minta PIN manager" }).click();

    const pinDialog = page.getByRole("dialog", { name: "Diskon butuh PIN manager" });
    await pinDialog.getByRole("textbox", { name: "PIN manager" }).fill(PIN);
    await pinDialog.getByRole("button", { name: "Setujui" }).click();
    await expect(page.getByText("Diskon disetujui manager")).toBeVisible({ timeout: 15000 });
    await expect(teksTerlihat(page, "15.000")).toBeVisible();

    // PIN salah tidak mengubah diskon yang berlaku.
    await bukaDiskon(page);
    dialog = page.getByRole("dialog", { name: "Diskon transaksi" });
    await dialog.getByLabel("Diskon", { exact: true }).fill("80%");
    await dialog.getByRole("button", { name: "Minta PIN manager" }).click();
    const pin2 = page.getByRole("dialog", { name: "Diskon butuh PIN manager" });
    await pin2.getByRole("textbox", { name: "PIN manager" }).fill("000000");
    await pin2.getByRole("button", { name: "Setujui" }).click();
    await expect(page.getByText("PIN salah")).toBeVisible({ timeout: 15000 });
    await expect(teksTerlihat(page, "15.000")).toBeVisible();
  });
});
