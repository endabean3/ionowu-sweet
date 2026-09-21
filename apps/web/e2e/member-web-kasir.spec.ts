import { expect, test } from "@playwright/test";
import {
  type TenantFixture,
  bukaShiftBilaPerlu,
  klikBayar,
  loginViaUI,
  provisionTenant,
  tambahProduk,
} from "./helpers";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

/**
 * Rantai penuh pelanggan → kasir, yang sebelumnya PUTUS di tengah.
 *
 * Pelanggan mendaftar sendiri lewat QR nota di web toko (repo warungwangi),
 * yang memanggil POST /public/v1/nota/.../member. Member itu lahir di
 * SERVER — bukan di antrean perangkat kasir — sedangkan cermin IndexedDB
 * perangkat hanya diperbarui saat /sync/pull, dan sync berkala cuma berjalan
 * bila ada antrean lokal. Akibatnya kasir yang mengetik kode member lima
 * menit kemudian menemukan "tidak ada member yang cocok", dan pelanggan yang
 * baru saja mendaftar ditolak di meja kasir.
 */
test.describe("Member daftar sendiri di web, lalu belanja di kasir", () => {
  let fx: TenantFixture;

  test("kasir menemukan member yang belum pernah tersinkron ke perangkat", async ({ page }) => {
    fx = await provisionTenant();
    await tambahProduk(fx, { name: "Sabun Batang", price: "20000" });
    await loginViaUI(page, fx);
    await page.goto("/kasir");
    await expect(page.getByText("Sabun Batang").first()).toBeVisible({ timeout: 20000 });
    await bukaShiftBilaPerlu(page);

    // Transaksi pertama TANPA member — inilah nota yang QR-nya dipindai.
    await page.getByText("Sabun Batang").first().click();
    await klikBayar(page);
    await page.click("text=Tunai");
    await page.fill("#given_amount", "50000");
    await page.locator('button:has-text("Selesaikan Pembayaran")').click();
    await expect(page.getByText(/^Lunas/).first()).toBeVisible();
    await page.locator('button:has-text("Sinkron")').filter({ visible: true }).first().click();

    const nota = (await page.locator("#receipt-print-root").textContent()) ?? "";
    const idNota = nota.match(/No\. (\w+)/)?.[1];
    expect(idNota).toBeTruthy();

    // Cari id transaksi di server (nomor nota ≠ id, dan endpoint publik
    // memakai id). Antrean sync berjalan di latar, jadi ditunggu sampai
    // notanya benar-benar sampai — bukan dijeda buta.
    const outlet = await outletId(fx);
    let saleId = "";
    await expect
      .poll(
        async () => {
          const r = await fetch(`${API_URL}/sales?outlet_id=${outlet}`, {
            headers: { Authorization: `Bearer ${fx.accessToken}` },
          });
          const b = await r.json();
          saleId = b?.data?.[0]?.id ?? "";
          return saleId;
        },
        { timeout: 30000 },
      )
      .not.toBe("");
    const tenantId = await tenantOf(fx);

    // Pelanggan mendaftar SENDIRI dari halaman nota — tanpa menyentuh kasir.
    const daftarRes = await fetch(`${API_URL}/public/v1/nota/${tenantId}/${saleId}/member`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: "0812-9999-8888",
        name: "Pak Budi",
        follows_store_social: true,
      }),
    });
    expect(daftarRes.status).toBe(201);
    const kode = (await daftarRes.json()).data.member_code as string;
    expect(kode).toMatch(/^M-[A-Z0-9]{6}$/);

    // Kasir tidak pernah memuat ulang aplikasinya. Ia hanya mengetik kode
    // yang ditunjukkan pelanggan di layar HP-nya.
    await page.getByRole("button", { name: /Pilih atau daftar member/ }).click();
    await page.getByLabel("Kode member, nomor WA, atau nama").fill(kode);
    const kartu = page.getByText(/Baru mendaftar — belum tersimpan/);
    await expect(kartu).toBeVisible({ timeout: 15000 });
    await kartu.click();
    await expect(page.getByText(`Member ${kode} dipakai`).first()).toBeVisible();

    // Dan nomor WA-nya juga bisa dipakai, karena pelanggan sering lupa kode.
    await page.getByRole("button", { name: new RegExp(`Member ${kode}`) }).click();
    await page.getByLabel("Kode member, nomor WA, atau nama").fill("081299998888");
    // Dicari DI DALAM dialog: nama member juga tampil di keranjang versi
    // desktop, yang di ponsel tetap ter-render tapi tersembunyi — dan
    // `.first()` polos akan memilih kembaran tersembunyi itu lalu gagal.
    await expect(page.getByRole("dialog").getByText("Pak Budi").first()).toBeVisible({
      timeout: 15000,
    });
  });

  // Gerakan yang paling wajar di meja kasir: memindai barcode kartu member
  // dari layar HP pelanggan langsung ke kolom cari utama.
  test("memindai kartu member ke kolom cari kasir langsung menempelkannya", async ({ page }) => {
    fx = await provisionTenant();
    await tambahProduk(fx, { name: "Sabun Batang", price: "20000" });
    await loginViaUI(page, fx);
    await page.goto("/kasir");
    await expect(page.getByText("Sabun Batang").first()).toBeVisible({ timeout: 20000 });
    await bukaShiftBilaPerlu(page);

    await page.getByText("Sabun Batang").first().click();
    await klikBayar(page);
    await page.click("text=Tunai");
    await page.fill("#given_amount", "50000");
    await page.locator('button:has-text("Selesaikan Pembayaran")').click();
    await expect(page.getByText(/^Lunas/).first()).toBeVisible();
    await page.locator('button:has-text("Sinkron")').filter({ visible: true }).first().click();

    const outlet = await outletId(fx);
    let saleId = "";
    await expect
      .poll(
        async () => {
          const b = await (
            await fetch(`${API_URL}/sales?outlet_id=${outlet}`, {
              headers: { Authorization: `Bearer ${fx.accessToken}` },
            })
          ).json();
          saleId = b?.data?.[0]?.id ?? "";
          return saleId;
        },
        { timeout: 30000 },
      )
      .not.toBe("");

    const res = await fetch(`${API_URL}/public/v1/nota/${await tenantOf(fx)}/${saleId}/member`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "0813-7777-6666", follows_store_social: true }),
    });
    const kode = (await res.json()).data.member_code as string;

    // Pemindai mengetik kode lalu Enter — persis seperti barcode di kartu.
    await page.fill('input[aria-label^="Cari produk"]', kode);
    await expect(page.getByText(`Member ${kode} dipakai`).first()).toBeVisible({ timeout: 15000 });
    // Kolomnya dikosongkan, siap untuk barang berikutnya.
    await expect(page.locator('input[aria-label^="Cari produk"]')).toHaveValue("");
  });

  const outletId = async (f: TenantFixture) =>
    (
      await (
        await fetch(`${API_URL}/outlets`, { headers: { Authorization: `Bearer ${f.accessToken}` } })
      ).json()
    ).data[0].id as string;

  const tenantOf = async (f: TenantFixture) =>
    (
      await (
        await fetch(`${API_URL}/outlets`, { headers: { Authorization: `Bearer ${f.accessToken}` } })
      ).json()
    ).data[0].tenant_id as string;
});
