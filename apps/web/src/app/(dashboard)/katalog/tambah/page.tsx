"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth/context";
import { createProduct } from "@/lib/catalog/api";
import { useSync } from "@/lib/sync/provider";
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
      // 1. Post ke server
      await createProduct(accessToken, {
        name,
        unit,
        variants: variants.map((v) => ({
          name: v.name,
          price: Number.parseFloat(v.price) || 0,
          cost: Number.parseFloat(v.cost) || 0,
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
    <div className="min-h-screen bg-base p-4 md:p-8">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-8 flex items-center gap-4">
          <Link href="/katalog">
            <Button variant="ghost" size="sm" className="h-10 w-10 p-0">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="font-display text-2xl font-black text-main">
            Tambah <span className="text-sweet-strawberry">Produk</span>
          </h1>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-[32px] border-2 border-card-border bg-white/60 p-6 shadow-hard backdrop-blur-sm sm:p-8"
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
              placeholder="pcs, cup, porsi..."
              required
            />
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

            {variants.map((v, i) => (
              <div
                key={`${i}-${v.name}`}
                className="flex flex-col gap-3 rounded-xl border border-card-border/50 bg-white p-4 shadow-sm sm:flex-row sm:items-start"
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
                    className="mt-6 h-10 w-10 shrink-0 text-red-500 hover:bg-red-50 sm:mt-1"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-600">
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
