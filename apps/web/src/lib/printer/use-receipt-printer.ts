"use client";

import type { ReceiptData } from "@/lib/receipt/format";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  type SavedPrinter,
  isBluetoothPrintingAvailable,
  loadAutoPrint,
  loadSavedPrinter,
  printReceiptBluetooth,
  printTestPageBluetooth,
  printerErrorMessage,
  saveAutoPrint,
  savePrinter,
} from "./bluetooth";

/**
 * Satu-satunya jalur cetak di layar kasir.
 *
 * Sebelumnya "Cetak Struk" hanya berupa tombol di dalam toast yang hilang
 * sendiri beberapa detik setelah bayar. Kasir yang sedang menghitung
 * kembalian melewatkannya, dan tidak ada jalan lain untuk mencetak struk itu.
 * Koneksi Bluetooth juga butuh 2–5 detik tanpa tanda apa pun di layar,
 * sehingga kasir mengetuk lagi dan struk tercetak dua kali.
 *
 * Hook ini menjamin:
 *  - hanya satu cetakan berjalan pada satu waktu (ref, bukan state, supaya
 *    dua ketukan dalam satu frame tetap tertahan);
 *  - status "Mencetak…" terlihat dan berakhir dengan berhasil ATAU gagal
 *    yang bisa diulang;
 *  - struk yang menunggu printer dipilih langsung dicetak begitu dipilih.
 *
 * Kegagalan cetak tidak pernah menyentuh transaksi — penjualan sudah
 * tersimpan sebelum struk bisa dicetak.
 */
export function useReceiptPrinter() {
  // null sampai terpasang: localStorage dan plugin Capacitor tidak ada saat
  // render di server, dan membacanya saat render membuat hidrasi tidak cocok.
  const [bluetooth, setBluetooth] = useState<boolean | null>(null);
  const [printer, setPrinter] = useState<SavedPrinter | null>(null);
  const [autoPrint, setAutoPrintState] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const busy = useRef(false);
  const pending = useRef<ReceiptData | null>(null);
  // Ditaruh di ref supaya tombol "Coba lagi" di toast lama selalu mengulang
  // cetakan TERAKHIR yang gagal, bukan penutup (closure) yang sudah basi.
  const kerjaUlang = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    setBluetooth(isBluetoothPrintingAvailable());
    setPrinter(loadSavedPrinter());
    setAutoPrintState(loadAutoPrint());
  }, []);

  const jalankan = useCallback(
    async (
      target: SavedPrinter,
      kerja: () => Promise<void>,
      berhasil: string,
      gantiPrinter: () => void,
    ) => {
      if (busy.current) return;
      busy.current = true;
      setPrinting(true);
      const id = toast.loading(`Mencetak ke ${target.name}…`);
      try {
        await kerja();
        toast.success(berhasil, { id });
      } catch (err) {
        toast.error(`Gagal mencetak ke ${target.name}`, {
          id,
          description: printerErrorMessage(err),
          // Tetap terlihat sampai kasir memutuskan: kegagalan yang hilang
          // sendiri sama dengan struk yang hilang tanpa jejak.
          duration: Number.POSITIVE_INFINITY,
          action: { label: "Coba lagi", onClick: () => void kerjaUlang.current?.() },
          cancel: { label: "Ganti printer", onClick: gantiPrinter },
        });
      } finally {
        busy.current = false;
        setPrinting(false);
      }
    },
    [],
  );

  const cetak = useCallback(
    async (data: ReceiptData, target: SavedPrinter | null = printer) => {
      if (!isBluetoothPrintingAvailable()) {
        // PWA/browser: dialog cetak sistem, lewat <Receipt> yang sudah
        // dirender dari struk terakhir.
        window.print();
        return;
      }
      if (!target) {
        pending.current = data;
        setPickerOpen(true);
        return;
      }
      kerjaUlang.current = () => cetak(data, target);
      await jalankan(
        target,
        () => printReceiptBluetooth(target, data),
        "Struk tercetak",
        () => {
          // Struk yang gagal ikut dibawa: begitu printer lain dipilih, ia
          // langsung dicetak di sana tanpa kasir mengulang dari awal.
          pending.current = data;
          setPickerOpen(true);
        },
      );
    },
    [printer, jalankan],
  );

  const cetakUji = useCallback(
    async (target: SavedPrinter) => {
      kerjaUlang.current = () => cetakUji(target);
      await jalankan(
        target,
        () => printTestPageBluetooth(target),
        "Cetak uji terkirim — periksa penggaris angkanya",
        () => setPickerOpen(true),
      );
    },
    [jalankan],
  );

  const pilihPrinter = useCallback(
    (p: SavedPrinter) => {
      savePrinter(p);
      setPrinter(p);
      const menunggu = pending.current;
      pending.current = null;
      if (menunggu) {
        setPickerOpen(false);
        void cetak(menunggu, p);
      }
    },
    [cetak],
  );

  const setAutoPrint = useCallback((on: boolean) => {
    saveAutoPrint(on);
    setAutoPrintState(on);
  }, []);

  const tutupPicker = useCallback(() => {
    // Menutup tanpa memilih = kasir memutuskan tidak mencetak struk itu.
    pending.current = null;
    setPickerOpen(false);
  }, []);

  return {
    /** null = belum diketahui (sebelum terpasang). */
    bluetooth,
    printer,
    autoPrint,
    printing,
    pickerOpen,
    bukaPicker: () => setPickerOpen(true),
    tutupPicker,
    pilihPrinter,
    setAutoPrint,
    cetak,
    cetakUji,
  };
}

export type ReceiptPrinter = ReturnType<typeof useReceiptPrinter>;
