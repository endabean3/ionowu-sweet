"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { db } from "@/lib/db";
import { daftarBertahap, naikMasuk } from "@/lib/motion/tokens";
import { useLiveQuery } from "dexie-react-hooks";
import { m } from "framer-motion";
import { AlertTriangle, ArrowLeft, FileUp, Plus, Search } from "lucide-react";
import Link from "next/link";
import React, { useState } from "react";

export default function KatalogPage() {
  const [search, setSearch] = useState("");

  // Ambil semua produk dan varian dari Dexie (offline-first read)
  const products = useLiveQuery(() => db.products.toArray(), []);
  const variants = useLiveQuery(() => db.variants.toArray(), []);

  if (!products || !variants) {
    return <div className="p-8 text-center text-muted">Memuat katalog lokal...</div>;
  }

  // Gabungkan produk dengan variannya
  const catalog = products.map((p) => {
    return {
      ...p,
      variants: variants.filter((v) => v.product_id === p.id),
    };
  });

  // Filter pencarian
  const filteredCatalog = catalog.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.variants.some((v) => v.name.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <div className="min-h-[100dvh] bg-base p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <Button
              variant="ghost"
              size="sm"
              aria-label="Kembali ke dasbor"
              className="gap-2 pos-touch-target"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
          </Link>
          <h1 className="font-display text-2xl font-black text-main">
            Master <span className="text-sweet-strawberry">Katalog</span>
          </h1>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/katalog/impor">
            <Button variant="secondary" size="default" className="gap-2 shadow-hard-sm">
              <FileUp className="h-4 w-4" aria-hidden="true" />
              <span>Impor CSV</span>
            </Button>
          </Link>
          <Link href="/katalog/tambah">
            <Button variant="primary" size="default" className="gap-2 shadow-hard-sm">
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Tambah Produk</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* h-11 (44px) pada input: sebelumnya cuma py-1 (~28px tinggi klik),
         di bawah target sentuh minimum. */}
      <div className="mt-8 flex items-center gap-2 rounded-squircle border-2 border-card-border bg-surface p-2 shadow-hard-sm max-w-md">
        <Search className="ml-2 h-5 w-5 shrink-0 text-muted" />
        <input
          type="text"
          placeholder="Cari nama produk atau varian..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-11 flex-1 bg-transparent px-2 text-sm font-semibold outline-none placeholder:text-muted/60"
        />
      </div>

      {/* Daftar Produk */}
      <m.div
        variants={daftarBertahap}
        initial="sembunyi"
        animate="tampil"
        className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3"
      >
        {filteredCatalog.length === 0 ? (
          <div className="col-span-full rounded-squircle border-2 border-dashed border-card-border p-12 text-center text-muted">
            <p>Tidak ada produk ditemukan. Klik "Tambah Produk" untuk mulai.</p>
          </div>
        ) : (
          filteredCatalog.map((product) => (
            <m.div key={product.id} variants={naikMasuk} className="flex">
              <Card variant="milky" className="flex flex-1 flex-col shadow-hard">
                <div className="flex-1">
                  <h3 className="font-display text-lg font-bold text-main">{product.name}</h3>
                  <p className="font-sans text-xs text-muted">ID: {product.id.slice(-8)}</p>

                  <div className="mt-4 space-y-2">
                    {product.variants.map((variant) => {
                      const isLow =
                        Number(variant.stock_quantity) <= Number(variant.min_stock_alert || 0);
                      return (
                        <div
                          key={variant.id}
                          className="flex items-center justify-between rounded-md bg-surface/50 px-3 py-2 text-sm border border-card-border/50"
                        >
                          <div>
                            <p className="font-bold text-main">{variant.name || "Regular"}</p>
                            {/* Stok rendah ditandai BADGE berlatar strawberry dengan
                             tinta cocoa + ikon, bukan teks pastel berkedip:
                             pastel di atas putih cuma 1,4:1 (jauh di bawah
                             ambang ≥7:1 sistem desain) dan animate-pulse
                             mengabaikan prefers-reduced-motion. */}
                            <p className="mt-0.5 flex items-center gap-1 font-mono text-xs text-muted">
                              {isLow ? (
                                <span className="inline-flex items-center gap-1 rounded-pill bg-sweet-strawberry px-2 py-0.5 font-bold text-main">
                                  <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                                  Menipis
                                </span>
                              ) : null}
                              <span>Stok: {variant.stock_quantity}</span>
                            </p>
                          </div>
                          <div className="text-right">
                            {/* text-main, bukan text-sweet-matcha: pastel hijau di
                             atas putih hanya 1,4:1 — harga adalah angka
                             terpenting di layar ini dan harus terbaca. */}
                            <p className="font-mono font-bold tabular-nums text-main">
                              Rp {Number.parseFloat(variant.price).toLocaleString("id-ID")}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Card>
            </m.div>
          ))
        )}
      </m.div>
    </div>
  );
}
