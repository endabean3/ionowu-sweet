"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Loader2, Printer, QrCode, Wand2 } from "lucide-react";
import Link from "next/link";
import React, { useMemo, useState } from "react";

import { LembarStiker, type StikerData } from "@/components/catalog/lembar-stiker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth/context";
import { profilTerakhir } from "@/lib/auth/profile";
import { kodeProdukBaru } from "@/lib/barcode/kode-produk";
import { PER_LEMBAR } from "@/lib/barcode/stiker";
import { patchVariant } from "@/lib/catalog/api";
import { db } from "@/lib/db";
import { rupiah } from "@/lib/receipt/format";

/**
 * Cetak stiker barcode produk di kertas stiker A4, dipotong manual.
 *
 * Barang di toko ini tidak punya barcode pabrik — parfum dijual per ml dari
 * botol besar — jadi kodenya dibuat sistem lalu dicetak sendiri. Tanpa ini,
 * kolom "scan barcode" di kasir tidak akan pernah menemukan apa pun.
 */
export default function StikerPage() {
  const { user, accessToken } = useAuth();
  const role = (user ?? profilTerakhir())?.role;
  // Menetapkan barcode = mengubah produk (RBAC-MODEL §Matriks).
  const bolehUbah = role === "owner" || role === "manager";

  const [cari, setCari] = useState("");
  const [pilihan, setPilihan] = useState<Record<string, number>>({});
  const [sedangBuat, setSedangBuat] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [kabar, setKabar] = useState<string | null>(null);

  const products = useLiveQuery(() => db.products.toArray(), []);
  const variants = useLiveQuery(() => db.variants.toArray(), []);

  const baris = useMemo(() => {
    if (!products || !variants) return [];
    const namaProduk = new Map(products.map((p) => [p.id, p.name]));
    return variants
      .filter((v) => v.is_active !== false)
      .map((v) => ({
        id: v.id,
        nama: `${namaProduk.get(v.product_id) ?? "?"} ${v.name}`.trim(),
        harga: v.price,
        barcode: v.barcode ?? "",
      }))
      .sort((a, b) => a.nama.localeCompare(b.nama, "id"));
  }, [products, variants]);

  const terlihat = baris.filter((b) => b.nama.toLowerCase().includes(cari.toLowerCase()));
  const tanpaKode = baris.filter((b) => b.barcode === "");

  const stiker: StikerData[] = baris.flatMap((b) => {
    const n = pilihan[b.id] ?? 0;
    if (n <= 0 || b.barcode === "") return [];
    return Array.from({ length: n }, () => ({
      kode: b.barcode,
      nama: b.nama,
      harga: rupiah(b.harga),
    }));
  });

  /**
   * Memberi kode pada varian yang belum punya, satu per satu.
   *
   * Sengaja berhenti pada kegagalan pertama, bukan melanjutkan: kalau server
   * menolak (kode kembar, token kedaluwarsa), meneruskan hanya menghasilkan
   * katalog setengah terisi yang sulit ditelusuri. Yang sudah berhasil tetap
   * tersimpan, jadi menekan tombolnya lagi melanjutkan dari sisanya.
   */
  const buatKode = async () => {
    if (!accessToken || tanpaKode.length === 0) return;
    setSedangBuat(true);
    setGalat(null);
    setKabar(null);
    let berhasil = 0;
    try {
      for (const b of tanpaKode) {
        const kode = kodeProdukBaru();
        await patchVariant(accessToken, b.id, { barcode: kode });
        await db.variants.update(b.id, { barcode: kode });
        berhasil++;
      }
      setKabar(`${berhasil} produk dapat kode baru.`);
    } catch (e) {
      setGalat(
        `Berhenti setelah ${berhasil} produk: ${e instanceof Error ? e.message : "gagal"}. Tekan lagi untuk melanjutkan sisanya.`,
      );
    } finally {
      setSedangBuat(false);
    }
  };

  const ubahJumlah = (id: string, n: number) =>
    setPilihan((p) => ({ ...p, [id]: Math.max(0, Math.min(99, n)) }));

  if (!products || !variants) {
    return <div className="p-8 text-center text-muted">Memuat katalog lokal...</div>;
  }

  return (
    <div className="min-h-[100dvh] bg-base p-4 md:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" aria-label="Kembali ke dashboard">
              <ArrowLeft className="size-5" aria-hidden />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-main md:text-2xl">Stiker barcode</h1>
            <p className="text-sm text-muted">
              Cetak di kertas stiker A4, lalu potong sendiri. {PER_LEMBAR} stiker per lembar.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 print:hidden lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="p-4">
          {tanpaKode.length > 0 && (
            <div className="mb-4 rounded-xl border border-amber-400/40 bg-amber-50 p-4 dark:bg-amber-950/20">
              <p className="text-sm font-semibold text-main">
                {tanpaKode.length} produk belum punya kode barcode.
              </p>
              <p className="mt-1 text-sm text-muted">
                Tanpa kode, produk tidak bisa dipindai di kasir dan stikernya tidak bisa dicetak.
              </p>
              <Button
                className="mt-3"
                onClick={buatKode}
                disabled={!bolehUbah || sedangBuat || !accessToken}
              >
                {sedangBuat ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Membuat kode…
                  </>
                ) : (
                  <>
                    <Wand2 className="size-4" aria-hidden />
                    Buatkan kode untuk {tanpaKode.length} produk
                  </>
                )}
              </Button>
              {!bolehUbah && (
                <p className="mt-2 text-sm text-muted">
                  Hanya pemilik atau manajer yang boleh menetapkan barcode.
                </p>
              )}
            </div>
          )}

          {galat && (
            <p role="alert" className="mb-4 text-sm font-medium text-danger">
              {galat}
            </p>
          )}
          {kabar && (
            <output className="mb-4 block text-sm font-medium text-success">{kabar}</output>
          )}

          <Input
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            placeholder="Cari produk…"
            className="mb-3"
          />

          <div className="max-h-[60vh] overflow-y-auto">
            {terlihat.map((b) => (
              <div
                key={b.id}
                className="flex items-center gap-3 border-b border-line py-2 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-main">{b.nama}</p>
                  <p className="font-mono text-xs text-muted">{b.barcode || "belum ada kode"}</p>
                </div>
                <Input
                  type="number"
                  min={0}
                  max={99}
                  inputMode="numeric"
                  aria-label={`Jumlah stiker ${b.nama}`}
                  value={pilihan[b.id] ?? 0}
                  disabled={b.barcode === ""}
                  onChange={(e) => ubahJumlah(b.id, Number(e.target.value))}
                  className="w-20 text-center"
                />
              </div>
            ))}
            {terlihat.length === 0 && (
              <p className="py-6 text-center text-sm text-muted">Tidak ada produk yang cocok.</p>
            )}
          </div>
        </Card>

        <Card className="h-fit p-4">
          <div className="flex items-center gap-2 text-main">
            <QrCode className="size-5" aria-hidden />
            <p className="font-semibold">Siap cetak</p>
          </div>
          <p className="mt-2 text-sm text-muted">
            {stiker.length} stiker ={" "}
            {stiker.length === 0 ? 0 : Math.ceil(stiker.length / PER_LEMBAR)} lembar A4.
          </p>
          <Button
            className="mt-4 w-full"
            disabled={stiker.length === 0}
            onClick={() => window.print()}
          >
            <Printer className="size-4" aria-hidden />
            Cetak
          </Button>
          <p className="mt-3 text-xs text-muted">
            Di dialog cetak, pastikan skala <strong>100%</strong> dan margin <strong>None</strong>.
            Kalau diperkecil agar muat, ukuran stiker ikut menyusut dan barcode-nya bisa gagal
            dipindai.
          </p>
        </Card>
      </div>

      {stiker.length > 0 && (
        <div className="mt-6 overflow-x-auto">
          <LembarStiker stiker={stiker} />
        </div>
      )}
    </div>
  );
}
