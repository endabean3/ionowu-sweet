import { type PaperWidth, encodeReceipt } from "@/lib/receipt/escpos";
import type { ReceiptData } from "@/lib/receipt/format";
import { Capacitor, registerPlugin } from "@capacitor/core";

/**
 * Jembatan ke plugin native ThermalPrinter (APK Capacitor, ADR-0010).
 *
 * Seluruh jalur ini lokal: ponsel → Bluetooth → printer. Tidak ada panggilan
 * jaringan, jadi struk tetap tercetak saat kasir offline (CLAUDE.md §6.2).
 */

export interface PairedDevice {
  name: string;
  address: string;
}

export interface SavedPrinter extends PairedDevice {
  paper: PaperWidth;
}

interface ThermalPrinterPlugin {
  listPaired(): Promise<{ devices: PairedDevice[] }>;
  print(options: { address: string; data: string }): Promise<void>;
}

// Nama WAJIB sama dengan @CapacitorPlugin(name = ...) di ThermalPrinterPlugin.java.
const ThermalPrinter = registerPlugin<ThermalPrinterPlugin>("ThermalPrinter");

/**
 * true hanya di APK Android yang benar-benar memuat plugin. Di browser/PWA,
 * dan di APK lama yang dibangun sebelum plugin ini ada, jalur cetak tetap
 * `window.print()`.
 */
export function isBluetoothPrintingAvailable(): boolean {
  return Capacitor.getPlatform() === "android" && Capacitor.isPluginAvailable("ThermalPrinter");
}

// Printer terpasang ke PERANGKAT ini, bukan ke tenant atau kasir — jadi
// disimpan di localStorage perangkat, tidak ikut Dexie/sync.
const STORAGE_KEY = "ionowu.printer";

export function loadSavedPrinter(): SavedPrinter | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (
      typeof p?.name === "string" &&
      typeof p?.address === "string" &&
      (p.paper === 58 || p.paper === 80)
    ) {
      return p;
    }
    return null;
  } catch {
    return null;
  }
}

export function savePrinter(printer: SavedPrinter): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(printer));
  } catch {
    // Penyimpanan diblokir: printer tetap dipakai untuk cetakan ini,
    // kasir hanya perlu memilih ulang lain kali.
  }
}

export async function listPairedDevices(): Promise<PairedDevice[]> {
  const { devices } = await ThermalPrinter.listPaired();
  return devices;
}

export async function printReceiptBluetooth(
  printer: SavedPrinter,
  data: ReceiptData,
): Promise<void> {
  const bytes = encodeReceipt(data, printer.paper);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  await ThermalPrinter.print({ address: printer.address, data: btoa(binary) });
}

/** Pesan dari plugin sudah berbahasa Indonesia dan ditujukan ke kasir. */
export function printerErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string") {
    return err.message;
  }
  return "Kesalahan tidak dikenal.";
}
