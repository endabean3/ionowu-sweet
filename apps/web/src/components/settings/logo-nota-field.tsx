"use client";

import { Button } from "@/components/ui/button";
import {
  LEBAR_TITIK,
  MAKS_TINGGI,
  decodeLogo,
  encodeLogo,
  gambarKeLogo,
  logoKeDataUrl,
} from "@/lib/receipt/logo";
import { ImagePlus, Trash2 } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";

/** Batas berkas yang diterima; lebih dari ini hampir pasti foto, bukan logo. */
const MAKS_BERKAS = 8 * 1024 * 1024;

/**
 * Unggah logo toko untuk kepala nota.
 *
 * Gambar diubah menjadi bitmap 1-bit di PERANGKAT ini (lib/receipt/logo.ts),
 * lalu yang tersimpan di server adalah bitmap itu — bukan berkas aslinya.
 * Pratinjaunya memakai bitmap yang sama, jadi pemilik melihat persis apa yang
 * akan keluar dari printer termal, bukan versi berwarna yang menipu.
 */
export function LogoNotaField({
  nilai,
  onUbah,
}: {
  nilai: string;
  onUbah: (v: string) => void;
}) {
  const inputId = useId();
  const [memproses, setMemproses] = useState(false);

  const pratinjau = useMemo(() => {
    const logo = decodeLogo(nilai);
    return logo ? { src: logoKeDataUrl(logo), w: logo.width, h: logo.height } : null;
  }, [nilai]);

  const pilih = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAKS_BERKAS) {
      toast.error("Berkas terlalu besar (maks. 8 MB)");
      return;
    }
    setMemproses(true);
    try {
      const logo = await gambarKeLogo(file, LEBAR_TITIK[58], MAKS_TINGGI);
      onUbah(encodeLogo(logo));
      toast.success("Logo siap", { description: "Tekan Simpan agar dipakai di nota." });
    } catch (err) {
      // Tanpa ini, satu-satunya petunjuk adalah pesan umum di layar.
      console.error("Gagal memproses logo:", err);
      toast.error("Gambar tidak bisa dibaca. Coba PNG atau JPG.");
    } finally {
      setMemproses(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="text-sm font-medium text-main">
        Logo nota
      </label>

      {pratinjau && (
        <div className="rounded-2xl border-2 border-card-border bg-white p-3">
          {/* Persis hasil cetak: hitam-putih, tanpa dihaluskan. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pratinjau.src}
            alt="Pratinjau logo nota"
            className="mx-auto h-auto w-full max-w-[220px]"
            style={{ imageRendering: "pixelated" }}
          />
          <p className="mt-2 text-center font-mono text-xs text-muted">
            {pratinjau.w}×{pratinjau.h} titik
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <input
          id={inputId}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          disabled={memproses}
          onChange={(e) => {
            void pilih(e.target.files?.[0]);
            // Supaya memilih berkas yang SAMA lagi tetap memicu onChange.
            e.target.value = "";
          }}
        />
        <Button
          size="pos"
          variant="custard"
          className="flex-1 gap-2"
          disabled={memproses}
          onClick={() => document.getElementById(inputId)?.click()}
        >
          <ImagePlus className="h-4 w-4" aria-hidden="true" />
          {memproses ? "Memproses…" : pratinjau ? "Ganti logo" : "Pilih logo"}
        </Button>
        {pratinjau && (
          <Button
            size="pos"
            variant="ghost"
            className="gap-2 border-card-border"
            aria-label="Hapus logo nota"
            onClick={() => onUbah("")}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Hapus
          </Button>
        )}
      </div>

      <p className="text-xs text-main">
        Dicetak di atas nama toko. Printer termal hanya hitam-putih, jadi gambar berwarna diubah
        otomatis; logo bergaris tegas hasilnya paling bagus. Maksimal {MAKS_TINGGI} titik tinggi (±
        {Math.round((MAKS_TINGGI / 8) * 0.25)} mm) supaya nota tidak lama tercetak.
      </p>
    </div>
  );
}
