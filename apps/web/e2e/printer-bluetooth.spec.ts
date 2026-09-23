import { type Page, expect, test } from "@playwright/test";
import {
  type TenantFixture,
  bukaShiftBilaPerlu,
  klikBayar,
  loginViaUI,
  pilihTunai,
  provisionTenant,
} from "./helpers";

/**
 * Jalur cetak APK (printer termal Bluetooth), diuji di browser.
 *
 * Plugin native ThermalPrinter tidak bisa berjalan di Chromium, tetapi
 * seluruh logika yang sering rusak ada di sisi JS: kapan printer diminta,
 * apa yang terjadi saat gagal, cetak otomatis, dan ketukan ganda. Uji ini
 * memasang JEMBATAN NATIVE PALSU sebelum halaman dimuat — persis dua hal
 * yang dipakai @capacitor/core untuk mengenali APK Android:
 *
 *  - `window.androidBridge` ada → `Capacitor.getPlatform() === "android"`
 *  - `Capacitor.PluginHeaders` memuat ThermalPrinter → plugin "tersedia",
 *    dan setiap panggilannya dialirkan ke `Capacitor.nativePromise`.
 *
 * Yang TIDAK diuji di sini: soket RFCOMM, izin Android, dan printer
 * sungguhan. Itu hanya bisa dibuktikan di ponsel (runbook deploy §5 D).
 */

interface PrinterPalsu {
  printed: string[];
  failNext: boolean;
  delayMs: number;
}

declare global {
  interface Window {
    __printer: PrinterPalsu;
  }
}

async function pasangJembatanPalsu(page: Page) {
  await page.addInitScript(() => {
    const state: PrinterPalsu = { printed: [], failNext: false, delayMs: 50 };
    window.__printer = state;
    // biome-ignore lint/suspicious/noExplicitAny: meniru objek global yang disuntik WebView
    (window as any).androidBridge = { postMessage: () => {} };
    // biome-ignore lint/suspicious/noExplicitAny: idem
    (window as any).Capacitor = {
      PluginHeaders: [
        {
          name: "ThermalPrinter",
          methods: [
            { name: "listPaired", rtype: "promise" },
            { name: "print", rtype: "promise" },
          ],
        },
      ],
      nativePromise: async (plugin: string, method: string, options: { data?: string }) => {
        if (plugin !== "ThermalPrinter") throw new Error(`plugin tak dikenal: ${plugin}`);
        await new Promise((r) => setTimeout(r, state.delayMs));
        if (method === "listPaired") {
          return { devices: [{ name: "RPP02N", address: "00:11:22:33:44:55" }] };
        }
        if (method === "print") {
          if (state.failNext) {
            state.failNext = false;
            throw { message: "Tidak bisa terhubung ke printer.", code: "PRINT_FAILED" };
          }
          state.printed.push(atob(options.data ?? ""));
          return {};
        }
        throw new Error(`metode tak dikenal: ${method}`);
      },
    };
  });
}

const cetakan = (page: Page) => page.evaluate(() => window.__printer.printed);

async function jualSatu(page: Page, fx: TenantFixture) {
  await page.getByText(fx.productName).first().click();
  await klikBayar(page);
  await pilihTunai(page);
  await page.fill("#given_amount", "50000");
  await page.locator('button:has-text("Selesaikan Pembayaran")').click();
  await expect(page.getByText(/^Lunas/)).toBeVisible();
}

test.describe("Printer Bluetooth (APK)", () => {
  let fx: TenantFixture;

  test.beforeEach(async ({ page }) => {
    fx = await provisionTenant();
    await pasangJembatanPalsu(page);
    await loginViaUI(page, fx);
    await page.goto("/kasir");
    await expect(page.getByText(fx.productName).first()).toBeVisible({ timeout: 20000 });
    await bukaShiftBilaPerlu(page);
  });

  test("pilih printer, cetak uji, lalu struk bisa dicetak ulang kapan saja", async ({ page }) => {
    // Printer bisa diatur SEBELUM transaksi pertama — dulu layar ini hanya
    // bisa dicapai lewat struk yang gagal dicetak.
    await page.getByRole("button", { name: /Pengaturan printer/ }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /RPP02N/ })
      .click();
    await expect(page.getByRole("dialog").getByRole("button", { name: /RPP02N/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByRole("button", { name: "Cetak uji" }).click();
    await expect(page.getByText(/Cetak uji terkirim/).last()).toBeVisible();
    expect((await cetakan(page))[0]).toContain("CETAK UJI");
    await page.getByRole("button", { name: "Selesai" }).click();

    await jualSatu(page, fx);
    // Bawaan: TIDAK cetak otomatis.
    expect(await cetakan(page)).toHaveLength(1);

    // Tombol di toast boleh terlewat; tombol di bar struk terakhir tetap ada.
    await page.getByRole("button", { name: "Cetak", exact: true }).first().click();
    await expect(page.getByText("Struk tercetak").last()).toBeVisible();
    const struk = (await cetakan(page))[1];
    expect(struk).toContain("TOTAL");
    expect(struk).toContain(fx.productName);
  });

  test("gagal cetak menawarkan Coba lagi dan tidak mencetak dua kali", async ({ page }) => {
    await page.getByRole("button", { name: /Pengaturan printer/ }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /RPP02N/ })
      .click();
    await page.getByRole("button", { name: "Selesai" }).click();
    await jualSatu(page, fx);

    await page.evaluate(() => {
      window.__printer.failNext = true;
    });
    const tombolCetak = page.getByRole("button", { name: "Cetak", exact: true }).first();
    await tombolCetak.click();
    await expect(page.getByText(/Gagal mencetak ke RPP02N/).last()).toBeVisible();
    await page.getByRole("button", { name: "Coba lagi" }).click();
    await expect(page.getByText("Struk tercetak").last()).toBeVisible();
    expect(await cetakan(page)).toHaveLength(1);

    // Ketukan ganda saat koneksi Bluetooth masih dibuka: satu struk saja.
    // Dua click() SINKRON dalam satu frame — sebelum React sempat
    // menonaktifkan tombolnya. Inilah yang diuji: penjaga ref di hook, bukan
    // atribut disabled. (Dua klik Playwright tidak menguji ini: klik kedua
    // menunggu tombol aktif lagi, yaitu SETELAH cetakan pertama selesai.)
    await page.evaluate(() => {
      window.__printer.delayMs = 1500;
      const tombol = [...document.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === "Cetak" && b.offsetParent !== null,
      );
      if (!tombol) throw new Error("tombol Cetak tidak terlihat");
      tombol.click();
      tombol.click();
    });
    await expect(page.getByText("Struk tercetak").last()).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(2000);
    expect(await cetakan(page)).toHaveLength(2);
  });

  test("cetak otomatis mencetak struk tanpa ketukan tambahan", async ({ page }) => {
    await page.getByRole("button", { name: /Pengaturan printer/ }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /RPP02N/ })
      .click();
    await page.getByRole("switch", { name: /Cetak struk otomatis/ }).check();
    await page.getByRole("button", { name: "Selesai" }).click();

    await page.getByText(fx.productName).first().click();
    await klikBayar(page);
    await pilihTunai(page);
    await page.fill("#given_amount", "50000");
    await page.locator('button:has-text("Selesaikan Pembayaran")').click();

    await expect(page.getByText("Struk tercetak").last()).toBeVisible();
    expect(await cetakan(page)).toHaveLength(1);
  });
});
