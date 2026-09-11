"use client";

import { type CartLine, POSCart } from "@/components/pos/cart";
import { POSHeader } from "@/components/pos/header";
import { MacaronItem, type MacaronProduct } from "@/components/pos/macaron-item";
import { playPop, playSuccessChord } from "@/lib/audio/haptics";
import { useAuth } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { enqueueOfflineAction } from "@/lib/sync/queue";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Barcode, Layers, Search, Wallet } from "lucide-react";
import Link from "next/link";
import React, { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { ulid } from "ulid";
import { type PaymentBreakdown, PaymentModal } from "./payment-modal";
import { ShiftModal } from "./shift-modal";

export default function KasirPage() {
  const { user } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState<string>("Semua");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [cartItems, setCartItems] = useState<CartLine[]>([]);
  const [isCheckingOut, setIsCheckingOut] = useState<boolean>(false);
  const [showShiftModal, setShowShiftModal] = useState<boolean>(true); // Tampilkan shift modal di awal

  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Ambil data dari Dexie
  const dbProducts = useLiveQuery(() => db.products.toArray(), []);
  const dbVariants = useLiveQuery(() => db.variants.toArray(), []);
  const activeShift = useLiveQuery(() => db.shifts.where("status").equals("open").first(), []);

  // Tutup modal shift jika sudah ada shift aktif
  useEffect(() => {
    if (activeShift) {
      setShowShiftModal(false);
    }
  }, [activeShift]);

  // Transformasi data Dexie ke format MacaronProduct
  const products: MacaronProduct[] = React.useMemo(() => {
    if (!dbProducts || !dbVariants) return [];

    return dbVariants.map((v) => {
      const product = dbProducts.find((p) => p.id === v.product_id);
      return {
        id: v.id,
        name: `${product?.name || "Unknown"} - ${v.name}`,
        category: "Kategori", // TODO: Ambil nama kategori jika sudah ada db.categories
        price: v.price,
        stock: v.stock_quantity,
        minStockAlert: v.min_stock_alert,
      };
    });
  }, [dbProducts, dbVariants]);

  // Ekstrak kategori unik
  const categories = ["Semua"];

  // Auto-focus barcode
  useEffect(() => {
    if (!showShiftModal && !isCheckingOut) {
      barcodeInputRef.current?.focus();
    }
  }, [showShiftModal, isCheckingOut]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !isCheckingOut && !showShiftModal && cartItems.length > 0) {
        e.preventDefault();
        setIsCheckingOut(true);
      } else if (e.key === "Escape") {
        if (isCheckingOut) {
          setIsCheckingOut(false);
        } else if (cartItems.length > 0) {
          const snapshot = cartItems;
          setCartItems([]);
          toast(`Keranjang dikosongkan (${snapshot.length} item)`, {
            action: { label: "Urungkan", onClick: () => setCartItems(snapshot) },
          });
        }
      } else if (e.key === "F2") {
        e.preventDefault();
        barcodeInputRef.current?.focus();
        barcodeInputRef.current?.select();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cartItems, isCheckingOut, showShiftModal]);

  const handleAddToCart = (product: MacaronProduct) => {
    setCartItems((prev) => {
      const existingIndex = prev.findIndex((item) => item.variantId === product.id);
      if (existingIndex >= 0) {
        const next = [...prev];
        next[existingIndex] = {
          ...next[existingIndex],
          quantity: next[existingIndex].quantity + 1,
        };
        return next;
      }
      return [
        ...prev,
        {
          id: `cart_${Date.now()}_${product.id}`,
          variantId: product.id,
          name: product.name,
          unitPrice: product.price,
          quantity: 1,
          discount: "0",
        },
      ];
    });
  };

  const handleUpdateQty = (variantId: string, delta: number) => {
    setCartItems((prev) => {
      return prev
        .map((item) => {
          if (item.variantId === variantId) {
            const nextQty = item.quantity + delta;
            return nextQty > 0 ? { ...item, quantity: nextQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartLine[];
    });
  };

  // Hapus baris DENGAN undo (pages/kasir.md: "Delete: Hapus baris terpilih
  // dengan undo di toast") — kasir yang terburu-buru mudah salah pencet
  // tombol hapus di daftar item yang padat; tanpa jalan pulih, satu tap
  // salah berarti mengulang input dari nol.
  const handleRemoveItem = (variantId: string) => {
    const removed = cartItems.find((item) => item.variantId === variantId);
    if (!removed) return;
    setCartItems((prev) => prev.filter((item) => item.variantId !== variantId));
    toast(`${removed.name} dihapus dari keranjang`, {
      action: {
        label: "Urungkan",
        onClick: () => setCartItems((prev) => [...prev, removed]),
      },
    });
  };

  const handleClearCart = () => {
    if (cartItems.length === 0) return;
    const snapshot = cartItems;
    setCartItems([]);
    toast(`Keranjang dikosongkan (${snapshot.length} item)`, {
      action: {
        label: "Urungkan",
        onClick: () => setCartItems(snapshot),
      },
    });
  };

  const processPayment = async (
    method: string,
    appliedAmount: number,
    breakdown: PaymentBreakdown,
  ) => {
    if (!activeShift) {
      toast.error("Tidak ada shift aktif! Buka shift terlebih dahulu.");
      return;
    }

    try {
      const txId = await enqueueOfflineAction({
        // Literal "tenant" SEBELUMNYA dikirim untuk semua tenant — enqueue
        // masih benar secara mekanis (ULID tetap unik), tapi
        // SyncQueueEntry.tenant_id jadi tidak berarti apa-apa untuk query
        // lokal yang memfilternya (db/index.ts). Diambil dari sesi login.
        tenantId: user?.tenant_id ?? "",
        outletId: activeShift.outlet_id,
        type: "sale",
        payload: {
          // ULID MURNI — lihat catatan sejenis di shift-modal.tsx. Nilai
          // sebelumnya (`sl_${Date.now()}`) BUKAN ULID sama sekali dan
          // tidak konsisten dengan konvensi ID sisanya di sistem ini
          // (D-02, OFFLINE-SYNC-SPEC).
          id: ulid(),
          outlet_id: activeShift.outlet_id,
          shift_id: activeShift.id,
          items: cartItems.map((it) => ({
            variant_id: it.variantId,
            qty: it.quantity.toString(),
            unit_price: it.unitPrice,
            discount: it.discount,
          })),
          // tax SEBELUMNYA tidak pernah dikirim sama sekali, padahal UI
          // menampilkan total SUDAH termasuk PPN 11% (payment-modal.tsx).
          // Tanpa ini, server menghitung ulang grand_total TANPA pajak dan
          // menolak PAYMENT_AMOUNT_MISMATCH — setiap checkout pasti gagal
          // sync, ditemukan lewat sync push nyata (bukan asumsi kode benar
          // karena "terlihat lengkap").
          discount: "0",
          tax: breakdown.taxTotal,
          payments: [
            {
              method: method,
              amount: appliedAmount.toString(),
            },
          ],
          occurred_at: new Date().toISOString(),
        },
      });

      playSuccessChord();
      toast.success(`Transaksi berhasil disimpan! (ULID: ${txId.slice(-6)})`, {
        description: "Tersimpan aman di IndexedDB & siap disinkronisasi.",
      });

      setCartItems([]);
      setIsCheckingOut(false);
      barcodeInputRef.current?.focus();
    } catch (err) {
      toast.error("Gagal menyimpan transaksi lokal");
    }
  };

  const filteredProducts = products.filter((p) => {
    const matchesCat = selectedCategory === "Semua" || p.category === selectedCategory;
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  return (
    <div className="flex min-h-screen flex-col bg-base p-4 md:p-6">
      <POSHeader outletId={activeShift?.outlet_id} />

      <div className="mt-4 grid flex-1 grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Kiri: Katalog */}
        <div className="flex flex-col gap-4 lg:col-span-7 xl:col-span-8">
          <div className="milky-glass flex items-center gap-3 rounded-squircle p-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-pill border-2 border-card-border bg-sweet-custard shadow-hard-sm">
              <Barcode className="h-5 w-5 text-main" />
            </div>
            <div className="relative flex-1">
              <input
                ref={barcodeInputRef}
                type="text"
                placeholder="Scan barcode / cari nama produk... (F2)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pos-touch-target w-full rounded-pill border-2 border-card-border bg-card px-4 py-2 font-sans text-base font-bold text-main placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-sweet-strawberry"
              />
              <Search className="absolute right-4 top-3.5 h-5 w-5 text-muted pointer-events-none" />
            </div>
            <Link
              href="/dashboard"
              className="mochi-button flex h-11 items-center gap-1.5 rounded-pill border-2 border-card-border bg-base px-4 font-sans text-xs font-bold text-main shadow-hard-sm"
            >
              <Layers className="h-4 w-4" />
              <span className="hidden sm:inline">Dasbor</span>
            </Link>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {categories.map((cat) => (
              <button
                type="button"
                key={cat}
                onClick={() => {
                  playPop();
                  setSelectedCategory(cat);
                }}
                className={`mochi-button pos-touch-target rounded-pill border-2 border-card-border px-5 font-sans text-sm font-extrabold transition-all shadow-hard-sm ${
                  selectedCategory === cat
                    ? "bg-sweet-strawberry text-main scale-105"
                    : "bg-card text-main hover:bg-sweet-custard/40"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {filteredProducts.length === 0 ? (
              <div className="col-span-full py-12 text-center text-muted font-bold">
                Belum ada produk di katalog.
              </div>
            ) : (
              filteredProducts.map((p) => (
                <MacaronItem key={p.id} product={p} onSelect={handleAddToCart} />
              ))
            )}
          </div>
        </div>

        {/* Kanan: Keranjang */}
        <div className="lg:col-span-5 xl:col-span-4">
          <POSCart
            items={cartItems}
            onUpdateQty={handleUpdateQty}
            onRemoveItem={handleRemoveItem}
            onClearCart={handleClearCart}
            onCheckout={() => setIsCheckingOut(true)}
          />
        </div>
      </div>

      {isCheckingOut && (
        <PaymentModal
          cartItems={cartItems}
          onClose={() => setIsCheckingOut(false)}
          onPay={processPayment}
        />
      )}

      {showShiftModal && !activeShift && <ShiftModal onClose={() => setShowShiftModal(false)} />}
    </div>
  );
}
