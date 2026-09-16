"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth/context";
import { createProduct } from "@/lib/catalog/api";
import { naikMasuk } from "@/lib/motion/tokens";
import { useSync } from "@/lib/sync/provider";
import { AnimatePresence, m } from "framer-motion";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";

export default function TambahProdukPage() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const { syncNow } = useSync();

  const [name, setName] = useState("");
  const [unit, setUnit] = useState("pcs");
  // 0 = dijual utuh (pcs, botol). > 0 = curah/timbang: parfum per ml, bahan
  // kue per gram — dua pelanggan pasti kita (CLAUDE.md §2). Nilai inilah yang
  // menentukan apakah kasir bisa memasukkan "30 ml"; tanpa itu varian ml pun
  // hanya bisa dijual satu-satu.
  const [uomPrecision, setUomPrecision] = useState(0);
  const [variants, setVariants] = useState([{ name: "Regular", price: "", cost: "" }]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addVariant = () => {
    setVariants([...variants, { name: "", price: "", cost: "" }]);
  };

  const updateVariant = (index: number, field: string, value: string) => {
    const newVariants = [...variants];
    newVariants[index] = { ...newVariants[index], [field]: value };
    setVariants(newVariants);
  };

  const removeVariant = (index: number) => {
    if (variants.length === 1) return;
    setVariants(variants.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;

    setSubmitting(true);
    setError(null);

    try {
      // 1. Post ke server. uom diterapkan ke SETIAP varian — backend
      // menaruh satuan di level varian, bukan level produk (satu produk
      // bisa punya varian dengan uom berbeda), tapi form ini sengaja hanya
      // menampilkan satu input UoM untuk kasus umum (semua varian sesatuan).
      await createProduct(accessToken, {
        name,
        variants: variants.map((v) => ({
          name: v.name,
          price: v.price || "0",
          costPrice: v.cost || "0",
          uom: unit,
          uomPrecision,
        })),
      });

      // 2. Tarik data (Pull) untuk update IndexedDB lokal
      await syncNow();

      // 3. Kembali ke daftar katalog
      router.push("/katalog");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-base p-4 md:p-8">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
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
            Tambah <span className="text-sweet-strawberry">Produk</span>
          </h1>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-[32px] border-2 border-card-border bg-surface/60 p-6 shadow-hard backdrop-blur-sm sm:p-8"
        >
          <div className="space-y-4">
            <h2 className="font-sans text-sm font-bold uppercase tracking-wider text-muted">
              Info Dasar
            </h2>
            <Input
              label="Nama Produk"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Es Kopi Susu Senja"
              required
            />
            <Input
              label="Satuan Dasar (UoM)"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="pcs, ml, gram, kg..."
              required
            />

            <fieldset className="flex flex-col gap-1.5">
              <legend className="text-sm font-medium text-main">Cara dijual</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  { nilai: 0, judul: "Utuh", contoh: "1 botol, 2 pcs" },
                  { nilai: 3, judul: "Pecahan (curah/timbang)", contoh: "30 ml, 0,5 kg" },
                ].map((opsi) => (
                  <button
                    key={opsi.nilai}
                    type="button"
                    onClick={() => setUomPrecision(opsi.nilai)}
                    aria-pressed={uomPrecision === opsi.nilai}
                    className={`pos-touch-target rounded-2xl border-2 px-4 py-2 text-left font-sans transition-all ${
                      uomPrecision === opsi.nilai
                        ? "border-card-border bg-sweet-custard text-main shadow-hard-sm"
                        : "border-card-border bg-surface text-muted"
                    }`}
                  >
                    <span className="block text-sm font-bold">{opsi.judul}</span>
                    <span className="block font-mono text-xs">{opsi.contoh}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted">
                Pilih <b>Pecahan</b> bila pembeli boleh membeli sebagian, misalnya parfum per ml
                atau bahan kue per gram. Kasir akan diminta mengisi jumlahnya saat menjual.
              </p>
            </fieldset>
          </div>

          <div className="space-y-4 pt-4 border-t border-card-border/50">
            <div className="flex items-center justify-between">
              <h2 className="font-sans text-sm font-bold uppercase tracking-wider text-muted">
                Daftar Varian
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={addVariant}
                className="h-8 text-xs font-bold text-sweet-strawberry"
              >
                <Plus className="mr-1 h-3 w-3" /> Tambah
              </Button>
            </div>

            <AnimatePresence initial={false}>
              {variants.map((v, i) => (
                // key HANYA index — sebelumnya key ikut menyertakan v.name
                // (nilai yang sedang diketik user), jadi SETIAP huruf yang
                // diketik di Nama Varian mengubah key dan memaksa React
                // unmount+remount seluruh baris, termasuk field Harga Jual/
                // Modal di dalamnya: fokus dan nilai yang sedang diisi jadi
                // tidak stabil. Daftar ini hanya tumbuh/menyusut tanpa
                // reorder (addVariant menambah di akhir, removeVariant
                // memfilter), jadi index AMAN dipakai sebagai key di sini —
                // linter tidak tahu invarian itu.
                <m.div
                  // biome-ignore lint/suspicious/noArrayIndexKey: list hanya tumbuh/menyusut di akhir, tanpa reorder
                  key={i}
                  variants={naikMasuk}
                  initial="sembunyi"
                  animate="tampil"
                  exit="pergi"
                  className="mb-3 flex flex-col gap-3 rounded-xl border border-card-border/50 bg-surface p-4 shadow-sm sm:flex-row sm:items-start"
                >
                  <div className="flex-1 space-y-3">
                    <Input
                      label="Nama Varian"
                      value={v.name}
                      onChange={(e) => updateVariant(i, "name", e.target.value)}
                      placeholder="Regular, Large, dll"
                      required
                    />
                    <div className="flex gap-3">
                      <Input
                        label="Harga Jual"
                        type="number"
                        value={v.price}
                        onChange={(e) => updateVariant(i, "price", e.target.value)}
                        placeholder="0"
                        min="0"
                        required
                        className="flex-1"
                      />
                      <Input
                        label="Harga Modal (HPP)"
                        type="number"
                        value={v.cost}
                        onChange={(e) => updateVariant(i, "cost", e.target.value)}
                        placeholder="0"
                        min="0"
                        className="flex-1"
                      />
                    </div>
                  </div>
                  {variants.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => removeVariant(i)}
                      aria-label={`Hapus varian ${v.name || i + 1}`}
                      // h-11 w-11, BUKAN pos-touch-target: di ponsel baris varian
                      // adalah flex-col, dan min-width 48px tanpa lebar tetap
                      // membuat tombol hapus melebar satu baris penuh. 44px sudah
                      // memenuhi ambang sentuh tanpa mengubah tata letaknya.
                      className="mt-2 h-11 w-11 shrink-0 self-end text-red-600 hover:bg-red-50 sm:mt-1 sm:self-auto"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                </m.div>
              ))}
            </AnimatePresence>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm font-semibold text-red-700"
            >
              {error}
            </div>
          )}

          <div className="pt-6">
            <Button
              type="submit"
              variant="primary"
              className="w-full shadow-hard-sm"
              disabled={submitting}
            >
              {submitting ? "Menyimpan & Sinkronisasi..." : "Simpan Produk"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
