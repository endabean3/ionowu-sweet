"use client";

import { type CartLine, POSCart } from "@/components/pos/cart";
import { POSHeader } from "@/components/pos/header";
import { MacaronItem, type MacaronProduct } from "@/components/pos/macaron-item";
import { PrinterPicker } from "@/components/pos/printer-picker";
import { Receipt, type ReceiptData } from "@/components/pos/receipt";
import { Button } from "@/components/ui/button";
import { playPop, playSuccessChord } from "@/lib/audio/haptics";
import { useAuth } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { calculateCart } from "@/lib/money/calc";
import { barBawah } from "@/lib/motion/tokens";
import {
  type SavedPrinter,
  isBluetoothPrintingAvailable,
  loadSavedPrinter,
  printReceiptBluetooth,
  printerErrorMessage,
} from "@/lib/printer/bluetooth";
import { enqueueOfflineAction } from "@/lib/sync/queue";
import { useLiveQuery } from "dexie-react-hooks";
import { AnimatePresence, m } from "framer-motion";
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

  // Struk transaksi terakhir. Disimpan SETELAH keranjang dikosongkan supaya
  // kasir boleh langsung melayani pembeli berikutnya sambil struk sebelumnya
  // masih bisa dicetak — "kasir tidak boleh menunggu" (CLAUDE.md §5).
  const [lastReceipt, setLastReceipt] = useState<ReceiptData | null>(null);
  const [printerPickerOpen, setPrinterPickerOpen] = useState(false);

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const processingPaymentRef = useRef(false);

  // Data katalog hidup di IndexedDB, yang tidak ada di server. Tanpa gerbang
  // ini, server merender "Belum ada produk di katalog" sementara klien
  // merender grid penuh: React membuang seluruh HTML server dan merender
  // ulang dari nol (mahal di Android murah, tepat di jalur transaksi), DAN
  // kasir sempat melihat pesan palsu bahwa katalognya kosong.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Ambil data dari Dexie
  const dbProducts = useLiveQuery(() => db.products.toArray(), []);
  const dbVariants = useLiveQuery(() => db.variants.toArray(), []);
  const activeShift = useLiveQuery(() => db.shifts.where("status").equals("open").first(), []);
  const outlet = useLiveQuery(
    () => (activeShift?.outlet_id ? db.outlets.get(activeShift.outlet_id) : undefined),
    [activeShift?.outlet_id],
  );

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

  // SATU-SATUNYA perhitungan uang di layar kasir. Keranjang, bar ringkasan
  // mobile, dan modal pembayaran semuanya memakai hasil ini — sebelumnya
  // keranjang dan modal masing-masing memanggil calculateCart dengan tarif
  // PPN yang sama-sama di-hardcode, jadi angka yang dilihat kasir dan angka
  // yang ditagihkan hanya kebetulan sama.
  const cartTotals = React.useMemo(
    () =>
      calculateCart({
        items: cartItems.map((it) => ({
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          discount: it.discount || "0",
        })),
        discount: "0",
        taxRate: "0.11", // PPN 11%
      }),
    [cartItems],
  );

  const totalItemCount = cartItems.reduce((acc, it) => acc + it.quantity, 0);

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

  // Satu pintu untuk "Cetak Struk". Di APK: ESC/POS ke printer Bluetooth
  // (WebView Android mengabaikan window.print). Di browser/PWA: dialog cetak
  // sistem lewat <Receipt>. Kegagalan cetak tidak pernah menyentuh transaksi —
  // penjualannya sudah tersimpan sebelum tombol ini bisa ditekan.
  const cetakStruk = async (
    data: ReceiptData,
    printer: SavedPrinter | null = loadSavedPrinter(),
  ) => {
    if (!isBluetoothPrintingAvailable()) {
      window.print();
      return;
    }
    if (!printer) {
      setPrinterPickerOpen(true);
      return;
    }
    try {
      await printReceiptBluetooth(printer, data);
    } catch (err) {
      toast.error(`Struk gagal dicetak ke ${printer.name}`, {
        description: printerErrorMessage(err),
        action: { label: "Ganti printer", onClick: () => setPrinterPickerOpen(true) },
      });
    }
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

    // Guard submit-ganda pakai ref, BUKAN useState: dua klik sinkron
    // sama-sama membaca state lama sebelum React sempat re-render, jadi
    // guard berbasis state akan lolos begitu saja. Ref berubah seketika.
    if (processingPaymentRef.current) return;
    processingPaymentRef.current = true;

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

      // Disusun dari keranjang SEBELUM dikosongkan, dan seluruhnya dari data
      // lokal — struk harus tetap tercetak saat offline.
      const struk: ReceiptData = {
        transactionId: txId,
        occurredAt: new Date().toISOString(),
        outletName: outlet?.name ?? "Toko",
        cashierName: user?.name ?? "Kasir",
        lines: cartItems.map((it) => ({
          name: it.name,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          discount: it.discount,
        })),
        subtotal: breakdown.subtotal,
        taxTotal: breakdown.taxTotal,
        grandTotal: breakdown.grandTotal,
        method,
        givenAmount: breakdown.givenAmount,
        changeAmount: Math.max(0, breakdown.givenAmount - Number(breakdown.grandTotal)),
        pending: true,
      };
      setLastReceipt(struk);

      playSuccessChord();
      toast.success(`Transaksi berhasil disimpan! (ULID: ${txId.slice(-6)})`, {
        description: "Tersimpan aman di IndexedDB & siap disinkronisasi.",
        // Cetak ditawarkan, tidak dipaksakan: pembeli warung sering tidak
        // meminta struk, dan modal wajib-tutup di tiap transaksi menambah satu
        // ketukan pada jalur tersibuk kasir.
        action: { label: "Cetak Struk", onClick: () => void cetakStruk(struk) },
      });

      setCartItems([]);
      setIsCheckingOut(false);
      barcodeInputRef.current?.focus();
    } catch (err) {
      toast.error("Gagal menyimpan transaksi lokal");
    } finally {
      processingPaymentRef.current = false;
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
    <div className="flex min-h-[100dvh] flex-col bg-base p-4 pb-32 md:p-6 lg:pb-6">
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
              aria-label="Dasbor"
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

          {/* Grid produk sengaja TANPA animasi masuk/stagger. Ini jalur
             scan-to-cart yang dijanjikan < 100ms (PERFORMANCE-BUDGET §3), dan
             daftarnya dirender ulang setiap kali kasir mengetik di kolom cari —
             stagger di sini berarti seluruh katalog berkedip di tiap huruf. */}
          <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {!mounted || !dbProducts || !dbVariants ? (
              // Teks statis, bukan skeleton shimmer — pages/kasir.md melarang
              // animasi dekoratif di layar ini.
              <div className="col-span-full py-12 text-center font-bold text-muted">
                Memuat katalog…
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="col-span-full py-12 text-center text-muted font-bold">
                {searchQuery
                  ? `Tidak ada produk cocok dengan "${searchQuery}".`
                  : "Belum ada produk di katalog."}
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
            totals={cartTotals}
            onUpdateQty={handleUpdateQty}
            onRemoveItem={handleRemoveItem}
            onClearCart={handleClearCart}
            onCheckout={() => setIsCheckingOut(true)}
          />
        </div>
      </div>

      {/* Bar ringkasan LENGKET — hanya di bawah lg. Di ponsel, keranjang
         menumpuk di bawah katalog: tombol bayar tadinya berada di y=2747
         pada layar setinggi 812px, jadi kasir harus menggulir ~2,4 layar
         melewati seluruh produk hanya untuk menagih, dan total belanja tidak
         pernah terlihat sambil memilih barang. Bar ini membuat angka dan
         aksi utama selalu satu ketukan jauhnya. */}
      <AnimatePresence>
        {cartItems.length > 0 && (
          <m.div
            key="bar-ringkasan"
            variants={barBawah}
            initial="sembunyi"
            animate="tampil"
            exit="pergi"
            className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-card-border bg-card px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl lg:hidden"
          >
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-sans text-xs font-bold text-muted">
                  {totalItemCount} item · sudah termasuk PPN
                </p>
                <p className="truncate font-mono text-2xl font-black tabular-nums text-main">
                  Rp {Number(cartTotals.grandTotal.toString()).toLocaleString("id-ID")}
                </p>
              </div>
              <Button
                size="pos-lg"
                variant="primary"
                className="shrink-0 gap-2 shadow-hard"
                onClick={() => setIsCheckingOut(true)}
              >
                <Wallet className="h-5 w-5" aria-hidden="true" />
                Bayar
              </Button>
            </div>
          </m.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isCheckingOut && (
          <PaymentModal
            key="modal-bayar"
            totals={cartTotals}
            onClose={() => setIsCheckingOut(false)}
            onPay={processPayment}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showShiftModal && !activeShift && (
          <ShiftModal key="modal-shift" onClose={() => setShowShiftModal(false)} />
        )}
      </AnimatePresence>

      {/* Tak terlihat di layar; hanya muncul di hasil cetak. */}
      {lastReceipt && <Receipt data={lastReceipt} />}

      <AnimatePresence>
        {printerPickerOpen && (
          <PrinterPicker
            key="modal-printer"
            onClose={() => setPrinterPickerOpen(false)}
            onSelected={(printer) => {
              setPrinterPickerOpen(false);
              if (lastReceipt) void cetakStruk(lastReceipt, printer);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
