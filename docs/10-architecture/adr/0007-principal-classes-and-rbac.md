# ADR-0007: Tiga Kelas Principal — Platform, Staf Tenant, Pihak Eksternal

| Metadata | Nilai |
|---|---|
| **Status** | **Diterima** (21 Agustus 2026) |
| **Mengubah** | [SECURITY.md](../../40-security/SECURITY.md) §3 · `users.role` di [DATA-MODEL](../../30-data/DATA-MODEL.md) |
| **Dokumen Acuan** | [RBAC-MODEL.md](../../40-security/RBAC-MODEL.md) |

## Konteks

Pemilik produk mengusulkan tujuh peran: super admin, owner, kasir, gudang, SPG, customer,
distributor. Skema saat ini hanya mengenal satu kolom `role VARCHAR(20)` dengan tiga nilai
(`owner`, `manager`, `cashier`), dan `TenantMiddleware` mengasumsikan **setiap request punya
tepat satu `tenant_id`** yang diambil dari JWT.

Analisis menunjukkan ketujuhnya bukan satu jenjang, melainkan **tiga kelas principal dengan
model isolasi yang berbeda**:

1. **Platform** (`super_admin`) — lintas semua tenant; keberadaannya **melanggar** jaminan
   isolasi yang oleh [SECURITY.md](../../40-security/SECURITY.md) §1 disebut kegagalan paling fatal.
2. **Staf tenant** (owner, manager, kasir, gudang, SPG) — satu tenant, outlet tertentu.
3. **Pihak eksternal** (customer, distributor) — **identitas lintas-tenant, data per-tenant**;
   kebalikan dari staf.

Kelas 3 juga membuka auth ke publik untuk pertama kalinya — sampai kini seluruh pengguna
adalah karyawan.

## Alternatif yang Dipertimbangkan

| Opsi | Kelebihan | Kekurangan | Alasan |
|---|---|---|---|
| Perluas `role` jadi 7 nilai | Perubahan paling kecil | Super admin & distributor tidak punya satu `tenant_id`; middleware pecah; mengundang kueri yang salah | Ditolak |
| **Tiga kelas principal terpisah** | Isolasi tetap dapat dinalar; tiap kelas punya aturan sendiri | Middleware & auth harus sadar kelas — menyentuh setiap endpoint | **Dipilih** |
| Sistem auth terpisah per kelas | Isolasi paling tegas | Tiga sistem login untuk dirawat; berlebihan di tahap ini | Ditolak |

## Keputusan

1. **`platform_admins`** terpisah dari `users`. Akses ke data tenant hanya lewat
   **break-glass**: beralasan, maksimal 4 jam, tercatat, **dan tenant diberi tahu**.
2. **`users.role`** diperluas: `owner` · `manager` · `cashier` · `warehouse` · `sales_floor`.
   **`manager` dipertahankan** meski tidak disebut di usulan — ia pemegang rekonsiliasi kas
   dan salah satu dari tiga persona utama.
3. **`identities`** sebagai login global untuk pihak eksternal, dihubungkan per tenant lewat
   `customer_links` dan `distributor_tenant_links`.
4. **`TenantMiddleware` menjadi sadar kelas** — tidak lagi mengasumsikan satu `tenant_id`.
5. Pentahapan: super admin di Fase 0; gudang & SPG di Fase 1; portal pelanggan Fase 2;
   portal distributor Fase 3 (**butuh ADR tersendiri**).

## Konsekuensi

**Positif:**
- Peran mencerminkan kenyataan operasional UMKM yang bertumbuh — gudang dan SPG memang ada
  di toko yang mulai besar
- Isolasi tenant tetap dapat dinalar meski ada akses lintas-tenant
- Akses dukungan pelanggan menjadi **terpantau dan berbatas waktu**, bukan pintu belakang permanen
- Portal pelanggan menjadikan hak PDP dapat dijalankan sendiri oleh pelanggan

**Negatif / biaya yang kami terima:**
- **Menyentuh setiap endpoint.** Middleware dan pemeriksaan otorisasi harus dirombak — inilah
  alasan [RBAC-MODEL](../../40-security/RBAC-MODEL.md) berstatus P0.
- **Auth kini melayani pihak tidak dipercaya.** Portal publik membawa risiko *credential
  stuffing* dan *account enumeration* yang belum ada di [THREAT-MODEL](../../40-security/THREAT-MODEL.md).
- **Super admin adalah akun paling bernilai di sistem.** 2FA wajib; kompromi di sini
  membahayakan seluruh tenant sekaligus.
- **SPG mewajibkan fitur pesanan tertahan** yang selama ini belum tercakup FR mana pun.
- **Portal distributor menyentuh Non-Goals "marketplace pemasok"** — ruang lingkupnya jauh
  lebih besar dari sekadar menambah peran.

**Yang akan kami tinjau ulang bila:**
- Break-glass ternyata terlalu menghambat dukungan pelanggan → perlonggar durasi, **jangan**
  hilangkan pencatatan
- Portal distributor terbukti bukan yang diinginkan pasar → hentikan di Fase 2
