# Taksonomi Event Analytics

> **Status:** 🟡 Draft
> **Prioritas:** 🟠 P1 — murah bila ditetapkan sekarang, sangat mahal bila diperbaiki nanti
> **Urutan baca:** dokumen **ke-6**

---

## 1. Kenapa Sekarang, Bukan Nanti

Metrik di [SUCCESS-METRICS.md](./SUCCESS-METRICS.md) hanya bisa dihitung bila event-nya
memang direkam sejak awal. Menambahkan pelacakan belakangan berarti **kehilangan seluruh
data historis secara permanen** — tidak ada cara mengisi ulang data yang tidak pernah tercatat.

Nama event yang tidak konsisten (`checkout_done` vs `Transaction Completed` vs `sale_ok`)
adalah utang teknis yang menyebar ke dasbor, kueri, dan kepala orang. Sekali menyebar,
memperbaikinya butuh migrasi di banyak tempat sekaligus.

---

## 2. Aturan Penamaan

```
<objek>_<aksi lampau>        contoh: transaction_completed, shift_closed
```

* `snake_case`, selalu objek dulu, lalu aksi dalam bentuk lampau.
* Objek memakai istilah dari [GLOSSARY.md](../GLOSSARY.md) — `shift`, bukan `session`.
* Properti juga `snake_case`; properti waktu diakhiri `_at`, durasi diakhiri `_ms`.
* Nama event **tidak pernah diubah** setelah dirilis. Bila maknanya berubah, buat event baru.

---

## 3. Properti Wajib di Setiap Event

```json
{
  "tenant_id":   "ULID",
  "outlet_id":   "ULID",
  "user_role":   "owner | manager | cashier",
  "device_id":   "hash stabil per perangkat",
  "app_version": "1.4.2",
  "is_offline":  true,
  "occurred_at": "waktu kejadian di perangkat (UTC)",
  "received_at": "waktu diterima server (UTC)"
}
```

**Dua hal yang membuat taksonomi ini berbeda dari POS cloud biasa:**

1. **`is_offline` wajib ada di setiap event.** Tanpa ini, mustahil membuktikan metrik pembeda
   di [SUCCESS-METRICS.md](./SUCCESS-METRICS.md) §3D.
2. **`occurred_at` dan `received_at` dipisah.** Sebuah event bisa tiba berjam-jam setelah
   terjadi. Menganalisis pakai `received_at` akan membuat lonjakan penjualan tampak di jam
   yang salah — dan mengacaukan setiap laporan per jam.

> **Jangan pernah** mengirim `user_id` mentah, nomor telepon, email, atau isi keranjang ke
> perangkat analytics pihak ketiga. Lihat aturan Zero-Sensitive-Logging di
> [SECURITY.md](../40-security/SECURITY.md) §7.

---

## 4. Katalog Event

### A. Aktivasi — prioritas tertinggi

| Event | Properti tambahan | Menjawab |
|---|---|---|
| `tenant_registered` | `source` | Corong akuisisi |
| `catalog_item_added` | `method` (manual/import/from_cart), `item_count` | Hambatan input katalog |
| `sandbox_transaction_created` | — | Apakah mode percobaan dipakai? |
| `first_transaction_completed` | `minutes_since_signup` | **Time-to-First-Transaction** |
| `first_shift_closed` | `hours_since_signup` | **Momen aktivasi** |
| `onboarding_step_abandoned` | `step`, `seconds_on_step` | Di mana tenant menghilang |

### B. Kasir — inti operasional

| Event | Properti tambahan |
|---|---|
| `cart_item_added` | `input_method` (scan/search/tap/shortcut) |
| `transaction_completed` | `item_count`, `payment_methods[]`, `duration_ms`, `is_offline` |
| `transaction_voided` | `reason`, `required_manager_pin` |
| `payment_method_selected` | `method`, `via_shortcut` |
| `receipt_printed` | `type` (thermal/whatsapp), `success` |
| `keyboard_shortcut_used` | `shortcut` |

> `duration_ms` pada `transaction_completed` dan `input_method` pada `cart_item_added`
> adalah bukti langsung untuk prinsip produk #1 ("kasir tidak boleh menunggu") dan asumsi A5.

### C. Offline & Sinkronisasi — pembuktian pembeda

| Event | Properti tambahan |
|---|---|
| `offline_session_started` | `pending_count` |
| `offline_session_ended` | `duration_minutes`, `transactions_created` |
| `sync_batch_pushed` | `batch_size`, `duration_ms`, `success_count`, `failure_count` |
| `sync_conflict_detected` | `conflict_type` |
| `local_storage_pressure` | `used_mb`, `transaction_count` |

> `local_storage_pressure` adalah sistem peringatan dini untuk NFR "10.000 transaksi offline".
> Ia memberi tahu sebelum ada pengguna yang kehilangan data, bukan sesudah.

### D. Shift & Kas

| Event | Properti tambahan |
|---|---|
| `shift_opened` | `opening_cash` |
| `shift_closed` | `variance_amount`, `variance_pct`, `duration_hours` |
| `cash_movement_recorded` | `direction`, `amount` |
| `drawer_kicked_manually` | `had_transaction` |

### E. Kecerdasan & Pemilik

| Event | Properti tambahan |
|---|---|
| `restock_recommendation_shown` | `item_count`, `confidence` |
| `restock_order_sent` | `channel`, `items_ordered`, `recommendation_followed` |
| `owner_dashboard_viewed` | `seconds_viewed` |
| `stock_alert_triggered` | `severity` (matcha/custard/strawberry) |

> `recommendation_followed` adalah satu-satunya bukti bahwa janji "1-Tap Actionable
> Intelligence" di PRD §1 benar-benar terwujud. Bila rasionya rendah, fitur AI hanyalah
> laporan yang dipercantik.

---

## 5. Cara Kerja Analytics Saat Offline

Event yang dibuat saat offline **wajib diantre secara lokal** dan dikirim bersama antrean
sinkronisasi transaksi. Bila tidak, data analytics justru akan hilang tepat pada momen yang
paling ingin kita pelajari.

Aturannya sama dengan transaksi: FIFO, idempoten berdasarkan `event_id` (ULID), dan
antrean analytics **tidak boleh** menghambat antrean transaksi — uang selalu didahulukan.

Ada implikasi kapasitas: antrean analytics ikut memakan kuota IndexedDB yang sama.
Bila terjadi tekanan penyimpanan, **buang event analytics lebih dulu, jangan pernah transaksi.**

---

## 6. Tata Kelola

- [x] ✅ **Perangkat analytics: tabel PostgreSQL sendiri** (21 Agu 2026). Volume ~20.000
      event/hari pada 100 outlet — sangat kecil untuk Postgres, dan infrastruktur event
      (outbox + Streams) sudah ada. Menambah PostHog berarti menambah ClickHouse tanpa
      manfaat pada skala ini. Visualisasi: SQL, atau Metabase bila dibutuhkan.
      Lihat [TECH-STACK](../10-architecture/TECH-STACK.md) §7.
- [ ] Satu orang menyetujui setiap event baru
- [ ] Skema event diversifikasi di CI agar tidak ada event tak dikenal lolos
- [ ] Tinjau ulang katalog ini setiap akhir fase
