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
