"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { MoneyInput } from "@/components/ui/money-input";
import { JaringanError } from "@/lib/auth/api";
import {
  KatalogError,
  type VariantDetail,
  type VariantPatch,
  fetchVariantDetail,
  patchProduct,
  patchVariant,
} from "@/lib/catalog/api";
import { type LocalProduct, type LocalVariant, db } from "@/lib/db";
import Decimal from "decimal.js";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface BarisVarian {
  id: string;
  name: string;
  /** Rupiah bulat sebagai teks, mis. "25000". */
  price: string;
  /** Harga modal. "" selama belum dimuat dari server, atau bila pengguna
   *  bukan owner — HPP tidak pernah dikirim ke peran lain. */
  hpp: string;
  barcode: string;
  minStock: string;
  /** Berapa satuan stok per 1 satuan jual (ADR-0012); "" = tanpa konversi. */
  faktor: string;
  aktif: boolean;
}

function keBaris(v: LocalVariant): BarisVarian {
  return {
    id: v.id,
    name: v.name ?? "",
    price: new Decimal(v.price || 0).toDecimalPlaces(2).toString(),
    hpp: "",
    barcode: v.barcode ?? "",
    minStock: new Decimal(v.min_stock_alert || 0).toString(),
    faktor: "",
    aktif: v.is_active !== false,
  };
}

const UANG = /^\d{1,12}(\.\d{1,2})?$/;
const KUANTITAS = /^\d{1,11}([.,]\d{1,3})?$/;
/** Faktor konversi: DECIMAL(14,4) dan WAJIB > 0 (skema 00003). */
const FAKTOR = /^\d{1,10}([.,]\d{1,4})?$/;

/**
 * Ubah barang dari Katalog: nama, harga jual, barcode, batas stok menipis,
 * dan dijual/tidak di kasir.
 *
 * "Hapus" sengaja berupa NONAKTIFKAN: penjualan dan ledger stok yang sudah
 * ada tetap merujuk barang ini, jadi datanya tidak boleh hilang. Barang
 * nonaktif hilang dari layar kasir setelah sync, dan bisa diaktifkan lagi.
 *
 * Butuh online (sama seperti profil toko di Pengaturan): perubahan katalog
 * harus sampai ke SEMUA perangkat kasir lewat server, bukan hanya perangkat ini.
 */
export function UbahBarang({
  product,
  variants,
  accessToken,
  role,
  onClose,
}: {
  product: LocalProduct;
  variants: LocalVariant[];
  accessToken: string | null;
  role?: string;
  onClose: () => void;
}) {
  const dijualAwal = product.is_active !== false && variants.some((v) => v.is_active !== false);
  const [nama, setNama] = useState(product.name);
  // Barang yang sedang nonaktif: semua variannya juga nonaktif di cermin
  // lokal (server menggabungkan status produk + varian). Tanpa mencentang
  // varian di sini, menyalakan "Dijual di kasir" lagi tidak menghidupkan
  // varian mana pun.
  const [baris, setBaris] = useState<BarisVarian[]>(() =>
    variants.map((v) => ({ ...keBaris(v), aktif: dijualAwal ? v.is_active !== false : true })),
  );
  const [dijual, setDijual] = useState(dijualAwal);
  const [menyimpan, setMenyimpan] = useState(false);
  const [coba, setCoba] = useState(false);
  const [offline, setOffline] = useState(false);

  // Detail dari server: HPP dan faktor satuan stok. Keduanya TIDAK ada di
  // Dexie — HPP karena sengaja tidak disinkronkan (margin tidak boleh
  // menetap di ponsel kasir), faktor karena hanya dipakai di server saat
  // memotong stok. Dimuat sekali saat dialog dibuka.
  const [detail, setDetail] = useState<Record<string, VariantDetail> | null>(null);
  useEffect(() => {
    if (!accessToken) return;
    let batal = false;
    void (async () => {
      try {
        const hasil = await Promise.all(variants.map((v) => fetchVariantDetail(accessToken, v.id)));
        if (batal) return;
        const peta = Object.fromEntries(hasil.map((d) => [d.id, d]));
        setDetail(peta);
        setBaris((bs) =>
          bs.map((b) => {
            const d = peta[b.id];
            if (!d) return b;
            return {
              ...b,
              hpp: d.cost_price ? new Decimal(d.cost_price).toDecimalPlaces(2).toString() : "",
              faktor: d.stock_uom ? new Decimal(d.stock_factor).toString() : "",
            };
          }),
        );
      } catch {
        // Gagal memuat detail bukan alasan menutup dialog: nama, harga jual,
        // dan barcode tetap bisa diubah. Kolom HPP & faktor yang tidak
        // terisi dibiarkan kosong dan TIDAK ikut dikirim saat simpan, jadi
        // nilai yang ada di server tidak pernah tertimpa nol.
        if (!batal) setDetail({});
      }
    })();
    return () => {
      batal = true;
    };
  }, [accessToken, variants]);

  useEffect(() => {
    const cek = () => setOffline(!navigator.onLine);
    cek();
    window.addEventListener("online", cek);
    window.addEventListener("offline", cek);
    return () => {
      window.removeEventListener("online", cek);
      window.removeEventListener("offline", cek);
    };
  }, []);

  // RBAC-MODEL §Matriks: harga jual hanya owner; manager boleh sisanya.
  const bolehHarga = role === "owner";
  const banyakVarian = variants.length > 1;

  const galatNama = nama.trim() === "" ? "Nama barang wajib diisi" : undefined;
  const galatBaris = baris.map((b) => ({
    price: UANG.test(b.price.trim()) ? undefined : "Isi harga, mis. 1000",
    // HPP boleh kosong (belum pernah diisi / bukan owner); yang diisi wajib angka.
    hpp: b.hpp.trim() === "" || UANG.test(b.hpp.trim()) ? undefined : "Isi angka, mis. 8000",
    minStock: KUANTITAS.test(b.minStock.trim()) ? undefined : "Isi angka, mis. 50",
    faktor:
      b.faktor.trim() === "" || FAKTOR.test(b.faktor.trim())
        ? undefined
        : "Isi angka lebih dari 0, mis. 0,9",
  }));
  const sah = !galatNama && galatBaris.every((g) => !g.price && !g.hpp && !g.minStock && !g.faktor);

  const ubahBaris = (i: number, isian: Partial<BarisVarian>) =>
    setBaris((bs) => bs.map((b, j) => (j === i ? { ...b, ...isian } : b)));

  const simpan = async () => {
    setCoba(true);
    if (!sah || menyimpan || !accessToken) return;
    setMenyimpan(true);
    try {
      const namaBaru = nama.trim();
      const produkBerubah = namaBaru !== product.name || dijual !== (product.is_active !== false);
      if (produkBerubah) {
        await patchProduct(accessToken, product.id, { name: namaBaru, is_active: dijual });
      }

      const perubahanVarian: [LocalVariant, BarisVarian, VariantPatch][] = [];
      for (const [i, v] of variants.entries()) {
        const b = baris[i];
        const lama = keBaris(v);
        const p: VariantPatch = {};
        if (b.name.trim() !== lama.name) p.name = b.name.trim();
        if (bolehHarga && !new Decimal(b.price.trim()).equals(lama.price)) {
          p.price = new Decimal(b.price.trim()).toString();
        }
        if (b.barcode.trim() !== lama.barcode) p.barcode = b.barcode.trim();
        // HPP: hanya bila owner, kolomnya terisi, DAN nilainya benar-benar
        // berubah. Mengirim nilai yang sama akan menaikkan permintaan ke
        // gerbang peran tanpa alasan — dan manager yang menyimpan nama
        // barang akan ditolak 403 gara-gara HPP yang tidak ia sentuh.
        const hppLama = detail?.[v.id]?.cost_price;
        if (bolehHarga && b.hpp.trim() !== "" && hppLama !== undefined) {
          if (!new Decimal(b.hpp.trim()).equals(new Decimal(hppLama))) {
            p.cost_price = new Decimal(b.hpp.trim()).toString();
          }
        }
        // Faktor satuan stok: hanya untuk barang yang MEMANG punya satuan
        // stok berbeda. Menetapkannya pertama kali dari layar ini sengaja
        // tidak disediakan — itu keputusan bentuk data, bukan koreksi angka,
        // dan jalurnya tetap impor CSV.
        const d = detail?.[v.id];
        if (d?.stock_uom && b.faktor.trim() !== "") {
          const faktorBaru = new Decimal(b.faktor.trim().replace(",", "."));
          if (!faktorBaru.equals(new Decimal(d.stock_factor))) {
            p.stock_factor = faktorBaru.toString();
          }
        }
        const minBaru = new Decimal(b.minStock.trim().replace(",", "."));
        if (!minBaru.equals(lama.minStock)) p.min_stock_alert = minBaru.toString();
        // Produk nonaktif = semua varian ikut tidak dijual; mengaktifkannya
        // lagi menghidupkan varian yang dicentang.
        const aktif = dijual && b.aktif;
        if (aktif !== lama.aktif) p.is_active = aktif;
        if (Object.keys(p).length > 0) perubahanVarian.push([v, b, p]);
      }
      for (const [v, , p] of perubahanVarian) {
        await patchVariant(accessToken, v.id, p);
      }

      // Cermin lokal SEKARANG, supaya layar kasir di perangkat ini langsung
      // berubah tanpa menunggu sync pull berikutnya.
      await db.transaction("rw", db.products, db.variants, async () => {
        if (produkBerubah) {
          await db.products.update(product.id, { name: namaBaru, is_active: dijual });
        }
        for (const [v, , p] of perubahanVarian) {
          await db.variants.update(v.id, {
            ...(p.name !== undefined && { name: p.name }),
            ...(p.price !== undefined && { price: p.price }),
            ...(p.barcode !== undefined && { barcode: p.barcode || undefined }),
            ...(p.min_stock_alert !== undefined && { min_stock_alert: p.min_stock_alert }),
            ...(p.is_active !== undefined && { is_active: p.is_active }),
          });
        }
      });

      if (!produkBerubah && perubahanVarian.length === 0) {
        toast("Tidak ada yang berubah");
      } else {
        toast.success(dijual ? "Barang disimpan" : "Barang dinonaktifkan — tidak tampil di kasir");
      }
      onClose();
    } catch (err) {
      toast.error(
        err instanceof JaringanError
          ? "Tidak bisa menghubungi server. Coba lagi saat online."
          : err instanceof KatalogError
            ? err.message
            : "Gagal menyimpan barang",
      );
    } finally {
      setMenyimpan(false);
    }
  };

  const bisaSimpan = !offline && !menyimpan && !!accessToken;

  return (
    <Modal
      title="Ubah barang"
      onClose={onClose}
      footer={
        <Button
          size="pos-lg"
          variant="primary"
          className="w-full shadow-hard"
          disabled={!bisaSimpan}
          onClick={simpan}
        >
          {menyimpan ? "Menyimpan…" : "Simpan"}
        </Button>
      }
    >
      <div className="flex flex-col gap-4 p-4 sm:p-6">
        {offline && (
          <output className="block rounded-2xl border-2 border-card-border bg-sweet-custard p-3 font-sans text-sm font-semibold text-main">
            Sedang offline. Perubahan katalog bisa disimpan setelah online.
          </output>
        )}

        <Input
          label="Nama barang"
          value={nama}
          onChange={(e) => setNama(e.target.value)}
          maxLength={200}
          autoComplete="off"
          error={coba ? galatNama : undefined}
        />

        {baris.map((b, i) => {
          const v = variants[i];
          const satuanStok = v.stock_uom || v.uom;
          const g = galatBaris[i];
          return (
            <fieldset
              key={b.id}
              className="flex flex-col gap-3 rounded-2xl border-2 border-card-border/40 p-3"
            >
              <legend className="px-1 font-sans text-sm font-bold text-main">
                {banyakVarian ? `Varian ${i + 1}` : "Harga & stok"}
              </legend>
              {banyakVarian && (
                <Input
                  label="Nama varian"
                  value={b.name}
                  onChange={(e) => ubahBaris(i, { name: e.target.value })}
                  maxLength={200}
                  autoComplete="off"
                />
              )}
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`harga-${b.id}`} className="text-sm font-medium text-main">
                  Harga jual per {v.uom}
                </label>
                <MoneyInput
                  id={`harga-${b.id}`}
                  value={b.price}
                  onChange={(e) => ubahBaris(i, { price: e.target.value })}
                  disabled={!bolehHarga}
                  min={0}
                  aria-invalid={coba && g.price ? true : undefined}
                  aria-describedby={`harga-${b.id}-hint`}
                />
                <p
                  id={`harga-${b.id}-hint`}
                  className={`text-xs ${coba && g.price ? "font-semibold text-red-700" : "text-main"}`}
                >
                  {!bolehHarga
                    ? "Hanya owner yang bisa mengubah harga."
                    : coba && g.price
                      ? g.price
                      : "Berlaku di semua kasir setelah sync."}
                </p>
              </div>
              {/* HPP hanya untuk owner. Untuk peran lain kolomnya TIDAK
                 dirender sama sekali — bukan sekadar dinonaktifkan: server
                 memang tidak mengirim nilainya, jadi kolom kosong yang
                 terkunci hanya akan terbaca seperti "HPP-nya nol". */}
              {bolehHarga && (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={`hpp-${b.id}`} className="text-sm font-medium text-main">
                    Harga modal (HPP) per {v.uom}
                  </label>
                  <MoneyInput
                    id={`hpp-${b.id}`}
                    value={b.hpp}
                    onChange={(e) => ubahBaris(i, { hpp: e.target.value })}
                    disabled={detail === null}
                    min={0}
                    aria-invalid={coba && g.hpp ? true : undefined}
                    aria-describedby={`hpp-${b.id}-hint`}
                  />
                  <p
                    id={`hpp-${b.id}-hint`}
                    className={`text-xs ${coba && g.hpp ? "font-semibold text-red-700" : "text-main"}`}
                  >
                    {detail === null
                      ? "Memuat…"
                      : coba && g.hpp
                        ? g.hpp
                        : "Dipakai menghitung laba. Tidak pernah tampil di kasir atau nota."}
                  </p>
                </div>
              )}

              {/* Faktor konversi hanya muncul bila barang ini MEMANG dijual
                 dalam satuan berbeda dari stoknya (ADR-0012). */}
              {detail?.[b.id]?.stock_uom && (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={`faktor-${b.id}`} className="text-sm font-medium text-main">
                    1 {v.uom} = berapa {detail[b.id].stock_uom}?
                  </label>
                  <Input
                    id={`faktor-${b.id}`}
                    value={b.faktor}
                    onChange={(e) => ubahBaris(i, { faktor: e.target.value })}
                    inputMode="decimal"
                    autoComplete="off"
                    error={coba ? g.faktor : undefined}
                  />
                  <p className="text-xs text-main">
                    Dijual per {v.uom}, stoknya dihitung {detail[b.id].stock_uom}. Mengubah angka
                    ini TIDAK mengubah sisa stok yang sudah ada — hanya penjualan berikutnya. Satuan
                    stoknya sendiri tidak bisa diganti: seluruh riwayat stok barang ini sudah
                    tercatat dalam {detail[b.id].stock_uom}.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label={`Stok menipis (${satuanStok})`}
                  value={b.minStock}
                  onChange={(e) => ubahBaris(i, { minStock: e.target.value })}
                  inputMode="decimal"
                  autoComplete="off"
                  error={coba ? g.minStock : undefined}
                />
                <Input
                  label="Barcode"
                  value={b.barcode}
                  onChange={(e) => ubahBaris(i, { barcode: e.target.value })}
                  maxLength={100}
                  autoComplete="off"
                  placeholder="(kosong)"
                />
              </div>
              {banyakVarian && (
                <label className="flex cursor-pointer items-center gap-3 font-sans text-sm font-semibold text-main">
                  <input
                    type="checkbox"
                    checked={b.aktif}
                    onChange={(e) => ubahBaris(i, { aktif: e.target.checked })}
                    className="h-5 w-5 accent-sweet-strawberry"
                  />
                  Varian ini dijual
                </label>
              )}
            </fieldset>
          );
        })}

        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-card-border bg-surface p-4">
          <input
            type="checkbox"
            checked={dijual}
            onChange={(e) => setDijual(e.target.checked)}
            className="mt-0.5 h-6 w-6 shrink-0 accent-sweet-strawberry"
            aria-describedby="dijual-hint"
          />
          <span>
            <span className="block font-sans text-sm font-bold text-main">Dijual di kasir</span>
            <span id="dijual-hint" className="block font-sans text-xs text-main">
              Matikan untuk menyembunyikan barang dari kasir (mis. sudah tidak dijual). Riwayat
              penjualan dan stoknya tetap tersimpan, dan bisa dinyalakan lagi.
            </span>
          </span>
        </label>
      </div>
    </Modal>
  );
}
