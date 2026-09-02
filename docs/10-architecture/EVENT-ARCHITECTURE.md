# Arsitektur Event — Komunikasi Antar-Layanan

> **Status:** 🟡 Draft
> **Prioritas:** 🔴 **P0** — memuat cacat desain yang menyebabkan kehilangan data secara diam-diam
> **Urutan baca:** dokumen **ke-3**

---

## 1. ⚠️ Temuan: Redis Pub/Sub Akan Kehilangan Event

[FDR.md](./FDR.md) §1 v1.0 menetapkan komunikasi antar-layanan sebagai:

> "Events via Redis Pub/Sub"

**Redis Pub/Sub bersifat *fire-and-forget*.** Ia tidak menyimpan apa pun. Bila tidak ada
pelanggan yang sedang terhubung pada detik sebuah pesan diterbitkan, pesan itu **hilang
permanen, tanpa error, tanpa jejak di log mana pun**.

Artinya, dalam desain saat ini:

```
intelligence-worker sedang restart (5 detik)
        │
pos-engine menerbitkan "transaction.completed" ×40
        │
        ▼
   ✗ 40 event hilang selamanya
        │
        ▼
Prediksi restock dilatih dengan data yang bolong
Tidak ada yang tahu. Tidak ada alarm. Angkanya sekadar salah.
```

Setiap deploy, setiap restart kontainer, setiap gangguan jaringan sesaat menciptakan
lubang di data analitik. Ini bukan kegagalan yang berisik — ia jenis kegagalan yang baru
ketahuan berbulan-bulan kemudian, saat ada yang bertanya kenapa rekomendasi restock terasa aneh.

### Perbaikan: Redis Streams

| | Pub/Sub | **Streams** |
|---|---|---|
| Pesan disimpan | ❌ Tidak | ✅ Ya |
| Konsumen offline | ❌ Kehilangan pesan | ✅ Menyusul saat kembali |
| Konfirmasi (ack) | ❌ Tidak ada | ✅ Ada |
| Ulangi dari titik tertentu | ❌ Tidak bisa | ✅ Bisa |
| Beberapa konsumen | ✅ Semua dapat | ✅ Consumer group |
| Komponen tambahan | Tidak | **Tidak** — sudah ada di Redis 7 |

**Biaya perpindahan ini nyaris nol** — Redis 7 sudah ada di stack ([FDR.md](./FDR.md) §2),
tidak perlu Kafka, RabbitMQ, atau NATS. Yang berubah hanya perintah yang dipakai.

> **Rekomendasi:** pakai **Redis Streams** sejak awal. Memperbaikinya nanti berarti menulis
> ulang setiap penerbit dan pelanggan, dan data yang sudah hilang tidak bisa dikembalikan.

---

## 2. Kapan Memakai Event, Kapan Memanggil Langsung

| Situasi | Cara | Alasan |
|---|---|---|
| PWA butuh hasil checkout | **HTTP sinkron** ke Go | Kasir menunggu jawabannya |
| Go perlu memberi tahu dunia bahwa transaksi selesai | **Event** | Go tidak boleh menunggu siapa pun |
| TS perlu data produk | **HTTP** ke Go, atau baca DB | Sederhana, tidak kritis |
| Worker perlu data penjualan | **Event + baca DB** | Asinkron menurut definisinya |
| Notifikasi WA harus terkirim | **Event → job** | Gateway WA bisa lambat/mati |

**Prinsipnya:** gunakan event saat penerbit **tidak peduli** apakah ada yang mendengarkan,
dan **tidak boleh melambat** karena menunggu. Aturan #1 di
[SERVICE-BOUNDARIES.md](./SERVICE-BOUNDARIES.md) §4 memaksa hampir semua komunikasi keluar
dari Go berbentuk event.

---

## 3. Katalog Event

Penamaan mengikuti pola `<objek>.<aksi lampau>`, sejajar dengan konvensi di
[00-product/ANALYTICS-EVENTS.md](../00-product/ANALYTICS-EVENTS.md) §2.

| Event | Penerbit | Pelanggan | Kegunaan |
|---|---|---|---|
| `transaction.completed` | Go | Worker, TS | Data pelatihan, dasbor real-time |
| `transaction.voided` | Go | TS | Audit, dasbor |
| `transaction.refunded` | Go | TS, Worker | Koreksi laporan |
| `stock.level_changed` | Go | TS | Alert stok (FR-14) |
| `stock.below_threshold` | Go | TS | Memicu notifikasi WA |
| `shift.closed` | Go | TS | Ringkasan WA harian (FR-51) |
| `sync.batch_ingested` | Go | TS | Pemantauan kesehatan perangkat |
| `restock.predicted` | Worker | TS | Menyajikan rekomendasi (FR-50) |
| `import.completed` | TS | TS | Memberi tahu pengguna |

### Amplop event

```json
{
  "event_id":    "ULID",
  "event_type":  "transaction.completed",
  "version":     1,
  "tenant_id":   "ULID",
  "outlet_id":   "ULID",
  "occurred_at": "2026-08-21T04:12:33Z",
  "published_at":"2026-08-21T04:12:33Z",
  "payload":     { }
}
```

Tiga bidang yang wajib dipahami alasannya:

* **`event_id`** — konsumen wajib idempoten. Streams menjamin *at-least-once*, bukan
  *exactly-once*; event yang sama **akan** terkirim dua kali pada suatu saat.
* **`version`** — bentuk payload akan berubah. Tanpa versi, perubahan skema akan merusak
  konsumen secara diam-diam.
* **`occurred_at` vs `published_at`** — transaksi offline terjadi berjam-jam sebelum
  diterbitkan. Menyamakan keduanya membuat setiap laporan per jam salah. Ini masalah yang
  sama dengan yang dicatat di [ANALYTICS-EVENTS.md](../00-product/ANALYTICS-EVENTS.md) §3.

---

## 4. Penanganan Kegagalan

```
Event diterbitkan
   │
   ▼
Konsumen memproses ──► sukses ──► XACK
   │
   └─ gagal
        │
        ▼
   Coba lagi dgn backoff (1s, 4s, 16s, 64s, 256s)
        │
        └─ setelah 5 kali gagal ──► Dead Letter Stream
                                        │
                                        └─► ⚠️ alarm ke operator
```

Aturan yang berlaku:

1. **Konsumen wajib idempoten.** Cek `event_id` yang sudah diproses sebelum bertindak.
2. **Dead letter tidak boleh senyap.** Event yang menyerah harus memicu alarm —
   lihat [50-operations/OBSERVABILITY.md](../50-operations/OBSERVABILITY.md).
3. **Kelambatan konsumen harus dipantau.** Selisih antara event terbit dan event ter-ack
   adalah indikator kesehatan sistem yang paling awal.
4. **Penerbitan tidak boleh menggagalkan transaksi.** Bila Redis mati saat checkout,
   transaksi tetap harus berhasil — lihat §5.

---

## 5. Masalah Dual-Write

Skenario yang harus diputuskan sebelum implementasi:

```
Go: BEGIN → simpan transaksi ke Postgres → COMMIT ✅
Go: terbitkan event ke Redis                      ✗ Redis mati
```

Transaksi tersimpan, event hilang. Postgres dan Redis tidak berbagi transaksi, jadi ini
tidak bisa dihindari dengan `try/catch`.

| Pilihan | Cara | Penilaian |
|---|---|---|
| Abaikan | Terima kehilangan sesekali | ❌ Cacat yang sama seperti Pub/Sub, hanya lebih jarang |
| Gagalkan transaksi | Rollback bila publish gagal | ❌ **Tidak boleh.** Redis mati akan menghentikan kasir |
| **Transactional outbox** | Tulis event ke tabel dalam transaksi yang sama; proses terpisah mengirimkannya | ✅ **Disarankan** |

```sql
CREATE TABLE event_outbox (
    id VARCHAR(26) PRIMARY KEY,
    tenant_id VARCHAR(26) NOT NULL,
    event_type VARCHAR(60) NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    published_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX idx_outbox_unpublished ON event_outbox(created_at) WHERE published_at IS NULL;
```

Outbox menjaga prinsip terpenting sistem ini: **kasir tetap berjualan meski komponen lain
mati.** Redis boleh mati; transaksi tetap tercatat, dan event menyusul saat Redis kembali.

> Tabel ini perlu ditambahkan ke [30-data/DATA-MODEL.md](../30-data/DATA-MODEL.md).

---

## 6. Keputusan Terbuka

1. **Redis Streams atau outbox saja?** Outbox + polling langsung ke konsumen menghapus
   Redis dari jalur event sepenuhnya. Lebih sederhana, tetapi menambah beban baca ke Postgres.
2. **Retensi stream.** Berapa lama event disimpan sebelum dipangkas?
3. **Ulang tayang (*replay*).** Bila worker perlu melatih ulang dari nol, apakah ia membaca
   ulang stream atau membaca langsung dari `sales_transactions`? Yang kedua lebih sederhana
   dan kemungkinan besar cukup.
4. **Redis mati saat startup.** Apakah `pos-engine` menolak start, atau start dengan event
   dinonaktifkan? Sejalan dengan prinsip di atas, jawabannya seharusnya **tetap start**.
