import {
  type BarisCetak,
  type PaperWidth,
  encodeReceipt,
  encodeReportLines,
  encodeTestPage,
} from "@/lib/receipt/escpos";
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

// Cetak otomatis sesudah bayar. Bawaan MATI: pembeli warung sering tidak
// meminta struk, dan kertas termal yang terbuang adalah ongkos pemilik.
// Toko yang selalu memberi struk menyalakannya sekali di pengaturan printer.
const AUTO_PRINT_KEY = "ionowu.printer.otomatis";

export function loadAutoPrint(): boolean {
  try {
    return localStorage.getItem(AUTO_PRINT_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveAutoPrint(on: boolean): void {
  try {
    localStorage.setItem(AUTO_PRINT_KEY, on ? "1" : "0");
  } catch {
    // Sama seperti savePrinter: berlaku untuk sesi ini saja.
  }
}

async function sendBytes(printer: SavedPrinter, bytes: Uint8Array): Promise<void> {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  await ThermalPrinter.print({ address: printer.address, data: btoa(binary) });
}

export function printReceiptBluetooth(printer: SavedPrinter, data: ReceiptData): Promise<void> {
  return sendBytes(printer, encodeReceipt(data, printer.paper));
}

export function printTestPageBluetooth(printer: SavedPrinter): Promise<void> {
  return sendBytes(printer, encodeTestPage(printer.paper, printer.name));
}

/**
 * Laporan tutup buku ke printer termal. Barisnya sudah disusun pemanggil
 * (lib/reports/zreport.ts) memakai LEBAR KOLOM printer ini — memanggilnya
 * dengan baris yang disusun untuk lebar lain menghasilkan laporan yang
 * patah di tengah angka.
 */
export function printReportBluetooth(printer: SavedPrinter, baris: BarisCetak[]): Promise<void> {
  return sendBytes(printer, encodeReportLines(baris, printer.paper));
}

/** Pesan dari plugin sudah berbahasa Indonesia dan ditujukan ke kasir. */
export function printerErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string") {
    return err.message;
  }
  return "Kesalahan tidak dikenal.";
}
