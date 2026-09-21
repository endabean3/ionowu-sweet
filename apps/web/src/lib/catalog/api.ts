import { JaringanError } from "@/lib/auth/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

// Bentuk PERSIS yang dibaca services/pos-engine/internal/httpapi/catalog.go
// PostProduct. Sebelumnya payload di sini punya "unit" di level produk dan
// "cost" (bukan "cost_price") sebagai number (bukan string) — backend
// TIDAK PUNYA field "unit"/"cost" sama sekali dan struct-nya bertipe
// string untuk price/cost_price, jadi json.Decode selalu gagal dengan
// "cannot unmarshal number into Go struct field ... of type string".
// Setiap percobaan submit form Tambah Produk berakhir 400 "Payload tidak
// valid" — dibuktikan lewat POST nyata ke API, bukan dugaan baca kode.
export interface CreateProductPayload {
  name: string;
  description?: string;
  variants: {
    name: string;
    sku?: string;
    barcode?: string;
    price: string;
    costPrice: string;
    uom: string;
    /**
     * Angka desimal yang diizinkan untuk kuantitas jual (0–3, migrasi 00003).
     * 0 = dijual utuh. > 0 = curah/timbang, dan HANYA nilai ini yang membuat
     * layar kasir menampilkan dialog jumlah — tanpa dikirim, varian "ml"
     * tetap tersimpan berpresisi 0 dan parfum refill tidak bisa dijual 30 ml.
     */
    uomPrecision: number;
  }[];
}

export async function createProduct(accessToken: string, payload: CreateProductPayload) {
  const res = await fetch(`${API_URL}/products`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      name: payload.name,
      description: payload.description ?? "",
      variants: payload.variants.map((v) => ({
        name: v.name,
        sku: v.sku,
        barcode: v.barcode,
        price: v.price,
        cost_price: v.costPrice,
        uom: v.uom,
        uom_precision: v.uomPrecision,
      })),
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || "Gagal menyimpan produk ke server");
  }

  return res.json();
}

/** Baris CSV yang tidak diimpor beserta alasannya (lihat catalog_import.go). */
export interface BarisDilewati {
  baris: number;
  alasan: string;
}

export interface HasilImpor {
  total_records: number;
  dilewati: BarisDilewati[];
}

/**
 * Unggah CSV katalog ke POST /products/import.
 *
 * Content-Type TIDAK diisi manual: browser harus menulis sendiri boundary
 * multipart-nya. Mengisinya "multipart/form-data" tanpa boundary membuat
 * server gagal membaca form dan menjawab "Gagal memproses form data".
 */
export async function importProducts(accessToken: string, file: File): Promise<HasilImpor> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${API_URL}/products/import`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.error?.message ?? body?.error ?? "Impor gagal di server");
  }
  return {
    total_records: body?.total_records ?? 0,
    dilewati: Array.isArray(body?.dilewati) ? body.dilewati : [],
  };
}

/** Isian PATCH /variants/{id}. Field yang tidak diisi = tidak diubah. */
export interface VariantPatch {
  name?: string;
  /** String desimal ("25000"), bukan number — uang tidak pernah float. */
  price?: string;
  /** Harga modal. Owner saja (RBAC-MODEL §Matriks "Ubah HPP & harga jual"). */
  cost_price?: string;
  /** "" = kosongkan barcode. */
  barcode?: string;
  min_stock_alert?: string;
  is_active?: boolean;
  /** Satuan stok (ADR-0012). Hanya boleh DITETAPKAN sekali; server menolak
   *  penggantiannya karena ledger stok sudah tercatat dalam satuan itu. */
  stock_uom?: string;
  /** Berapa satuan stok per 1 satuan jual — 0,9 g per ml untuk bibit. */
  stock_factor?: string;
}

/**
 * Isian layar "Ubah barang" langsung dari server.
 *
 * Endpoint ini ada karena **HPP sengaja TIDAK ikut `/sync/pull`**: apa pun
 * yang disinkronkan ikut menetap di IndexedDB setiap ponsel kasir, yang
 * hanya dijaga kunci layar ponsel. Margin usaha adalah informasi paling
 * sensitif bagi pemilik UMKM (SECURITY.md §3), jadi ia hanya diambil saat
 * dibutuhkan, oleh owner, lewat jaringan.
 */
export interface VariantDetail {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  price: string;
  /** Hanya terisi untuk owner; manager menerima respons tanpa field ini. */
  cost_price?: string;
  min_stock_alert: string;
  uom: string;
  uom_precision: number;
  is_active: boolean;
  /** "" = satuan stok sama dengan satuan jual. */
  stock_uom: string;
  stock_factor: string;
}

export async function fetchVariantDetail(accessToken: string, id: string): Promise<VariantDetail> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/variants/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new JaringanError();
  }
  const b = await res.json().catch(() => null);
  if (!res.ok) {
    throw new KatalogError(b?.error?.message ?? "Gagal memuat barang", b?.error?.code);
  }
  return b?.data as VariantDetail;
}

export interface ProductPatch {
  name?: string;
  is_active?: boolean;
}

/** Galat dari server yang pesannya layak ditampilkan apa adanya ke pemilik. */
export class KatalogError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function patch(accessToken: string, path: string, body: object): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new JaringanError();
  }
  if (!res.ok) {
    const b = await res.json().catch(() => null);
    throw new KatalogError(b?.error?.message ?? "Gagal menyimpan ke server", b?.error?.code);
  }
}

export function patchProduct(accessToken: string, id: string, body: ProductPatch) {
  return patch(accessToken, `/products/${encodeURIComponent(id)}`, body);
}

export function patchVariant(accessToken: string, id: string, body: VariantPatch) {
  return patch(accessToken, `/variants/${encodeURIComponent(id)}`, body);
}
