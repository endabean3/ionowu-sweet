# Threat Model (STRIDE)

> **Status:** 🟡 Draft · **Prioritas:** 🟠 P1
> **Dokumen Terkait:** [SECURITY.md](./SECURITY.md), [NETWORK-HARDENING.md](../50-operations/NETWORK-HARDENING.md)

---

## 1. Ruang Lingkup

[SECURITY.md](./SECURITY.md) mendaftar **kontrol** yang kami pasang. Dokumen ini bertanya
sebaliknya: **siapa yang menyerang, dengan cara apa, dan apakah kontrol kami benar-benar
menutupnya.**

Aset yang dilindungi, berurutan menurut kerugian bila jebol:

1. **Catatan transaksi tenant** — kebocoran antar-tenant merusak kepercayaan secara permanen
2. **Uang** — pembayaran palsu, pencurian oleh kasir
3. **Kredensial** — password, PIN, token
4. **Ketersediaan kasir** — toko tidak bisa berjualan

---

## 2. Pelaku Ancaman

| Pelaku | Motivasi | Akses awal | Kemampuan |
|---|---|---|---|
| **Kasir nakal** | Uang tunai | Akun kasir sah, akses fisik ke laci | Rendah |
| **Tenant nakal** | Data pesaing | Akun tenant sah | Sedang |
| **Pencuri perangkat** | Data / akses | Perangkat kasir fisik | Rendah — ⚠️ **dampaknya naik sejak CRM**: perangkat kini membawa PII pelanggan ([ADR-0006](../10-architecture/adr/0006-crm-bi-and-python-service.md)) |
| **Penyerang jaringan** | Data, tebusan | Internet | Sedang–tinggi |
| **Gateway palsu** | Barang gratis | Endpoint webhook publik | Sedang |
| **Mantan karyawan** | Balas dendam | Kredensial lama | Rendah |
| **🔴 Super admin dikompromi** | Akses seluruh tenant | Akun platform | **Tertinggi** — satu akun membahayakan semua tenant ([RBAC-MODEL](./RBAC-MODEL.md) §3) |
| **Penyerang portal publik** | Ambil alih akun pelanggan | Login portal | Sedang — permukaan baru sejak [ADR-0007](../10-architecture/adr/0007-principal-classes-and-rbac.md) |

> **Ancaman yang paling mungkin terjadi bukan peretas, melainkan kasir nakal.** Ia punya
> akses sah, akses fisik, dan motif harian. Sebagian besar kerugian POS di dunia nyata
> berasal dari sini, bukan dari serangan jaringan.

---

## 3. Analisis STRIDE

### S — Spoofing (pemalsuan identitas)

| Ancaman | Kontrol | Sisa risiko |
|---|---|---|
| Tebak PIN kasir | Argon2id + `PIN_LOCKED_OUT` | ⚠️ PIN 4 digit lemah; wajib ada pembatasan laju |
| Token curian dari perangkat hilang | Revokasi instan | ⚠️ **Gagal bila Redis restart** → [REDIS-STRATEGY](../10-architecture/REDIS-STRATEGY.md) §2 |
| Webhook palsu | HMAC-SHA256 + timestamp | ✅ Memadai |
| Kasir memakai sesi rekannya | Auto-lock PIN 5 menit (§4C) | ✅ |

### T — Tampering (perusakan data)

| Ancaman | Kontrol | Sisa risiko |
|---|---|---|
| Ubah harga di klien lalu sync | Server hitung ulang → `INVALID_TRANSACTION_TOTAL` | ✅ **Bila benar diterapkan** |
| Sunting IndexedDB langsung | — | 🔴 **Terbuka.** Lihat §4 |
| Ubah audit log | Tabel append-only | ⚠️ Perlu dipaksakan di level hak akses DB, bukan hanya konvensi |
| Ubah stok lewat API | Hanya lewat ledger | ✅ |

### R — Repudiation (penyangkalan)

| Ancaman | Kontrol |
|---|---|
| "Bukan saya yang void transaksi itu" | `audit_logs` dengan `actor_user_id` + IP |
| "Saya tidak buka laci" | `drawer_kicked_manually` tercatat |
| Akun bersama menghapus jejak | ⚠️ **Model harga per outlet** mencegah insentif berbagi akun ([PRICING](../00-product/PRICING-PACKAGING.md) §2) |

### I — Information Disclosure (kebocoran)

| Ancaman | Kontrol | Sisa risiko |
|---|---|---|
| Data bocor antar-tenant lewat SQL | `WHERE tenant_id = $1` wajib | ⚠️ Bergantung disiplin manusia; pertimbangkan RLS |
| **Bocor lewat kunci cache Redis** | `tenant_id` di setiap kunci | ⚠️ **Tidak tertangkap review SQL** → [REDIS-STRATEGY](../10-architecture/REDIS-STRATEGY.md) §4 |
| Rahasia di log | Zero-Sensitive-Logging (§7) | ✅ |
| Postgres terbuka ke internet | Firewall | ⚠️ **Jebakan Docker↔UFW** → [NETWORK-HARDENING](../50-operations/NETWORK-HARDENING.md) §3 |
| UI Dokploy terekspos | Batasi akses | 🔴 Setara root di VPS |

### D — Denial of Service

| Ancaman | Kontrol | Sisa risiko |
|---|---|---|
| Banjir permintaan | Rate limit — **hanya `/auth/login` & `/auth/register`**, in-process per replika ([API-GUIDELINES](../20-api/API-GUIDELINES.md) §6) | ⚠️ Endpoint lain belum dibatasi; versi Redis belum ada |
| Satu tenant menghabiskan sumber daya | Batas per outlet | ⚠️ Worker bisa menguras pool DB → [INTELLIGENCE-WORKER](../10-architecture/INTELLIGENCE-WORKER.md) §6 |
| VPS mati | — | ✅ **Offline-first menyerapnya** |
| IndexedDB penuh | Peringatan bertingkat | 🔴 Satu-satunya jalur ke kegagalan total |

### E — Elevation of Privilege

| Ancaman | Kontrol | Sisa risiko |
|---|---|---|
| Kasir bertindak sebagai owner | RBAC di server | ⚠️ Wajib dicek di server, bukan disembunyikan di UI |
| **Kasir mengakses cabang lain** | — | 🔴 **Terbuka** — `users` tidak terkait outlet ([MULTI-OUTLET](../00-product/MULTI-OUTLET.md) §3) |
| **Super admin membaca data tenant diam-diam** | Break-glass beralasan + notifikasi tenant | ⚠️ Bergantung pada penegakan; **tanpa itu = pintu belakang permanen** |
| **Credential stuffing di portal pelanggan** | — | 🔴 Belum ditangani; butuh rate limit terpisah dari endpoint kasir |
| **Gudang melihat HPP lewat penerimaan barang** | Pisahkan alur fisik & keuangan | ⚠️ Keputusan terbuka ([RBAC-MODEL](./RBAC-MODEL.md) §2) |
| Kasir naik jadi manager lewat API | Validasi peran | ⚠️ Perlu uji khusus |

---

## 4. Risiko Terbuka yang Perlu Keputusan

### 🔴 R1 — Klien tidak bisa dipercaya, dan itu tidak bisa diperbaiki

Kasir yang paham teknis dapat membuka DevTools dan menyunting IndexedDB: mengubah harga,
menghapus transaksi sebelum tersinkron, memalsukan total.

**Ini tidak dapat dicegah** — kode yang berjalan di perangkat pengguna selalu bisa diubah.
Yang bisa dilakukan hanyalah membuatnya **terdeteksi**:

* Server **selalu** menghitung ulang total; ketidakcocokan memicu `INVALID_TRANSACTION_TOTAL`
  dan alarm — bukan sekadar penolakan diam.
* Nomor struk berurutan per shift; lompatan nomor terdeteksi saat rekonsiliasi.
* Pola janggal (void tinggi, selisih kas berulang pada kasir yang sama) dilaporkan ke manager.

> Bingkai yang benar: **fraud dideteksi lewat rekonsiliasi, bukan dicegah lewat kriptografi.**
> Inilah alasan `audit_logs` dan Z-Report jauh lebih penting daripada kelihatannya.

### 🔴 R2 — Kasir dapat mengakses seluruh cabang

Sudah dicatat tiga kali di dokumen berbeda. Perbaikannya kecil (`user_outlet_assignments`),
dampaknya besar. Layak dikerjakan di Fase 0.

### 🟠 R3 — PIN 4 digit hanya punya 10.000 kemungkinan

Dapat diterima **hanya bila** disertai pembatasan laju dan penguncian yang ketat. Kombinasi
minimum: maksimal 5 percobaan, penundaan bertingkat, penguncian butuh manager, dan setiap
kegagalan masuk audit log.

---

## 5. Peninjauan

Dokumen ini ditinjau ulang bila: ada komponen baru yang menghadap internet, ada peran baru,
integrasi pihak ketiga baru, atau setelah setiap insiden keamanan.
