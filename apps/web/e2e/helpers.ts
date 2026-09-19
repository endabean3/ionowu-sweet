import type { Page } from "@playwright/test";

/**
 * Penyiapan data untuk uji e2e.
 *
 * Tiap uji mendaftarkan tenant-nya SENDIRI lewat API, bukan menumpang data
 * `make seed`. Dua alasan:
 *
 *  1. Password seeder diacak tiap kali dijalankan
 *     (`fmt.Sprintf("Seed!%s%04d", role, rng…)`) dan hanya dicetak ke stdout —
 *     tidak ada nilai tetap yang bisa ditulis di berkas uji. Versi lama berkas
 *     ini memakai `"devpass"`, yang tidak pernah cocok dengan apa pun; itulah
 *     sebabnya seluruh uji e2e tidak pernah benar-benar lulus.
 *  2. Tenant sendiri = uji tidak saling mengganggu dan tidak bergantung pada
 *     urutan jalan.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export interface TenantFixture {
  email: string;
  password: string;
  accessToken: string;
  productName: string;
}

/** Mendaftarkan tenant baru + satu produk siap jual. */
export async function provisionTenant(): Promise<TenantFixture> {
  const unique = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const email = `e2e-${unique}@uji.test`;
  const password = "UjiE2E!rahasia123";
  const productName = "Parfum Refil Melati";

  const regRes = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      organization_name: `Toko Uji ${unique}`,
      outlet_name: `Toko Uji ${unique} - Pusat`,
      owner_name: "Pemilik Uji",
      owner_email: email,
      owner_password: password,
      business_type: "parfum_refill",
    }),
  });
  if (!regRes.ok) {
    throw new Error(`register gagal: ${regRes.status} ${await regRes.text()}`);
  }
  const session = await regRes.json();
  const accessToken: string = session.access_token;

  // Tenant baru tidak punya katalog sama sekali, sedangkan uji perlu sesuatu
  // untuk diklik di layar kasir.
  const prodRes = await fetch(`${API_URL}/products`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      name: productName,
      description: "Dipakai uji e2e",
      variants: [
        {
          name: "30 ml",
          sku: `E2E-${unique}`,
          barcode: "",
          price: "25000",
          cost_price: "10000",
          uom: "ml",
        },
      ],
    }),
  });
  if (!prodRes.ok) {
    throw new Error(`buat produk gagal: ${prodRes.status} ${await prodRes.text()}`);
  }

  return { email, password, accessToken, productName };
}

/** Login lewat UI (email + password — Tenant ID tidak diminta lagi). */
export async function loginViaUI(page: Page, fx: TenantFixture) {
  await page.goto("/login");
  await page.fill('input[type="email"]', fx.email);
  await page.fill('input[type="password"]', fx.password);
  await page.click('button:has-text("Masuk")');
  await page.waitForURL(/\/kasir|\/dashboard/);
}

/** Buka shift kalau modal "Toko Belum Dibuka" sedang tampil. */
export async function bukaShiftBilaPerlu(page: Page, modal = "150000") {
  const tombol = page.locator('button:has-text("Buka Shift Sekarang")');
  if (await tombol.isVisible().catch(() => false)) {
    await page.fill('input[placeholder="100000"]', modal);
    await tombol.click();
    await tombol.waitFor({ state: "hidden" });
  }
}

/**
 * Klik tombol bayar yang TERLIHAT. Layar lebar: "Bayar Sekarang" di keranjang
 * samping. Ponsel (< lg): "Bayar" di bar bawah — keranjang samping
 * disembunyikan dan hanya muncul sebagai panel bawah.
 */
export async function klikBayar(page: Page) {
  await page
    .getByRole("button", { name: /^Bayar/ })
    .filter({ visible: true })
    .first()
    .click();
}
