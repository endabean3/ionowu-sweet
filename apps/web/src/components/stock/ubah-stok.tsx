"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { JaringanError } from "@/lib/auth/api";
import { type LocalVariant, db } from "@/lib/db";
import { StokError, catatMutasiStok, kirimOpname } from "@/lib/stock/api";
import Decimal from "decimal.js";
import { PackagePlus, PackageX, Scale } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type Mode = "masuk" | "rusak" | "opname";

const JUMLAH = /^\d{1,11}([.,]\d{1,3})?$/;

const MODE: Record<Mode, { label: string; ikon: typeof PackagePlus; petunjuk: string }> = {
  masuk: {
    label: "Stok masuk",
    ikon: PackagePlus,
    petunjuk: "Barang datang dari pemasok. Jumlah DITAMBAHKAN ke stok sekarang.",
  },
  rusak: {
    label: "Rusak/hilang",
    ikon: PackageX,
    petunjuk: "Tumpah, pecah, atau hilang. Jumlah DIKURANGI dari stok sekarang.",
  },
  opname: {
    label: "Opname",
    ikon: Scale,
    petunjuk: "Hasil timbang MENGGANTIKAN stok sekarang. Selisihnya dicatat otomatis.",
  },
};

/**
 * Mengubah stok satu barang: barang masuk, barang rusak/hilang, atau opname
 * (hasil timbang). Angka yang diketik selalu dalam SATUAN STOK — gram untuk
 * bibit yang dijual per ml (ADR-0012), supaya kasir tidak perlu mengonversi
 * apa pun di kepala saat memegang timbangan.
 *
 * Butuh online: stok adalah angka bersama semua perangkat kasir.
 */
export function UbahStok({
  variant,
  namaBarang,
  outletId,
  accessToken,
  offline,
  onClose,
}: {
  variant: LocalVariant;
  namaBarang: string;
  outletId: string;
  accessToken: string | null;
  offline: boolean;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>("masuk");
  const [teks, setTeks] = useState("");
  const [catatan, setCatatan] = useState("");
  const [coba, setCoba] = useState(false);
  const [menyimpan, setMenyimpan] = useState(false);

  const satuan = variant.stock_uom || variant.uom;
  const stokSekarang = new Decimal(variant.stock_quantity || 0);
  const nilai = teks.trim().replace(",", ".");
  const sah = JUMLAH.test(teks.trim());
  const jumlah = sah ? new Decimal(nilai) : null;

  // Pratinjau hasil: angka yang akan tampil di kasir setelah disimpan.
  const hasil =
    jumlah === null
      ? null
      : mode === "masuk"
        ? stokSekarang.plus(jumlah)
        : mode === "rusak"
          ? stokSekarang.minus(jumlah)
          : jumlah;
  const selisihOpname = mode === "opname" && jumlah ? jumlah.minus(stokSekarang) : null;

  const angka = (d: Decimal) =>
    d.toDecimalPlaces(3).toNumber().toLocaleString("id-ID", { maximumFractionDigits: 3 });

  const simpan = async () => {
    setCoba(true);
    if (!sah || !jumlah || menyimpan || !accessToken || offline) return;
    if (mode !== "opname" && jumlah.isZero()) return;
    setMenyimpan(true);
    try {
      let saldo: string;
      if (mode === "opname") {
        const { data } = await kirimOpname(accessToken, outletId, [
          { variant_id: variant.id, counted_quantity: jumlah.toString() },
        ]);
        saldo = data[0]?.counted ?? jumlah.toString();
      } else {
        const { data } = await catatMutasiStok(accessToken, {
          outlet_id: outletId,
          variant_id: variant.id,
          event_type: mode === "masuk" ? "restock" : "waste",
          quantity: jumlah.toString(),
          note: catatan.trim() || undefined,
        });
        saldo = data.stock_quantity;
      }
      // Cermin lokal: layar kasir di perangkat ini langsung memakai angka baru.
      await db.variants.update(variant.id, { stock_quantity: saldo });
      toast.success(`${MODE[mode].label} tersimpan`, {
        description: `${namaBarang}: ${angka(new Decimal(saldo))} ${satuan}`,
      });
      onClose();
    } catch (err) {
      toast.error(
        err instanceof JaringanError
          ? "Tidak bisa menghubungi server. Coba lagi saat online."
          : err instanceof StokError
            ? err.message
            : "Gagal menyimpan stok",
      );
    } finally {
      setMenyimpan(false);
    }
  };

  return (
    <Modal
      title="Ubah stok"
      onClose={onClose}
      size="md"
      footer={
        <Button
          size="pos-lg"
          variant="primary"
          className="w-full shadow-hard"
          disabled={menyimpan || offline || !accessToken}
          onClick={simpan}
        >
          {menyimpan ? "Menyimpan…" : `Simpan ${MODE[mode].label.toLowerCase()}`}
        </Button>
      }
    >
      <div className="flex flex-col gap-4 p-4 sm:p-6">
        <div>
          <p className="font-sans text-sm font-bold text-main">{namaBarang}</p>
          <p className="font-mono text-sm text-muted">
            Stok sekarang: {angka(stokSekarang)} {satuan}
          </p>
        </div>

        {offline && (
          <output className="block rounded-2xl border-2 border-card-border bg-sweet-custard p-3 font-sans text-sm font-semibold text-main">
            Sedang offline. Stok adalah angka bersama semua perangkat, jadi perubahannya butuh
            koneksi.
          </output>
        )}

        <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Jenis perubahan stok">
          {(Object.keys(MODE) as Mode[]).map((k) => {
            const { label, ikon: Ikon } = MODE[k];
            return (
              <Button
                key={k}
                role="tab"
                aria-selected={mode === k}
                size="pos"
                variant={mode === k ? "custard" : "ghost"}
                className={`h-auto flex-col gap-1 px-1 py-2 text-xs leading-tight ${
                  mode === k ? "" : "border-card-border"
                }`}
                onClick={() => {
                  setMode(k);
                  setCoba(false);
                }}
              >
                <Ikon className="h-4 w-4" aria-hidden="true" />
                {label}
              </Button>
            );
          })}
        </div>
        <p className="-mt-2 font-sans text-xs text-main">{MODE[mode].petunjuk}</p>

        <Input
          label={mode === "opname" ? `Hasil timbang (${satuan})` : `Jumlah (${satuan})`}
          value={teks}
          onChange={(e) => setTeks(e.target.value)}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          autoFocus
          error={coba && !sah ? "Isi angka, mis. 250 atau 12,5" : undefined}
        />

        {hasil && (
          <output className="block rounded-2xl border-2 border-card-border bg-surface p-3 font-mono text-sm text-main">
            Stok menjadi <b>{angka(hasil)}</b> {satuan}
            {selisihOpname && !selisihOpname.isZero() && (
              <span className="block font-sans text-xs">
                Selisih {selisihOpname.isNegative() ? "kurang" : "lebih"}{" "}
                {angka(selisihOpname.abs())} {satuan} — dicatat di laporan stok.
              </span>
            )}
            {hasil.isNegative() && (
              <span className="block font-sans text-xs font-bold text-red-700">
                Stok akan menjadi minus. Pastikan angkanya benar.
              </span>
            )}
          </output>
        )}

        {mode !== "opname" && (
          <Input
            label="Catatan (opsional)"
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            maxLength={500}
            autoComplete="off"
            placeholder={mode === "masuk" ? "Nama pemasok, no. nota" : "Tumpah, botol pecah…"}
          />
        )}
      </div>
    </Modal>
  );
}
