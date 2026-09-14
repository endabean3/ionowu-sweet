# syntax=docker/dockerfile:1.7
#
# web — PWA kasir. node:22-alpine + output:standalone (DOCKER.md §2,
# fondasi-server-ionowu §3.1). Dibangun di GitHub Actions, TIDAK di VPS
# (ADR-0004 · IMG-11).
#
# Memenuhi: IMG-01 (multi-stage), IMG-02 (digest), IMG-04 (--frozen-lockfile),
#           IMG-08 (label OCI), RUN-01 (UID 65532), RUN-07 (healthcheck).

# ── Dependensi ─────────────────────────────────────────────────────────
FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS deps
WORKDIR /app
RUN corepack enable
# Layer terpisah dari kode: lockfile jarang berubah dibanding kode
# (DOCKER.md §1b aturan #4).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/package.json
RUN pnpm install --frozen-lockfile --filter web...

# ── Build ──────────────────────────────────────────────────────────────
FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS builder
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY . .
# API URL publik DIBAKAR ke bundle klien SAAT build (batasan NEXT_PUBLIC_*
# Next.js — tidak dibaca ulang saat container start, jadi env di
# docker-compose.prod.yml tidak mengubah bundle yang sudah jadi).
#
# SENGAJA tanpa nilai default. Default lama `https://api.ionowu.example`
# membuat build.yml — yang tidak pernah meneruskan build-arg ini — diam-diam
# menghasilkan image yang menyala normal tetapi memanggil domain yang tidak
# ada. Lebih baik build gagal di sini daripada kasir gagal di toko.
# CI mengisinya dari repository variable PUBLIC_API_URL (build.yml).
ARG NEXT_PUBLIC_API_URL
RUN test -n "$NEXT_PUBLIC_API_URL" || { \
      echo "❌ NEXT_PUBLIC_API_URL wajib: --build-arg NEXT_PUBLIC_API_URL=https://api-produksi"; exit 1; }
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm --filter web build

# ── Runtime ────────────────────────────────────────────────────────────
FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1

ARG VERSION=dev COMMIT=unknown CREATED=unknown
LABEL org.opencontainers.image.source="https://github.com/endabean3/ionowu-sweet" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${COMMIT}" \
      org.opencontainers.image.created="${CREATED}" \
      org.opencontainers.image.title="ionowu-sweet web" \
      org.opencontainers.image.description="PWA kasir offline-first"

# RUN-01 — UID/GID standar Ionowu adalah 65532, bukan 1001 bawaan contoh
# Next.js. Nilai seragam lintas seluruh aplikasi Ionowu supaya kepemilikan
# berkas pada volume dan tmpfs dapat diprediksi.
RUN addgroup -g 65532 -S nodejs && adduser -S -u 65532 -G nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
# server.js standalone TIDAK berada di /app/server.js seperti proyek
# single-repo pada umumnya — karena ini pnpm workspace, Next.js menjejak
# hingga root monorepo dan menaruhnya di /app/apps/web/server.js. public/
# dan .next/static HARUS ikut di path yang sama, atau server.js akan
# 404 saat menyajikannya (dikonfirmasi lewat build+run nyata, bukan tebakan
# dari dokumentasi Next.js).
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER 65532:65532
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ || exit 1

CMD ["node", "apps/web/server.js"]
