# Runbook: Disk / Database Penuh

**Gejala:** Postgres menolak tulis · `DATABASE_UNAVAILABLE` · sinkronisasi gagal massal

## 0. Nilai keparahan
🟠 Kasir tetap berjualan offline, tetapi **antrean perangkat mulai menumpuk**. Jam berjalan.

## 1. Cek ruang
```bash
df -h
docker system df
```

## 2. Menang cepat — aman dilakukan
```bash
docker image prune -a -f        # image lama hasil tarikan dari ghcr.io
docker builder prune -f
journalctl --vacuum-time=3d
```
Sejak build pindah ke CI ([ADR-0004](../../10-architecture/adr/0004-ci-build-and-registry.md)),
image yang menumpuk berasal dari **tag SHA lama yang ditarik saat deploy** — bukan lagi dari
build di server. Pemangkasan tetap perlu, tetapi laju penumpukannya jauh lebih lambat.

## 3. Tabel terbesar
```sql
SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) AS size
FROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 10;
```

## 4. Pembersihan aman
Boleh dihapus tanpa ragu (sesuai [RETENTION](../../30-data/RETENTION.md)):
```sql
DELETE FROM sync_receipts WHERE expires_at < now();
DELETE FROM background_jobs WHERE status='succeeded' AND finished_at < now() - interval '30 days';
DELETE FROM event_outbox WHERE published_at < now() - interval '7 days';
```
🔴 **JANGAN PERNAH hapus:** `sales_transactions`, `sales_items`, `payments`, `audit_logs`.

## 5. Bloat
```sql
VACUUM (VERBOSE, ANALYZE) sales_transactions;
```
`VACUUM FULL` mengunci tabel — **hanya di luar jam operasional**.

## 6. Bila tetap penuh
Naikkan ukuran disk VPS. Ini skala vertikal — langkah 1 di
[SCALABILITY-RELIABILITY](../../10-architecture/SCALABILITY-RELIABILITY.md) §2.

## 7. Cegah berulang
- [ ] Alarm pada disk >75%
- [ ] Pemangkasan image otomatis
- [ ] Pindahkan build ke CI
