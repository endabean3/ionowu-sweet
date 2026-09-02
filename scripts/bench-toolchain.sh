#!/usr/bin/env bash
# Uji performa toolchain — dijalankan DI DALAM Dev Container.
#   make shell  →  bash scripts/bench-toolchain.sh
set -uo pipefail

t() { local s=$(date +%s%N); "$@" >/dev/null 2>&1; local r=$?; \
      echo "$(( ($(date +%s%N)-s)/1000000 ))|$r"; }
row() { printf "  %-34s %8s ms   %s\n" "$1" "$2" "$3"; }
verdict() { [ "$1" -le "$2" ] && echo "✅" || echo "⚠️  target ${2}ms"; }

echo "════════════════════════════════════════════════════════════"
echo "  UJI PERFORMA TOOLCHAIN — $(date '+%Y-%m-%d %H:%M')"
echo "════════════════════════════════════════════════════════════"
echo
echo "▸ Versi"
printf "  %-16s %s\n" go "$(go version | cut -d' ' -f3)" \
                      node "$(node --version)" \
                      pnpm "$(pnpm --version)" \
                      python "$(python3 --version | cut -d' ' -f2)" \
                      goose "$(goose --version 2>&1 | grep -o 'v[0-9.]*')" \
                      sqlc "$(sqlc version)" \
                      lint "$(golangci-lint --version 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"
echo
echo "▸ Latensi database — inti target <5ms PRD §4"
PSQL="psql $DATABASE_URL -tAq"
$PSQL -c "SELECT 1" >/dev/null 2>&1 || { echo "  ❌ database tak terjangkau"; exit 1; }

r=$(t $PSQL -c "SELECT 1"); row "ping SELECT 1" "${r%|*}" "$(verdict ${r%|*} 50)"

# 200 kali lookup barcode — meniru scan-to-cart
lat=$($PSQL <<'SQL'
\timing off
SELECT round((SUM(ms)/COUNT(*))::numeric,3) FROM (
  SELECT (EXTRACT(EPOCH FROM (clock_timestamp()-t0))*1000) ms
  FROM generate_series(1,200) g,
  LATERAL (SELECT clock_timestamp() t0) s,
  LATERAL (SELECT 1 FROM variants v
           WHERE v.tenant_id='X' AND v.barcode='Y' AND v.is_active LIMIT 1) q
) x;
SQL
2>/dev/null | tr -d ' ')
echo "  lookup barcode (200×, tabel kosong)   ${lat:-n/a} ms/op"

echo
echo "▸ Migrasi"
r=$(t goose -dir 30-data/migrations postgres "$DATABASE_URL" status)
row "goose status" "${r%|*}" "$(verdict ${r%|*} 2000)"

echo
echo "▸ sqlc"
r=$(t bash -c 'cd 30-data && sqlc vet')
row "sqlc vet (23 kueri)" "${r%|*}" "$(verdict ${r%|*} 5000)"
r=$(t bash -c 'cd 30-data && sqlc generate')
row "sqlc generate" "${r%|*}" "$(verdict ${r%|*} 10000)"

echo
echo "▸ Kompilasi Go (hello world, cache dingin)"
d=$(mktemp -d); cd "$d"
cat > go.mod <<'M'
module bench
go 1.26
M
echo 'package main
func main(){println("ok")}' > main.go
r=$(t go build -o /dev/null .); row "go build" "${r%|*}" "$(verdict ${r%|*} 5000)"
cd - >/dev/null; rm -rf "$d"

echo
echo "════════════════════════════════════════════════════════════"
