# Runbook: Redis Mati

**Gejala:** koneksi Redis gagal · rate limit tidak jalan · event tidak terkirim

## 0. Nilai keparahan
Kasir **harus** tetap bisa bertransaksi. Bila checkout gagal karena Redis, itu berarti
perbaikan di [REDIS-STRATEGY](../../10-architecture/REDIS-STRATEGY.md) belum diterapkan
— **eskalasi sebagai bug arsitektur**, bukan sekadar insiden infrastruktur.

## 1. Periksa
```bash
docker ps | grep redis
docker exec -it <redis> redis-cli ping     # harap: PONG
docker exec -it <redis> redis-cli info memory | grep used_memory_human
```

## 2. Bila kehabisan memori
```bash
docker exec -it <redis> redis-cli config get maxmemory-policy   # harap: allkeys-lru
```
Kebijakan salah → kunci tanpa TTL menumpuk. Cari kunci tanpa TTL; setiap kunci **wajib**
punya TTL ([REDIS-STRATEGY](../../10-architecture/REDIS-STRATEGY.md) §4).

## 3. Restart
```bash
docker restart <redis>
```
Aman — Redis murni cache. Yang hilang: cache (terbangun ulang), rate limit (ter-reset),
kunci sementara.

## 4. ⚠️ Setelah restart: verifikasi revokasi token
Pastikan token yang sudah dicabut **tetap** ditolak. Bila diterima kembali, perbaikan
[REDIS-STRATEGY](../../10-architecture/REDIS-STRATEGY.md) §2 belum diterapkan →
🔴 **lubang keamanan aktif**, tangani segera.

## 5. Cache dingin
Setelah restart, latensi naik sementara. Bila bertepatan dengan jam sibuk, pantau checkout p99.
