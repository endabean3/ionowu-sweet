#!/usr/bin/env bash
# Bukan sekadar kerapian: ini MENOPANG ADR-0005.
# Log dikirim ke Grafana Cloud & Sentry. Satu log.Info(user) yang lolos
# mengalirkan data pribadi ke pihak ketiga dan menggugurkan dasar keputusan itu.
set -uo pipefail
LOGS="${1:-/tmp/test-logs}"
[ -e "$LOGS" ] || { echo "⏭️  $LOGS belum ada — dilewati"; exit 0; }
PAT='(password|passwd|pin_code|token|secret|authorization|bearer [A-Za-z0-9._-]{10,}|[0-9]{13,19})'
if grep -rEin "$PAT" "$LOGS" | grep -viE '(redacted|\*\*\*|<hidden>)' | head -20; then
  echo "❌ pola sensitif ditemukan di log uji"; exit 1
fi
echo "✅ tidak ada rahasia di log"
