"use client";

import { CameraOff, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * Pemindai barcode memakai kamera HP.
 *
 * Memakai `BarcodeDetector` bawaan WebView — bukan plugin native. Diuji
 * langsung di Redmi 9A (WebView 151): 13 format tersedia, termasuk `qr_code`
 * dan `code_128`, yaitu dua simbol yang dicetak di stiker produk.
 *
 * Keduanya sama-sama dibaca sekaligus, jadi kasir tidak perlu tahu stiker itu
 * jenis apa.
 *
 * CATATAN PENTING: `BarcodeDetector` dan `getUserMedia` HANYA ada di secure
 * context. APK aman karena Capacitor menyajikan dari `https://localhost`, dan
 * situs produksi memakai HTTPS. Membukanya lewat `http://<IP>` saat
 * pengembangan membuat KEDUANYA hilang — yang tampak seperti "HP-nya tidak
 * mendukung", padahal cuma alamatnya.
 */

type Detected = { rawValue: string };
type Detector = { detect(src: CanvasImageSource): Promise<Detected[]> };
type DetectorCtor = {
  new (opts?: { formats?: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
};

const FORMAT = ["qr_code", "code_128"];

/** Jeda antar pemeriksaan bingkai. */
const JEDA_MS = 200;

function ctor(): DetectorCtor | null {
  const w = window as unknown as { BarcodeDetector?: DetectorCtor };
  return w.BarcodeDetector ?? null;
}

/** Apakah perangkat ini bisa memindai sama sekali. */
export function bisaPindaiKamera(): boolean {
  return typeof window !== "undefined" && ctor() !== null && !!navigator.mediaDevices?.getUserMedia;
}

export function PindaiKamera({
  onHasil,
  onTutup,
}: {
  /** Dipanggil sekali dengan kode yang terbaca; pemindai lalu menutup. */
  onHasil: (kode: string) => void;
  onTutup: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [galat, setGalat] = useState<string | null>(null);
  // Menahan hasil ganda: satu barcode terbaca di banyak bingkai berturut-turut.
  const selesai = useRef(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let batal = false;

    const mulai = async () => {
      const C = ctor();
      if (!C || !navigator.mediaDevices?.getUserMedia) {
        setGalat("Peramban di perangkat ini tidak bisa memindai. Ketik kodenya saja.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          // Kamera belakang; kalau tidak ada, peramban jatuh ke kamera mana pun.
          video: { facingMode: { ideal: "environment" } },
        });
      } catch (e) {
        setGalat(
          e instanceof DOMException && e.name === "NotAllowedError"
            ? "Izin kamera ditolak. Aktifkan di pengaturan aplikasi, atau ketik kodenya."
            : "Kamera tidak bisa dibuka. Ketik kodenya saja.",
        );
        return;
      }
      if (batal) {
        for (const t of stream.getTracks()) t.stop();
        return;
      }
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play().catch(() => undefined);

      // Format disaring supaya detektor tidak membuang waktu pada simbol yang
      // tidak pernah dipakai toko ini.
      const tersedia = await C.getSupportedFormats().catch(() => [] as string[]);
      const dipakai = FORMAT.filter((f) => tersedia.includes(f));
      const detector = new C(dipakai.length > 0 ? { formats: dipakai } : undefined);

      const periksa = async () => {
        if (batal || selesai.current || !videoRef.current) return;
        try {
          const hasil = await detector.detect(videoRef.current);
          const kode = hasil[0]?.rawValue?.trim();
          if (kode) {
            selesai.current = true;
            onHasil(kode);
            return;
          }
        } catch {
          // Bingkai gagal dibaca (kamera sedang fokus ulang) — coba lagi saja.
        }
        timer = window.setTimeout(periksa, JEDA_MS);
      };
      timer = window.setTimeout(periksa, JEDA_MS);
    };

    void mulai();

    return () => {
      batal = true;
      if (timer) window.clearTimeout(timer);
      // Lampu kamera HARUS mati saat dialog ditutup; membiarkannya menyala
      // membuat kasir mengira aplikasi masih merekam.
      if (stream) for (const t of stream.getTracks()) t.stop();
    };
  }, [onHasil]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/90"
      // biome-ignore lint/a11y/useSemanticElements: sama seperti components/ui/modal.tsx — <dialog> tidak dipakai di aplikasi ini; pemindai juga harus menutupi layar penuh untuk tampilan kamera
      role="dialog"
      aria-modal="true"
      aria-label="Pindai barcode"
    >
      <div className="flex items-center justify-between p-4">
        <p className="font-sans text-sm font-bold text-white">
          Arahkan ke barcode atau QR di stiker
        </p>
        <button
          type="button"
          onClick={onTutup}
          aria-label="Tutup pemindai"
          className="flex h-11 w-11 items-center justify-center rounded-pill bg-white/15 text-white"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {galat ? (
          <div className="max-w-xs px-6 text-center">
            <CameraOff className="mx-auto h-10 w-10 text-white/70" aria-hidden />
            <p role="alert" className="mt-3 font-sans text-sm text-white">
              {galat}
            </p>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              className="h-full w-full object-cover"
              aria-label="Tampilan kamera"
            />
            {/* Bingkai bidik: memberi tahu kasir harus sedekat apa. Kotak,
                karena QR persegi dan CODE128 tegak sama-sama muat di dalamnya. */}
            <div
              aria-hidden
              className="pointer-events-none absolute h-56 w-56 rounded-squircle border-4 border-white/80"
            />
          </>
        )}
      </div>
    </div>
  );
}
