#!/usr/bin/env bash
# Anggaran ukuran image — PRD §4 & PERFORMANCE-BUDGET §5
set -euo pipefail
declare -A MAX=( [pos-engine]=25 [web]=250 [intelligence-worker]=500 )
fail=0
for svc in "${!MAX[@]}"; do
  img="ghcr.io/${GH_REPO:-local}/${svc}:${TAG:-latest}"
  b=$(docker image inspect "$img" --format '{{.Size}}' 2>/dev/null) || { echo "⏭️  $svc belum dibangun"; continue; }
  mb=$((b/1024/1024)); lim=${MAX[$svc]}
  printf "%-22s %4s MB (maks %s)\n" "$svc" "$mb" "$lim"
  [ "$mb" -le "$lim" ] || { echo "  ❌ melewati anggaran"; fail=1; }
done
exit $fail
