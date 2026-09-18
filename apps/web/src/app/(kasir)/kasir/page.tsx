"use client";

import { type CartLine, POSCart } from "@/components/pos/cart";
import { POSHeader } from "@/components/pos/header";
import { LastReceipt } from "@/components/pos/last-receipt";
import { MacaronItem, type MacaronProduct } from "@/components/pos/macaron-item";
import { PrinterPicker } from "@/components/pos/printer-picker";
import { QtyKeypad } from "@/components/pos/qty-keypad";
import { Receipt, type ReceiptData } from "@/components/pos/receipt";
import { Button } from "@/components/ui/button";
import { playPop, playSuccessChord } from "@/lib/audio/haptics";
import { useAuth } from "@/lib/auth/context";
import { profilTerakhir } from "@/lib/auth/profile";
import { isCurah } from "@/lib/catalog/quantity";
import { db } from "@/lib/db";
import { calculateCart } from "@/lib/money/calc";
import { barBawah } from "@/lib/motion/tokens";
import { useReceiptPrinter } from "@/lib/printer/use-receipt-printer";
import { enqueueOfflineAction } from "@/lib/sync/queue";
import Decimal from "decimal.js";
import { useLiveQuery } from "dexie-react-hooks";
import { m } from "framer-motion";
import { ArrowLeft, Barcode, Layers, Search, Wallet } from "lucide-react";
import Link from "next/link";
import React, { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { ulid } from "ulid";
import { type PaymentBreakdown, PaymentModal } from "./payment-modal";
import { ShiftModal } from "./shift-modal";

export default function KasirPage() {
  const { user } = useAuth();
  /** Sesi hidup bila ada; kalau tidak, identitas terakhir di perangkat ini
   *  (lib/auth/profile.ts) — kasir offline tetap punya tenant yang benar. */
  const identitas = user ?? profilTerakhir();
  const [selectedCategory, setSelectedCategory] = useState<string>("Semua");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [cartItems, setCartItems] = useState<CartLine[]>([]);
  const [isCheckingOut, setIsCheckingOut] = useState<boolean>(false);
  const [showShiftModal, setShowShiftModal] = useState<boolean>(true); // Tampilkan shift modal di awal

  // Struk transaksi terakhir. Disimpan SETELAH keranjang dikosongkan supaya
  // kasir boleh langsung melayani pembeli berikutnya sambil struk sebelumnya
  // masih bisa dicetak — "kasir tidak boleh menunggu" (CLAUDE.md §5).
  const [lastReceipt, setLastReceipt] = useState<ReceiptData | null>(null);
  const printer = useReceiptPrinter();

  // Dialog jumlah untuk barang curah (parfum per ml, bahan kue per gram).
  // `line` terisi hanya saat mengubah baris yang sudah ada di keranjang.
  const [qtyTarget, setQtyTarget] = useState<{
    product: MacaronProduct;
    line?: CartLine;
  } | null>(null);

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
  // Argumen ketiga `null` adalah NILAI AWAL selagi kueri berjalan — dan ia
  // wajib ada. Tanpa itu useLiveQuery mengembalikan `undefined` baik saat
  // MASIH MEMUAT maupun saat memang TIDAK ADA shift, sehingga modal "Toko
  // Belum Dibuka" ikut ter-mount sepersekian detik di setiap muat halaman,
  // lalu langsung di-unmount begitu Dexie menjawab.
  //
  // Akibatnya bukan sekadar kedipan: mount→unmount secepat itu terjadi
  // SEBELUM animasi masuk sempat berjalan, dan AnimatePresence meninggalkan
  // node-nya di DOM pada opacity 0 dengan pointer-events aktif — lapisan tak
  // terlihat yang menelan SELURUH ketukan kasir. Layar tampak normal tetapi
  // tidak ada satu tombol pun yang bisa ditekan. Ditemukan lewat
  // getComputedStyle pada dialog yang tersangkut, bukan dari membaca kode.
  const activeShift = useLiveQuery(
    () => db.shifts.where("status").equals("open").first(),
    [],
    null,
  );
  /** null = kueri Dexie belum menjawab. undefined = sudah, dan tidak ada. */
  const shiftBelumDiketahui = activeShift === null;
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

    const variantPerProduk = new Map<string, number>();
    for (const v of dbVariants) {
      variantPerProduk.set(v.product_id, (variantPerProduk.get(v.product_id) ?? 0) + 1);
    }

    return dbVariants.map((v) => {
      const product = dbProducts.find((p) => p.id === v.product_id);
      const namaProduk = product?.name || "Tanpa nama";
      return {
        id: v.id,
        // Nama varian hanya berguna bila ada pilihan. Produk bervarian
        // tunggal ("Default", "Regular") tadinya tampil "Mentega - Default"
        // di kartu, keranjang, DAN struk pembeli.
        name:
          (variantPerProduk.get(v.product_id) ?? 0) > 1 ? `${namaProduk} - ${v.name}` : namaProduk,
        category: "Kategori", // TODO: Ambil nama kategori jika sudah ada db.categories
        price: v.price,
        stock: v.stock_quantity,
        minStockAlert: v.min_stock_alert,
        // Dari server lewat /sync/pull, bukan ditebak dari nama satuan.
        uom: v.uom ?? "pcs",
        uomPrecision: v.uom_precision ?? 0,
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
        // TANPA PPN: Warung Wangi (dan kebanyakan UMKM) bukan PKP, jadi
        // menambah 11% berarti menagih pembeli lebih mahal dari label harga.
        // Server tidak menghitung pajak sendiri — ia memakai `tax` yang
        // dikirim di payload penjualan — jadi cukup diubah di sini. Bila
        // kelak ada tenant PKP, tarif ini pindah ke Pengaturan toko.
        taxRate: "0",
      }),
    [cartItems],
  );

  // Jumlah BARIS, bukan penjumlahan kuantitas: menjumlahkan 30 ml dengan
  // 2 botol menghasilkan "32 item" yang tidak berarti apa-apa.
  const totalItemCount = cartItems.length;

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

  /** Menaruh kuantitas PERSIS ke keranjang (menimpa, bukan menambah). */
  const setQuantity = (product: MacaronProduct, quantity: string) => {
    setCartItems((prev) => {
      const idx = prev.findIndex((item) => item.variantId === product.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity };
        return next;
      }
      return [
        ...prev,
        {
          id: `cart_${Date.now()}_${product.id}`,
          variantId: product.id,
          name: product.name,
          unitPrice: product.price,
          quantity,
          discount: "0",
          uom: product.uom,
          uomPrecision: product.uomPrecision,
        },
      ];
    });
  };

  const handleAddToCart = (product: MacaronProduct) => {
    // Barang curah TIDAK bisa ditambah satu-satu: tidak ada yang menjual
    // parfum dengan mengetuk 30 kali. Ketukannya membuka dialog jumlah.
    // Barang satuan tetap seperti semula — satu ketuk, satu item, tanpa
    // langkah tambahan (CLAUDE.md §5 "kasir tidak boleh menunggu").
    if (isCurah(product.uomPrecision)) {
      setQtyTarget({ product });
      return;
    }
    setCartItems((prev) => {
      const existingIndex = prev.findIndex((item) => item.variantId === product.id);
      if (existingIndex >= 0) {
        const next = [...prev];
        next[existingIndex] = {
          ...next[existingIndex],
          quantity: new Decimal(next[existingIndex].quantity).plus(1).toString(),
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
          quantity: "1",
          discount: "0",
          uom: product.uom,
          uomPrecision: product.uomPrecision,
        },
      ];
    });
  };

  // Hanya dipakai barang satuan; baris curah memakai dialog jumlah.
  const handleUpdateQty = (variantId: string, delta: number) => {
    setCartItems((prev) => {
      return prev
        .map((item) => {
          if (item.variantId === variantId) {
            const nextQty = new Decimal(item.quantity).plus(delta);
            return nextQty.gt(0) ? { ...item, quantity: nextQty.toString() } : null;
          }
          return item;
        })
        .filter(Boolean) as CartLine[];
    });
  };

  const handleEditQty = (line: CartLine) => {
    const product = products.find((p) => p.id === line.variantId);
    if (!product) return;
    setQtyTarget({ product, line });
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
        tenantId: identitas?.tenant_id ?? "",
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
            // Sudah string desimal sejak dari keranjang — "30", "0.5".
            qty: it.quantity,
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
        outletAddress: outlet?.address,
        outletPhone: outlet?.phone,
        footer: outlet?.receipt_footer,
        cashierName: identitas?.name ?? "Kasir",
        lines: cartItems.map((it) => ({
          name: it.name,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          discount: it.discount,
          uom: it.uom,
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
      if (printer.bluetooth && printer.autoPrint && printer.printer) {
        // Toko yang selalu memberi struk: langsung cetak. Hook menampilkan
        // "Mencetak…" lalu hasilnya, jadi tidak perlu toast kedua di sini.
        void printer.cetak(struk);
      } else {
        // Cetak ditawarkan, tidak dipaksakan: pembeli warung sering tidak
        // meminta struk. Tombolnya juga tetap ada di bar "Struk terakhir",
        // jadi toast yang hilang sendiri tidak lagi berarti struk hilang.
        toast.success(`Lunas · Rp ${Number(breakdown.grandTotal).toLocaleString("id-ID")}`, {
          description:
            struk.changeAmount > 0
              ? `Kembalian Rp ${struk.changeAmount.toLocaleString("id-ID")}`
              : "Tersimpan di perangkat, dikirim otomatis saat online.",
          action: { label: "Cetak Struk", onClick: () => void printer.cetak(struk) },
        });
      }

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
      <POSHeader
        outletId={activeShift?.outlet_id}
        printer={printer.bluetooth ? printer : undefined}
      />

      <div className="mt-4 grid flex-1 grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Kiri: Katalog */}
        <div className="flex flex-col gap-4 lg:col-span-7 xl:col-span-8">
          <div className="milky-glass flex items-center gap-3 rounded-squircle p-3">
            <div className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-pill border-2 border-card-border bg-sweet-custard shadow-hard-sm sm:flex">
              <Barcode className="h-5 w-5 text-main" />
            </div>
            <div className="relative min-w-0 flex-1">
              <input
                ref={barcodeInputRef}
                type="text"
                placeholder="Cari produk / scan barcode"
                aria-label="Cari produk atau scan barcode (pintasan F2)"
                aria-keyshortcuts="F2"
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

          {/* Disembunyikan selama hanya ada "Semua": satu chip yang tidak
             bisa memilih apa pun hanya memakan satu baris layar ponsel. */}
          <div
            className={`flex gap-2 overflow-x-auto pb-1 ${categories.length > 1 ? "" : "hidden"}`}
          >
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
            onEditQty={handleEditQty}
            onRemoveItem={handleRemoveItem}
            onClearCart={handleClearCart}
            onCheckout={() => setIsCheckingOut(true)}
            emptyExtra={
              lastReceipt && (
                <div className="hidden rounded-squircle-sm border-2 border-card-border bg-card p-3 lg:block">
                  <LastReceipt
                    data={lastReceipt}
                    printing={printer.printing}
                    onPrint={() => void printer.cetak(lastReceipt)}
                  />
                </div>
              )
            }
          />
        </div>
      </div>

      {/* Bar ringkasan LENGKET — hanya di bawah lg. Di ponsel, keranjang
         menumpuk di bawah katalog: tombol bayar tadinya berada di y=2747
         pada layar setinggi 812px, jadi kasir harus menggulir ~2,4 layar
         melewati seluruh produk hanya untuk menagih, dan total belanja tidak
         pernah terlihat sambil memilih barang. Bar ini membuat angka dan
         aksi utama selalu satu ketukan jauhnya. */}
      {/* TANPA AnimatePresence — disengaja, dan mahal dipelajari.
         AnimatePresence yang membungkus SATU anak bersyarat meninggalkan
         node-nya di DOM setelah keluar: opacity 0, tetapi `fixed inset-0`
         dengan pointer-events aktif. Hasilnya lapisan tak terlihat yang
         menelan setiap ketukan — layar kasir tampak normal tetapi tombol
         Bayar tidak bisa ditekan sama sekali. Terbukti pada modal jumlah,
         modal shift, dan bar ini; daftar baris keranjang (anak berkunci
         di dalam map) TIDAK terkena.
         Animasi KELUAR dikorbankan; yang masuk tetap ada. Di mesin kasir,
         layar yang tidak bisa disentuh jauh lebih mahal daripada transisi
         yang hilang. */}
      {cartItems.length > 0 && (
        <m.div
          key="bar-ringkasan"
          variants={barBawah}
          initial="sembunyi"
          animate="tampil"
          className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-card-border bg-card px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl lg:hidden"
        >
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-sans text-xs font-bold text-muted">{totalItemCount} item</p>
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

      {/* Pasangan bar ringkasan di atas untuk keranjang KOSONG: struk
         terakhir tetap satu ketukan jauhnya di ponsel, tempat keranjang
         berada jauh di bawah katalog. Keduanya tidak pernah tampil bersamaan. */}
      {cartItems.length === 0 && lastReceipt && (
        <m.div
          key="bar-struk"
          variants={barBawah}
          initial="sembunyi"
          animate="tampil"
          className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-card-border bg-card px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 lg:hidden"
        >
          <LastReceipt
            data={lastReceipt}
            printing={printer.printing}
            onPrint={() => void printer.cetak(lastReceipt)}
          />
        </m.div>
      )}

      {qtyTarget && (
        <QtyKeypad
          key="modal-jumlah"
          namaProduk={qtyTarget.product.name}
          uom={qtyTarget.product.uom}
          uomPrecision={qtyTarget.product.uomPrecision}
          hargaSatuan={qtyTarget.product.price}
          nilaiAwal={qtyTarget.line?.quantity}
          onClose={() => setQtyTarget(null)}
          onConfirm={(quantity) => {
            setQuantity(qtyTarget.product, quantity);
            setQtyTarget(null);
            barcodeInputRef.current?.focus();
          }}
        />
      )}

      {isCheckingOut && (
        <PaymentModal
          key="modal-bayar"
          totals={cartTotals}
          onClose={() => setIsCheckingOut(false)}
          onPay={processPayment}
        />
      )}

      {showShiftModal && !shiftBelumDiketahui && !activeShift && (
        <ShiftModal key="modal-shift" onClose={() => setShowShiftModal(false)} />
      )}

      {/* Tak terlihat di layar; hanya muncul di hasil cetak. */}
      {lastReceipt && <Receipt data={lastReceipt} />}

      {printer.pickerOpen && <PrinterPicker rp={printer} />}
    </div>
  );
}
