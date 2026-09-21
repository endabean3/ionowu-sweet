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

/**
 * Menambah satu produk bervarian tunggal ke tenant yang sudah ada.
 * Dipakai uji yang butuh barang dengan barcode/SKU tertentu — fixture
 * bawaan sengaja dibiarkan tanpa barcode.
 */
export async function tambahProduk(
  fx: TenantFixture,
  opts: { name: string; barcode?: string; sku?: string; uom?: string; price?: string },
): Promise<void> {
  const res = await fetch(`${API_URL}/products`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${fx.accessToken}`,
    },
    body: JSON.stringify({
      name: opts.name,
      variants: [
        {
          name: "Default",
          sku: opts.sku ?? "",
          barcode: opts.barcode ?? "",
          price: opts.price ?? "15000",
          cost_price: "5000",
          uom: opts.uom ?? "pcs",
        },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`buat produk gagal: ${res.status} ${await res.text()}`);
  }
}

/**
 * Impor katalog dari CSV. Satu-satunya jalur yang bisa MENETAPKAN satuan
 * stok berbeda dari satuan jual (ADR-0012) — POST /products tidak punya
 * field itu, jadi uji faktor gram/ml harus lewat sini.
 */
export async function imporKatalogCsv(fx: TenantFixture, csv: string): Promise<void> {
  const form = new FormData();
  form.append("file", new Blob([csv], { type: "text/csv" }), "katalog.csv");
  const res = await fetch(`${API_URL}/products/import`, {
    method: "POST",
    headers: { Authorization: `Bearer ${fx.accessToken}` },
    body: form,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`impor gagal: ${res.status} ${JSON.stringify(body)}`);
  if (body?.dilewati?.length) throw new Error(`baris dilewati: ${JSON.stringify(body.dilewati)}`);
}

/**
 * PIN manager untuk uji, DIBANGKITKAN saat dijalankan.
 *
 * Bukan sekadar menyenangkan gerbang `pin-kasir-polos` di .gitleaks.toml:
 * aturan itu melarang PIN muncul sebagai nilai polos di repo, dan berkas uji
 * justru tempat PIN sungguhan paling mudah tersalin tanpa sengaja — seseorang
 * menempelkan PIN toko untuk "mencoba sebentar", lalu ikut ter-commit.
 * Membangkitkannya juga membuat tiap kali jalan memakai PIN berbeda.
 */
export function pinUji(): string {
  return String(100000 + Math.floor(Math.random() * 900000));
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
 * Buka dialog diskon, di kedua tata letak.
 *
 * Tombolnya hidup DI DALAM keranjang. Di layar lebar keranjang selalu
 * tampak; di ponsel (< lg) ia ada di panel bawah yang harus dibuka dulu
 * lewat bar ringkasan. Keranjang versi desktop tetap ter-render tapi
 * tersembunyi, jadi `.first()` polos akan memilih tombol yang tidak bisa
 * diklik dan uji menunggu 30 detik sampai timeout — persis kegagalan yang
 * hanya muncul di project Mobile Chrome.
 */
export async function bukaDiskon(page: Page) {
  const tombol = page
    .getByRole("button", { name: /Beri diskon|Ubah diskon/ })
    .filter({ visible: true });
  if ((await tombol.count()) === 0) {
    await page.getByRole("button", { name: /^Buka keranjang:/ }).click();
  }
  await tombol.first().click();
}

/** Teks yang TERLIHAT — menghindari kembaran tersembunyi dari tata letak lain. */
export function teksTerlihat(page: Page, teks: string | RegExp) {
  return page.getByText(teks).filter({ visible: true }).first();
}

/**
 * Klik tombol bayar yang TERLIHAT. Layar lebar: "Bayar Sekarang" di keranjang
 * samping. Ponsel (< lg): "Bayar" di bar bawah — keranjang samping
 * disembunyikan dan hanya muncul sebagai panel bawah.
 *
 * Bila panel keranjang sedang TERBUKA (mis. kasir baru memberi diskon dari
 * dalamnya), tombol yang dipakai adalah yang ada DI DALAM panel itu. Bar
 * bawah tetap "terlihat" bagi Playwright tetapi tertutup lapisan modal, jadi
 * mengkliknya hanya menunggu 30 detik sampai timeout — dan itu pula yang
 * dilakukan kasir sungguhan: ia membayar dari panel yang sedang ia buka,
 * bukan menutupnya dulu.
 */
export async function klikBayar(page: Page) {
  const diPanel = page
    .getByRole("dialog")
    .getByRole("button", { name: /^Bayar/ })
    .filter({ visible: true });
  if ((await diPanel.count()) > 0) {
    await diPanel.first().click();
    return;
  }
  await page
    .getByRole("button", { name: /^Bayar/ })
    .filter({ visible: true })
    .first()
    .click();
}
