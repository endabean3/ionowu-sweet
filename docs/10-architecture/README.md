# 10-architecture — Bagaimana Sistem Ini Dibentuk

Folder ini menjawab **bagaimana sistem dibangun** dan **kenapa bentuknya begitu**.
Alasan produknya ada di [00-product/](../00-product/); wujud datanya di [30-data/](../30-data/).

---

## 1. Urutan Baca

| # | Dokumen | Menjawab | Status |
|:-:|---|---|:---:|
| 1 | [FDR.md](./FDR.md) | Komponen apa yang ada dan bagaimana data mengalir | ✅ v1.1 |
| 2 | [SERVICE-BOUNDARIES.md](./SERVICE-BOUNDARIES.md) | Kode baru masuk Go, TS, atau Python? | 🟡 Draft |
| 3 | [EVENT-ARCHITECTURE.md](./EVENT-ARCHITECTURE.md) | Bagaimana layanan saling bicara | 🟡 Draft |
| 4 | [REDIS-STRATEGY.md](./REDIS-STRATEGY.md) | Lima peran Redis & konfliknya | 🟡 Draft |
| 5 | [INTELLIGENCE-WORKER.md](./INTELLIGENCE-WORKER.md) | Apa sebenarnya layanan Python itu | 🟡 Draft |
| 6 | [SCALABILITY-RELIABILITY.md](./SCALABILITY-RELIABILITY.md) | Sanggup berapa besar, dan apa yang terjadi saat rusak | 🟡 Draft |
| 7 | [TECH-STACK.md](./TECH-STACK.md) | Tool apa yang dipakai dan kenapa | ✅ Disetujui |
| 8 | [ANALYTICS-BI.md](./ANALYTICS-BI.md) | Jalur analitik agar BI tidak mengganggu kasir | 🟡 Draft |
| — | [adr/](./adr/) | Catatan keputusan yang sulit dibalik | ✅ 3 ADR |

```
FDR (bentuk sistem)
 ├─► SERVICE-BOUNDARIES  ──► aturan penempatan kode
 ├─► EVENT-ARCHITECTURE  ──► REDIS-STRATEGY
 ├─► INTELLIGENCE-WORKER
 └─► SCALABILITY-RELIABILITY ──► 50-operations/
```

---

## 2. Architecture Decision Records

| ADR | Keputusan | Status |
|---|---|---|
| [0001](./adr/0001-hybrid-go-ts-docker-architecture.md) | Hybrid Go + TypeScript + Docker | Diterima |
| [0002](./adr/0002-sweet-creamy-spatial-luxe-design-language.md) | Bahasa desain Sweet Creamy Spatial Luxe | Diterima |
| [0003](./adr/0003-dokploy-self-hosted-paas.md) | Dokploy + Traefik sebagai platform deploy | Diterima |
| [0004](./adr/0004-ci-build-and-registry.md) | Build di CI + ghcr.io, bukan di VPS | **Diterima** |
| [0005](./adr/0005-telemetry-external-data-internal.md) | Telemetri eksternal, data internal | **Diterima** |
| [0006](./adr/0006-crm-bi-and-python-service.md) | CRM & BI masuk lingkup; layanan Python aktif | **Diterima** |
| [0007](./adr/0007-principal-classes-and-rbac.md) | Tiga kelas principal (platform/staf/eksternal) | **Diterima** |
| [TEMPLATE](./adr/TEMPLATE.md) | — | Untuk ADR berikutnya |

**ADR yang masih perlu ditulis:**

| Usulan | Kenapa layak jadi ADR |
|---|---|
| Redis Streams + outbox, bukan Pub/Sub | Sulit dibalik; memengaruhi setiap penerbit & konsumen |
| Pemilihan gateway QRIS | Keputusan komersial + kepatuhan |
| Kunci baris Postgres untuk mutex stok | Menentukan apakah penskalaan horizontal mungkin |
| PostgreSQL sebagai basis data utama | Dipakai di mana-mana tetapi tidak pernah dicatat sebagai keputusan |
| ULID sebagai primary key | Fondasi seluruh strategi offline |
| Next.js + PWA, bukan aplikasi native | Sudah disinggung di Non-Goals, belum punya ADR |

---

## 3. Perubahan Struktural 21 Agustus 2026

FDR sebelumnya menjawab empat pertanyaan berbeda dalam satu dokumen (311 baris).
Isinya dipindahkan, **tidak ada yang dihapus**:

| Dulu di FDR | Sekarang di |
|---|---|
| §2 Skema PostgreSQL | [30-data/DATA-MODEL.md](../30-data/DATA-MODEL.md) §3 |
| §4 `docker-compose.prod.yml` | [50-operations/DOCKER.md](../50-operations/DOCKER.md) §6 |
| §5 Auto-lock PIN kasir | [40-security/SECURITY.md](../40-security/SECURITY.md) §4C |
| §5 Tenant scoping, webhook HMAC | Sudah tercakup di [40-security/SECURITY.md](../40-security/SECURITY.md) |

---

## 4. Temuan yang Memerlukan Keputusan

Empat hal yang saya temukan saat menulis folder ini:

### 🔴 P0 — Menyebabkan kehilangan data secara diam-diam

**1. Redis Pub/Sub akan kehilangan event.** FDR v1.0 menetapkan Pub/Sub untuk komunikasi
antar-layanan. Pub/Sub bersifat *fire-and-forget* — bila konsumen sedang restart, pesan
hilang permanen tanpa error. Setiap deploy menciptakan lubang di data analitik.
**Perbaikan: Redis Streams**, biayanya nyaris nol karena Redis 7 sudah ada di stack.
→ [EVENT-ARCHITECTURE.md](./EVENT-ARCHITECTURE.md) §1

**2. Revokasi token gagal saat Redis restart.** SECURITY §4B menjanjikan *instant token
revocation* lewat Redis, tetapi Redis tanpa persistensi kehilangan daftar cabutan saat
restart — token yang sudah dicabut kembali berlaku. **Perbaikan: Postgres sebagai sumber
kebenaran, Redis hanya percepatan.** → [REDIS-STRATEGY.md](./REDIS-STRATEGY.md) §2

**3. Masalah dual-write belum ditangani.** Bila Redis mati setelah transaksi tersimpan,
event hilang. **Perbaikan: transactional outbox** — menjaga prinsip "kasir tetap jualan".
→ [EVENT-ARCHITECTURE.md](./EVENT-ARCHITECTURE.md) §5

### 🟠 P1 — Menentukan batas penskalaan

**4. "In-memory mutex" ambigu.** FDR §1 dan PRD FR-43 tidak jelas apakah mutex berada di
dalam proses Go atau terdistribusi. Bila di dalam proses, ia **pecah senyap** begitu instans
kedua dijalankan, menghasilkan stok minus tanpa error. **Rekomendasi: kunci baris Postgres.**
→ [REDIS-STRATEGY.md](./REDIS-STRATEGY.md) §5

### 🔴 Temuan audit tooling (21 Agustus 2026)

**5. Strategi Service Worker belum pernah dipilih.** Disebut 4 kali sebagai konsep, tidak
pernah sebagai keputusan — padahal ia yang mewujudkan seluruh janji offline-first.
→ [TECH-STACK.md](./TECH-STACK.md) §6

**6. TanStack Query bertabrakan dengan antrean sinkronisasi sendiri.** Fondasi UI memberinya
peran sinkronisasi IndexedDB↔server, yang sudah dirancang sebagai antrean FIFO buatan sendiri.
Dua mekanisme tulis = duplikasi transaksi. → [TECH-STACK.md](./TECH-STACK.md) §5

**7. `pos-engine` belum punya satu pun pustaka.** Router, akses DB, JWT, Argon2id — semuanya
belum dipilih untuk komponen paling kritis di sistem. → [TECH-STACK.md](./TECH-STACK.md) §3

### Pertanyaan yang layak diajukan lebih awal

~~**Apakah `intelligence-worker` benar-benar dibutuhkan?**~~ — **terjawab 21 Agu 2026: ya.**
Dengan CRM & BI masuk ruang lingkup ([ADR-0006](./adr/0006-crm-bi-and-python-service.md)),
layanan Python aktif sejak Fase 1. Ruang lingkupnya: restock · segmentasi pelanggan · agregasi BI.

### 🔴 Konsekuensi baru dari ADR-0006

**8. Sistem kini menyimpan PII pelanggan.** Sebelumnya tidak ada satu pun data pribadi
pelanggan di sistem — argumen kepatuhan yang sangat kuat, dan kini hilang. Kewajiban UU PDP
menjadi nyata. → [COMPLIANCE-ID](../40-security/COMPLIANCE-ID.md) §1b

**9. Perangkat kasir hilang kini membawa PII.** Katalog pelanggan tersimpan di IndexedDB agar
bisa dilayani offline. → [DATA-MODEL](../30-data/DATA-MODEL.md) §5E

**10. Ukuran VPS naik.** Rekomendasi berubah dari "4 GB cukup" menjadi **8 GB minimum** —
agregasi BI memuat data ke memori. → [TECH-STACK](./TECH-STACK.md) §10

---

## 5. Aturan Folder Ini

* Dokumen di sini menjelaskan **bentuk dan alasan**, bukan skema tabel atau berkas konfigurasi.
* Setiap keputusan yang sulit dibalik butuh ADR — bukan sekadar paragraf di dalam dokumen.
* Bila sebuah aturan di [SERVICE-BOUNDARIES.md](./SERVICE-BOUNDARIES.md) terasa salah,
  ubah aturannya lewat ADR. Jangan melanggarnya diam-diam.
