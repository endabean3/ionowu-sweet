#!/usr/bin/env bash
# Rumus uang WAJIB 100% coverage. Salah hitung uang tidak dapat dipulihkan
# dengan patch. 60-quality/TESTING-STRATEGY.md §2
set -euo pipefail
PKG="${1:-./services/pos-engine/internal/domain}"
[ -d "$PKG" ] || { echo "⏭️  $PKG belum ada — dilewati"; exit 0; }
go test "$PKG" -coverprofile=/tmp/money.out >/dev/null
PCT=$(go tool cover -func=/tmp/money.out | awk '/total:/{gsub("%","",$3);print $3}')
echo "coverage rumus uang: ${PCT}%"
awk -v p="$PCT" 'BEGIN{exit !(p+0 >= 100)}' || { echo "❌ wajib 100%"; exit 1; }
echo "✅"
