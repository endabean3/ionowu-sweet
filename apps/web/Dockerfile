# web — PWA kasir. node:22-alpine + output:standalone (DOCKER.md §2).
# Dibangun di GitHub Actions, TIDAK di VPS (ADR-0004).

# ── Dependensi ─────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
# Layer terpisah dari kode: lockfile jarang berubah dibanding kode
# (DOCKER.md §1b aturan #4).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/package.json
RUN pnpm install --frozen-lockfile --filter web...

# ── Build ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY . .
# API URL publik dibakar ke bundle client SAAT build (batasan NEXT_PUBLIC_*
# Next.js — bukan dibaca ulang saat container start). Nilai default di sini
# HANYA untuk build lokal/CI smoke test; deploy nyata WAJIB meneruskan
# --build-arg dari CI, bukan mengandalkan docker-compose.prod.yml env:
# NEXT_PUBLIC_POS_API_URL di sana TIDAK berpengaruh terhadap bundle yang
# sudah dibangun. Lihat catatan follow-up di CHANGELOG/task terpisah.
ARG NEXT_PUBLIC_API_URL=https://api.ionowu.example
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm --filter web build

# ── Runtime ────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
# server.js standalone TIDAK berada di /app/server.js seperti proyek
# single-repo pada umumnya — karena ini pnpm workspace, Next.js menjejak
# hingga root monorepo dan menaruhnya di /app/apps/web/server.js. public/
# dan .next/static HARUS ikut di path yang sama, atau server.js akan
# 404 saat menyajikannya (dikonfirmasi lewat build+run nyata, bukan tebakan
# dari dokumentasi Next.js).
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ || exit 1

CMD ["node", "apps/web/server.js"]
