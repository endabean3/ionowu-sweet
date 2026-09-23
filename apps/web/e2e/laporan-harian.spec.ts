import { expect, test } from "@playwright/test";
import {
  type TenantFixture,
  bukaShiftBilaPerlu,
  klikBayar,
  loginViaUI,
  pilihTunai,
  provisionTenant,
  tambahProduk,
} from "./helpers";

/**
 * Laporan tutup buku (Z-Report). Yang diuji di sini bukan tampilannya,
 * melainkan bahwa angkanya BENAR dan bahwa pratinjau = hasil cetak.
 */
const NAMA = "Sabun Cuci Tangan";
const HARGA = "15000";

test.describe("Tutup buku", () => {
  let fx: TenantFixture;

  test.beforeEach(async ({ page }) => {
    fx = await provisionTenant();
    await tambahProduk(fx, { name: NAMA, price: HARGA });
    await loginViaUI(page, fx);
    await page.goto("/kasir");
    await expect(page.getByText(NAMA).first()).toBeVisible({ timeout: 20000 });
    await bukaShiftBilaPerlu(page, "200000");
  });

  const jual = async (page: import("@playwright/test").Page) => {
    await page.getByText(NAMA).first().click();
    await klikBayar(page);
    await pilihTunai(page);
    await page.fill("#given_amount", "50000");
    await page.locator('button:has-text("Selesaikan Pembayaran")').click();
    await expect(page.getByText(/^Lunas/).first()).toBeVisible();
    // Transaksi masuk antrean IndexedDB dulu; laporan membaca SERVER.
    await page.locator('button:has-text("Sinkron")').filter({ visible: true }).first().click();
  };

  test("menjumlahkan penjualan hari ini dan menyusun pratinjau cetak", async ({ page }) => {
    await jual(page);
    await jual(page);

    await page.goto("/laporan-harian");
    const pratinjau = page.getByLabel("Pratinjau laporan tutup buku");
    await expect(pratinjau).toBeVisible({ timeout: 20000 });

    // Antrean sinkron berjalan sendiri di latar; muat ulang sampai kedua
    // transaksi terlihat, bukan menunggu dengan jeda buta.
    await expect
      .poll(
        async () => {
          await page.getByRole("button", { name: "Muat ulang laporan" }).click();
          return (await pratinjau.textContent()) ?? "";
        },
        { timeout: 30000 },
      )
      .toContain("Tunai (2)");

    const teks = (await pratinjau.textContent()) ?? "";
    expect(teks).toContain("LAPORAN TUTUP BUKU");
    // 2 x Rp 15.000 tunai.
    expect(teks).toContain("Rp 30.000");
    expect(teks).toContain("Tunai (2)");
    // Modal awal shift ikut dilaporkan.
    expect(teks).toContain("Rp 200.000");
    // Void & refund tetap tercetak walau nol — baris yang hilang tidak bisa
    // dibedakan dari fitur yang rusak.
    expect(teks).toContain("Void (0)");
    expect(teks).toContain("Refund (0)");
    // Shift masih terbuka: laporan wajib mengatakannya, bukan menampilkan
    // kas dihitung Rp 0 yang terbaca seperti laci kosong.
    expect(teks).toContain("MASIH TERBUKA");

    await expect(page.getByLabel("Ringkasan Penjualan bersih")).toContainText("Rp 30.000");
    await expect(page.getByLabel("Ringkasan Transaksi")).toContainText("2");
  });

  test("hari tanpa transaksi tetap menghasilkan laporan yang terbaca", async ({ page }) => {
    await page.goto("/laporan-harian");
    await page.getByRole("button", { name: "Kemarin" }).click();

    const pratinjau = page.getByLabel("Pratinjau laporan tutup buku");
    await expect(pratinjau).toBeVisible({ timeout: 20000 });
    const teks = (await pratinjau.textContent()) ?? "";
    expect(teks).toContain("Belum ada pembayaran.");
    expect(teks).toContain("Tidak ada shift di periode ini.");
    expect(teks).toContain("Belum ada barang terjual.");
    // Tanpa transaksi terlambat, bagiannya tidak dicetak sama sekali.
    expect(teks).not.toContain("TERLAMBAT");
  });
});
