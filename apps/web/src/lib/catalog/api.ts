const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export interface CreateProductPayload {
  name: string;
  unit: string;
  variants: {
    name: string;
    sku?: string;
    barcode?: string;
    price: number;
    cost: number;
  }[];
}

export async function createProduct(accessToken: string, payload: CreateProductPayload) {
  const res = await fetch(`${API_URL}/products`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error("Gagal menyimpan produk ke server");
  }

  return res.json();
}
