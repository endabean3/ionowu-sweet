#!/usr/bin/env bash
# Anggaran bundle — 60-quality/PERFORMANCE-BUDGET.md §4
# Rute kasir WAJIB bundle terkecil: kode dasbor tidak boleh ikut ke perangkat RAM 3GB.
set -euo pipefail
MAX_JS_KB=150; MAX_CSS_KB=30
DIR="${1:-apps/web/.next/static}"
[ -d "$DIR" ] || { echo "⏭️  $DIR belum ada — dilewati"; exit 0; }
js=$(find "$DIR" -name '*.js'  -exec gzip -c {} + | wc -c); js=$((js/1024))
css=$(find "$DIR" -name '*.css' -exec gzip -c {} + | wc -c); css=$((css/1024))
printf "JS %s KB (maks %s) · CSS %s KB (maks %s)\n" "$js" "$MAX_JS_KB" "$css" "$MAX_CSS_KB"
[ "$js"  -le "$MAX_JS_KB"  ] || { echo "❌ JS melewati anggaran";  exit 1; }
[ "$css" -le "$MAX_CSS_KB" ] || { echo "❌ CSS melewati anggaran"; exit 1; }
echo "✅"
