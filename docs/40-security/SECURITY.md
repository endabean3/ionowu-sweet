# 🛡️ Pedoman Keamanan & Standar Proteksi Data ionowu sweet

> **Versi:** 1.0 (Baseline Resmi)  
> **Kategori:** Arsitektur Keamanan Multi-Tenant & POS Fraud Prevention  
> **Status:** Berlaku Penuh di Seluruh Komponen Sistem  
> **Dokumen Terkait:** [FDR.md](../10-architecture/FDR.md), [PRD-01-POS-INTI.md](../00-product/PRD-01-POS-INTI.md), [api/API-GUIDELINES.md](../20-api/API-GUIDELINES.md)

---

## 1. Prinsip Utama: "Zero-Trust & Zero Data Bleed"

Sebagai platform yang menangani transaksi keuangan UMKM, ionowu sweet menerapkan 4 pilar keamanan mutlak:
1. **Isolasi Multi-Tenant Ketat:** Data antar-toko/organisasi terpisah 100% secara kriptografis dan logika database.
2. **Proteksi Anti-Fraud Kasir:** Setiap tindakan berisiko (buka laci tanpa transaksi, void pesanan, diskon besar) tercatat dalam *Immutable Audit Log*.
3. **Autentikasi Bertingkat (RBAC & PIN Shift):** Pemilik memiliki kendali penuh; kasir memiliki akses cepat dengan PIN aman.
4. **Validasi Webhook Kriptografis:** Pembayaran QRIS hanya diproses setelah verifikasi tanda tangan digital HMAC-SHA256.

---

## 2. Isolasi Data Multi-Tenant (*Tenant Scoping Architecture*)

### A. Alur Injeksi Konteks di Backend Go
Setiap request yang melewati middleware autentikasi wajib diekstrak klaim `tenant_id`-nya dan disisipkan ke dalam `context.Context` Go:

```go
// Middleware Go untuk injeksi Tenant ID
func TenantMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        claims, err := ValidateJWT(r.Header.Get("Authorization"))
        if err != nil {
            RespondError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Token tidak valid")
            return
        }
        
        ctx := context.WithValue(r.Context(), TenantIDKey, claims.TenantID)
        ctx = context.WithValue(ctx, UserRoleKey, claims.Role)
        next.ServeHTTP(w, r.WithContext(ctx))
    })
}
```

### B. Aturan Emas SQL (*Parameterized Tenant Query*)
* ❌ **DILARANG:** `SELECT * FROM products WHERE barcode = $1` (Rentan kebocoran data antar-toko).
* ✅ **WAJIB:** `SELECT * FROM products WHERE tenant_id = $1 AND barcode = $2`

> ✅ **Kini ditegakkan otomatis** (22 Agustus 2026). Aturan `wajib-tenant-scope` di
> [30-data/sqlc.yaml](../../30-data/sqlc.yaml) menggagalkan `sqlc vet` bila ada kueri tanpa
> `tenant_id`. Pengecualian untuk tabel lintas-tenant harus ditulis eksplisit beserta
> alasannya. Aturan yang hanya bergantung pada kedisiplinan manusia akan dilanggar cepat
> atau lambat — ini menjadikannya gerbang CI.

---

## 3. Matriks Hak Akses (Role-Based Access Control / RBAC)

> ⚠️ **Diperluas 21 Agustus 2026.** Matriks di bawah mencakup tiga peran staf awal.
> Model lengkap — **tujuh peran dalam tiga kelas principal** (platform, staf tenant, pihak
> eksternal) — ada di **[RBAC-MODEL.md](./RBAC-MODEL.md)**, yang kini menjadi sumber
> kebenaran RBAC. Lihat [ADR-0007](../10-architecture/adr/0007-principal-classes-and-rbac.md).
>
> Perubahan terpenting: `super_admin` **tidak** berada di tabel `users` dan tidak punya akses
> default — ia mengakses data tenant hanya lewat sesi *break-glass* yang beralasan, berbatas
> waktu, tercatat, dan **diberitahukan kepada tenant**.

| Aksi & Fitur Sistem | 👑 Owner | 🧑‍🍳 Manager | 👩‍💼 Cashier |
|---|:---:|:---:|:---:|
| **Buka/Tutup Kasir POS & Buat Transaksi** | ✅ | ✅ | ✅ |
| **Pencarian Produk & Scan Barcode** | ✅ | ✅ | ✅ |
| **Void Transaksi / Hapus Item di Keranjang** | ✅ | ✅ (Dengan Log) | ⚠️ Butuh PIN Manager |
| **Diskon Manual > 20%** | ✅ | ✅ | ⚠️ Butuh PIN Manager |
| **Buka Laci Kas Manual (*No-Sale Drawer Kick*)** | ✅ | ✅ (Audit Log) | ⚠️ Tercatat di Audit Log |
| **Lihat Omzet & Laba Bersih Keseluruhan** | ✅ | ❌ | ❌ |
| **Ubah Harga Pokok (HPP) & Harga Jual** | ✅ | ❌ | ❌ |
| **Kelola Karyawan & Ganti PIN Kasir** | ✅ | ⚠️ Cabangnya saja | ❌ |
| **Tambah / Hapus Cabang (Outlet)** | ✅ | ❌ | ❌ |

---

## 4. Standar Autentikasi & Penyimpanan Kredensial

### A. Password & PIN Shift Kasir
* **Password Akun (Owner/Manager):**
  * Minimal 10 karakter.
  * Di-hash menggunakan **Argon2id** (`time=3, memory=64MB, parallelism=2, salt=16 bytes`).
* **PIN Kasir (4–6 Digit):**
  * Digunakan untuk pergantian kasir cepat tanpa logout akun toko.
  * Di-hash menggunakan **Argon2id** dengan salt unik per pengguna.

### B. Siklus Token JWT
* **Access Token:** Masa aktif pendek (**15 Menit**), ditandatangani menggunakan algoritma asimetris **Ed25519 / RS256**.
* **Refresh Token:** Masa aktif panjang (**30 Hari**), disimpan di tabel database dan Redis untuk memungkinkan *Instant Token Revocation* (misal: jika perangkat kasir hilang atau kasir diberhentikan).

---

### C. Auto-Lock Layar Kasir (*PIN Lock*)

Dipindahkan dari `FDR.md` §5.2 pada 21 Agustus 2026.

Kasir yang meninggalkan layar kasir selama **>5 menit** otomatis terkunci dan membutuhkan
PIN untuk melanjutkan transaksi. Ini mencegah transaksi disisipkan oleh orang lain memakai
sesi kasir yang sedang aktif — salah satu modus fraud POS yang paling sederhana.

Dua hal yang harus diputuskan sebelum implementasi:

* **Penguncian tidak boleh mengosongkan keranjang.** Kasir yang kembali harus menemukan
  pesanan pelanggan masih utuh, bukan harus mengulang input dari awal.
* **Penguncian harus tetap bekerja saat offline** — verifikasi PIN dilakukan terhadap hash
  yang tersimpan lokal, bukan lewat panggilan ke server.

---

## 5. Keamanan Webhook & Transaksi Pembayaran

### A. Verifikasi Signature QRIS (HMAC-SHA256)
Semua notifikasi settlement pembayaran QRIS dari payment gateway wajib diverifikasi:

```go
func VerifyWebhookSignature(payload []byte, receivedSignature string, secretKey string) bool {
    mac := hmac.New(sha256.New, []byte(secretKey))
    mac.Write(payload)
    expectedSignature := hex.EncodeToString(mac.Sum(nil))
    return hmac.Equal([]byte(receivedSignature), []byte(expectedSignature))
}
```

### B. Mitigasi Serangan Replay (*Replay Attack Prevention*)
Setiap webhook wajib menyertakan header `X-Timestamp`. Jika selisih waktu request dengan waktu server melebihi **300 detik (5 menit)**, request otomatis ditolak.

---

## 6. Immutable Audit Trail (*Pencatatan Jejak Audit Anti-Fraud*)

Semua aksi sensitif disimpan di tabel `audit_logs` yang bersifat *append-only* (tidak bisa di-update atau di-delete oleh user mana pun):

```sql
CREATE TABLE audit_logs (
    id VARCHAR(26) PRIMARY KEY,
    tenant_id VARCHAR(26) NOT NULL,
    outlet_id VARCHAR(26) NOT NULL,
    actor_user_id VARCHAR(26) NOT NULL,
    action_type VARCHAR(50) NOT NULL, -- VOID_TRANSACTION, DRAWER_KICK, MANUAL_DISCOUNT, PRICE_OVERRIDE
    reference_id VARCHAR(100),         -- ID transaksi / shift terkait
    metadata JSONB,                    -- Rincian nominal selisih / item yang dibatalkan
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_audit_tenant_action ON audit_logs(tenant_id, action_type, created_at);
```

---

## 7. Aturan Zero-Sensitive-Logging

Log aplikasi di Docker / Server dilarang keras mencatat data sensitif:
* ❌ `password`, `pin_code`, `jwt_token`, `authorization_header`.
* ❌ Data kartu debit/kredit pelanggan (Full PAN / CVV).
* ✅ Data yang boleh dicatat: `request_id`, `tenant_id`, `outlet_id`, `status_code`, `execution_time_ms`.
