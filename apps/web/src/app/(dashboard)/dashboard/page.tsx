"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/lib/auth/context";
import {
  Activity,
  ArrowLeft,
  DollarSign,
  ShieldCheck,
  ShoppingBag,
  Store,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import React, { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

interface AnalyticsResponse {
  summary: {
    transaction_count: number;
    gross_sales: string;
    discount_total: string;
    net_sales: string;
  };
  top_products: {
    product_name: string;
    variant_name: string;
    quantity_sold: string;
    revenue: string;
  }[];
}

export default function DashboardPage() {
  const { user, accessToken } = useAuth();
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accessToken) return;

    fetch(`${API_URL}/analytics/dashboard`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
      .then((res) => res.json())
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Gagal load analytics", err);
        setLoading(false);
      });
  }, [accessToken]);

  const formatRp = (val: string | number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(Number(val));
  };

  return (
    <div className="min-h-screen bg-base p-4 md:p-8">
      {/* Top Header. Sebelumnya satu baris flex tanpa wrap: dua tombol + judul
         "Ringkasan Operasional Owner" + badge tenant dipaksa muat di satu
         baris, meluber ~123px di layar 375px (scroll horizontal — dilarang)
         dan badge tenant terdorong ke luar viewport, tak pernah terlihat. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/kasir">
            <Button variant="ghost" size="sm" className="gap-2 pos-touch-target">
              <ArrowLeft className="h-4 w-4" />
              <span>Kembali ke Kasir</span>
            </Button>
          </Link>
          <Link href="/katalog">
            <Button variant="primary" size="sm" className="gap-2 shadow-hard-sm">
              <ShoppingBag className="h-4 w-4" />
              <span>Master Katalog</span>
            </Button>
          </Link>
          <h1 className="font-display text-xl font-black text-main sm:text-2xl">
            Ringkasan Operasional <span className="text-sweet-strawberry">Owner</span>
          </h1>
        </div>
        <div className="flex items-center gap-2 self-start rounded-pill border-2 border-card-border bg-sweet-matcha px-4 py-1.5 font-sans text-xs font-bold text-main shadow-hard-sm sm:self-auto">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          <span>Tenant: {user?.name || "Memuat..."}</span>
        </div>
      </div>

      {loading ? (
        <div className="mt-8 flex h-64 items-center justify-center">
          <p className="font-sans font-bold text-muted animate-pulse">
            Mengambil data intelijen dari server...
          </p>
        </div>
      ) : (
        <>
          {/* Metric Cards Grid */}
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <Card variant="milky" className="space-y-2 shadow-hard">
              <div className="flex items-center justify-between text-muted">
                <span className="font-sans text-xs font-bold uppercase tracking-wider">
                  Penjualan Hari Ini
                </span>
                <DollarSign className="h-5 w-5 text-sweet-strawberry" />
              </div>
              <p className="font-mono text-3xl font-black tabular-nums text-main">
                {formatRp(data?.summary?.net_sales || 0)}
              </p>
              <p className="font-sans text-xs font-semibold text-muted">Real-time terkini</p>
            </Card>

            <Card variant="milky" className="space-y-2 shadow-hard">
              <div className="flex items-center justify-between text-muted">
                <span className="font-sans text-xs font-bold uppercase tracking-wider">
                  Total Transaksi
                </span>
                <ShoppingBag className="h-5 w-5 text-sweet-sky" />
              </div>
              <p className="font-mono text-3xl font-black tabular-nums text-main">
                {data?.summary?.transaction_count || 0} Struk
              </p>
              <p className="font-sans text-xs font-semibold text-muted">Hari ini</p>
            </Card>

            <Card variant="milky" className="space-y-2 shadow-hard">
              <div className="flex items-center justify-between text-muted">
                <span className="font-sans text-xs font-bold uppercase tracking-wider">
                  Diskon Diberikan
                </span>
                <TrendingUp className="h-5 w-5 text-sweet-matcha" />
              </div>
              <p className="font-mono text-3xl font-black tabular-nums text-main">
                {formatRp(data?.summary?.discount_total || 0)}
              </p>
              <p className="font-sans text-xs font-semibold text-muted">
                Dipotong dari gross sales
              </p>
            </Card>

            <Card variant="milky" className="space-y-2 shadow-hard">
              <div className="flex items-center justify-between text-muted">
                <span className="font-sans text-xs font-bold uppercase tracking-wider">
                  Outlet Aktif
                </span>
                <Store className="h-5 w-5 text-sweet-taro" />
              </div>
              <p className="font-mono text-3xl font-black tabular-nums text-main">1 / 1</p>
              <p className="font-sans text-xs font-semibold text-muted">Pusat (Shift Open)</p>
            </Card>
          </div>

          {/* Highlights Section */}
          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card variant="milky" className="shadow-hard">
              <h2 className="flex items-center gap-2 font-display text-lg font-bold text-main">
                <TrendingUp className="h-5 w-5" aria-hidden="true" />
                Top 5 Varian Terlaris Hari Ini
              </h2>
              <div className="mt-4 space-y-3 font-sans text-sm">
                {!data?.top_products || data.top_products.length === 0 ? (
                  <p className="text-muted text-sm py-4">Belum ada penjualan hari ini.</p>
                ) : (
                  data.top_products.map((item, i) => (
                    <div
                      key={item.variant_name}
                      className="flex items-center justify-between rounded-squircle-sm border border-card-border bg-base p-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-6 w-6 items-center justify-center rounded-pill bg-sweet-custard font-mono text-xs font-bold">
                          {i + 1}
                        </span>
                        <span className="font-bold text-main">
                          {item.product_name} - {item.variant_name}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono text-xs text-muted mr-3">
                          {Number(item.quantity_sold)} qty
                        </span>
                        <span className="font-mono font-bold text-main">
                          {formatRp(item.revenue)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>

            <Card variant="milky" className="shadow-hard">
              <h2 className="flex items-center gap-2 font-display text-lg font-bold text-main">
                <Activity className="h-5 w-5" aria-hidden="true" />
                Status Kas & Sinkronisasi
              </h2>
              <div className="mt-4 space-y-4">
                <div className="rounded-squircle-sm border border-card-border bg-sweet-custard/40 p-4">
                  <h3 className="font-sans text-sm font-bold text-main">Catatan Sinkronisasi</h3>
                  <p className="mt-1 font-sans text-xs text-muted">
                    Dashboard ini menarik data transaksi (SQL) secara <i>real-time</i> langsung dari
                    server Postgres utama, mengabaikan transaksi PWA lokal yang masih tertunda dalam{" "}
                    <i>queue</i>. Pastikan Kasir terhubung internet (Online) agar angkanya akurat.
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
