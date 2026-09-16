"use client";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/context";
import { type HasilImpor, importProducts } from "@/lib/catalog/api";
import { naikMasuk } from "@/lib/motion/tokens";
import { useSync } from "@/lib/sync/provider";
import { m } from "framer-motion";
import { ArrowLeft, CheckCircle2, FileUp, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

/**
 * Impor katalog dari CSV — untuk pemilik yang memasukkan puluhan sampai
 * ratusan barang sekaligus (stock opname Warung Wangi: 150 baris).
 *
 * Sebelum layar ini ada, satu-satunya jalan adalah memanggil
 * POST /products/import dengan token login lewat terminal — tidak praktis
 * bagi pemilik warung, dan token itu bukan sesuatu yang layak diserahkan ke
 * orang lain untuk dikerjakan.
 *
 * Hasilnya ditampilkan APA ADANYA, termasuk setiap baris yang dilewati
 * beserta alasannya. Impor yang "berhasil" padahal diam-diam membuang 20
 * barang lebih berbahaya daripada impor yang gagal terang-terangan.
 */
export default function ImporKatalogPage() {
  const { accessToken } = useAuth();
  const { syncNow } = useSync();
  const inputRef = useRef<HTMLInputElement>(null);

  const [berkas, setBerkas] = useState<File | null>(null);
  const [mengirim, setMengirim] = useState(false);
  const [hasil, setHasil] = useState<HasilImpor | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  const kirim = async () => {
    if (!berkas || !accessToken || mengirim) return;
    setMengirim(true);
    setGalat(null);
    setHasil(null);
    try {
      const h = await importProducts(accessToken, berkas);
      setHasil(h);
      // Tarik katalog baru ke IndexedDB supaya langsung muncul di layar kasir,
      // termasuk saat nanti perangkat offline.
      if (h.total_records > 0) await syncNow();
    } catch (err) {
      setGalat(err instanceof Error ? err.message : "Impor gagal");
    } finally {
      setMengirim(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-base p-4 md:p-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 flex items-center gap-4">
          <Link href="/katalog">
            <Button
              variant="ghost"
              size="sm"
              aria-label="Kembali ke katalog"
              className="pos-touch-target p-0"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </Button>
          </Link>
          <h1 className="font-display text-2xl font-black text-main">
            Impor <span className="text-sweet-strawberry">Katalog</span>
          </h1>
        </div>

        <m.div
          variants={naikMasuk}
          initial="sembunyi"
          animate="tampil"
          className="space-y-5 rounded-[32px] border-2 border-card-border bg-surface p-6 shadow-hard sm:p-8"
        >
          <div className="space-y-2 font-sans text-sm text-main">
            <p className="font-bold">Format kolom CSV (baris pertama = judul kolom):</p>
            <pre className="overflow-x-auto rounded-xl border border-card-border/50 bg-base p-3 font-mono text-xs">
              ProductName, VariantName, SKU, Barcode, Price, CostPrice, Uom, UomPrecision,
              StockQuantity, ItemType
            </pre>
            <ul className="list-disc space-y-1 pl-5 text-muted">
              <li>
                <b className="text-main">Price wajib diisi.</b> Baris tanpa harga dilewati — tidak
                dianggap Rp 0.
              </li>
              <li>
                Barang curah (parfum per ml, bahan kue per gram): isi <b>Uom</b> dan{" "}
                <b>UomPrecision</b> 1–3.
              </li>
              <li>Mengimpor berkas yang sama dua kali akan membuat barangnya ganda.</li>
            </ul>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            id="berkas-csv"
            onChange={(e) => {
              setBerkas(e.target.files?.[0] ?? null);
              setHasil(null);
              setGalat(null);
            }}
          />
          <label
            htmlFor="berkas-csv"
            className="mochi-button pos-touch-target flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed border-card-border bg-base px-4 py-4 font-sans text-sm font-bold text-main"
          >
            <FileUp className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 truncate">
              {berkas
                ? `${berkas.name} · ${(berkas.size / 1024).toFixed(1)} KB`
                : "Pilih berkas CSV…"}
            </span>
          </label>

          <Button
            variant="primary"
            size="pos"
            className="w-full shadow-hard-sm"
            onClick={kirim}
            disabled={!berkas || !accessToken || mengirim}
          >
            {mengirim ? "Mengimpor…" : "Impor Sekarang"}
          </Button>

          {!accessToken && (
            <p role="alert" className="font-sans text-sm font-bold text-red-800">
              Impor butuh koneksi ke server dan sesi yang aktif. Masuk ulang saat online.
            </p>
          )}

          {galat && (
            <p
              role="alert"
              className="rounded-xl border-2 border-red-300 bg-red-50 p-3 font-sans text-sm font-bold text-red-800"
            >
              {galat}
            </p>
          )}

          {hasil && (
            <div aria-live="polite" className="space-y-3">
              <p className="flex items-center gap-2 rounded-xl border-2 border-card-border bg-sweet-matcha/40 p-3 font-sans text-sm font-bold text-main">
                <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
                {hasil.total_records} barang masuk ke katalog.
              </p>

              {hasil.dilewati.length > 0 && (
                <div className="rounded-xl border-2 border-red-300 bg-red-50 p-3 font-sans text-sm text-red-800">
                  <p className="flex items-center gap-2 font-bold">
                    <TriangleAlert className="h-5 w-5 shrink-0" aria-hidden="true" />
                    {hasil.dilewati.length} baris TIDAK diimpor:
                  </p>
                  <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto font-mono text-xs">
                    {hasil.dilewati.map((d) => (
                      <li key={d.baris}>
                        Baris {d.baris}: {d.alasan}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <Link href="/katalog" className="block">
                <Button variant="secondary" className="w-full">
                  Lihat katalog
                </Button>
              </Link>
            </div>
          )}
        </m.div>
      </div>
    </div>
  );
}
