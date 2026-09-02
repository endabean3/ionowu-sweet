"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { db } from "@/lib/db";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Plus, Search } from "lucide-react";
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
    <div className="min-h-screen bg-base p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="font-display text-2xl font-black text-main">
            Master <span className="text-sweet-strawberry">Katalog</span>
          </h1>
        </div>

        <Link href="/katalog/tambah">
          <Button variant="primary" size="default" className="gap-2 shadow-hard-sm">
            <Plus className="h-4 w-4" />
            <span>Tambah Produk</span>
          </Button>
        </Link>
      </div>

      <div className="mt-8 flex items-center gap-2 rounded-squircle border-2 border-card-border bg-white p-2 shadow-hard-sm max-w-md">
        <Search className="ml-2 h-5 w-5 text-muted" />
        <input
          type="text"
          placeholder="Cari nama produk atau varian..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-transparent px-2 py-1 text-sm font-semibold outline-none placeholder:text-muted/60"
        />
      </div>

      {/* Daftar Produk */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {filteredCatalog.length === 0 ? (
          <div className="col-span-full rounded-squircle border-2 border-dashed border-card-border p-12 text-center text-muted">
            <p>Tidak ada produk ditemukan. Klik "Tambah Produk" untuk mulai.</p>
          </div>
        ) : (
          filteredCatalog.map((product) => (
            <Card key={product.id} variant="milky" className="flex flex-col shadow-hard">
              <div className="flex-1">
                <h3 className="font-display text-lg font-bold text-main">{product.name}</h3>
                <p className="font-sans text-xs text-muted">ID: {product.id.slice(-8)}</p>

                <div className="mt-4 space-y-2">
                  {product.variants.map((variant) => (
                    <div
                      key={variant.id}
                      className="flex items-center justify-between rounded-md bg-white/50 px-3 py-2 text-sm border border-card-border/50"
                    >
                      <div>
                        <p className="font-bold text-main">{variant.name || "Regular"}</p>
                        <p
                          className={`font-mono text-xs ${
                            Number(variant.stock_quantity) <= Number(variant.min_stock_alert || 0)
                              ? "font-bold text-sweet-strawberry animate-pulse"
                              : "text-muted"
                          }`}
                        >
                          Stock: {variant.stock_quantity}{" "}
                          {Number(variant.stock_quantity) <= Number(variant.min_stock_alert || 0) &&
                            "⚠️ Low"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-bold text-sweet-matcha">
                          Rp {Number.parseFloat(variant.price).toLocaleString("id-ID")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
