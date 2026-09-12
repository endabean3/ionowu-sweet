# ionowu sweet — perintah pengembang
#
# SEMUA tool berjalan di dalam Docker. Mac tidak perlu Go, Node,
# Python, goose, atau sqlc. Lihat 15-development/DEV-VS-PROD.md
#
# Dua cara pakai:
#   1. Buka folder ini di VS Code → "Reopen in Container" (paling nyaman)
#   2. Dari host: `make <target>` — otomatis dijalankan di dalam container

SHELL := /bin/bash
DC    := docker compose -f docker-compose.dev.yml
RUN   := $(DC) exec -T workspace

.DEFAULT_GOAL := help
.PHONY: help up down dev reset logs shell tools-check migrate migrate-new \
        sqlc sqlc-vet seed test test-money test-offline lint clean test-e2e test-all

test-e2e: ## Playwright E2E (butuh API + web menyala — pakai `make web-dev` & api di container)
	@echo "$(YELLOW)Running Playwright E2E tests...$(NC)"
	$(RUN) bash -c 'cd apps/web && npx playwright install chromium --with-deps=false > /dev/null 2>&1 || npx playwright install chromium; CI=true npx playwright test'

test-all: test test-web test-e2e ## Run all tests (backend, frontend unit, frontend e2e)

help: ## Tampilkan daftar perintah
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	 | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

# ── Siklus hidup ────────────────────────────────────────────────────
up: ## Nyalakan stack (postgres, redis, workspace)
	$(DC) up -d --build

down: ## Matikan stack, volume tetap
	$(DC) down

dev: up migrate seed ## Nyalakan + migrasi + data contoh
	@echo ""
	@echo "  ✅ Siap. postgres:5432 · redis:6379"
	@echo "  Masuk ke wadah kerja: make shell"

reset: ## HAPUS volume, mulai dari nol (hanya lokal!)
	$(DC) down -v
	$(MAKE) dev

logs: ## Ikuti log
	$(DC) logs -f

shell: ## Masuk ke dalam wadah kerja
	$(DC) exec workspace bash

tools-check: ## Verifikasi versi tool di dalam container
	@$(RUN) bash -c 'echo "go      $$(go version | cut -d" " -f3)"; \
	 echo "node    $$(node --version)"; \
	 echo "pnpm    $$(pnpm --version)"; \
	 echo "python  $$(python3 --version | cut -d" " -f2)"; \
	 echo "uv      $$(uv --version | cut -d" " -f2)"; \
	 echo "goose   $$(goose --version 2>&1 | grep -oE "v[0-9]+\.[0-9]+\.[0-9]+" | head -1)"; \
	 echo "sqlc    $$(sqlc version)"; \
	 echo "lint    $$(golangci-lint --version | grep -o "[0-9]\+\.[0-9]\+\.[0-9]\+" | head -1)"'

# ── Basis data ──────────────────────────────────────────────────────
migrate: ## Jalankan migrasi
	$(RUN) bash -c 'goose -dir 30-data/migrations postgres "$$DATABASE_URL" up'

migrate-status: ## Status migrasi
	$(RUN) bash -c 'goose -dir 30-data/migrations postgres "$$DATABASE_URL" status'

migrate-new: ## Migrasi baru — make migrate-new name=tambah_x
	$(RUN) bash -c 'goose -dir 30-data/migrations create $(name) sql'

seed: ## Isi data contoh (WAJIB dua tenant — isolasi tak bisa diuji dengan satu)
	$(RUN) bash -c 'cd services/pos-engine && go run ./cmd/seed'

psql: ## Buka psql
	$(DC) exec postgres psql -U ionowu -d ionowu_dev

# ── sqlc ────────────────────────────────────────────────────────────
sqlc: ## Generate kode Go dari SQL
	$(RUN) bash -c 'cd 30-data && sqlc generate'

sqlc-vet: ## Tegakkan aturan: tenant scope, tanpa SELECT *, tanpa DELETE transaksional
	$(RUN) bash -c 'cd 30-data && sqlc vet'

# ── Kualitas ────────────────────────────────────────────────────────
test: ## Seluruh uji
	$(RUN) bash -c 'cd services/pos-engine && go test ./... -race'
	$(RUN) bash -c 'pnpm --filter web test'

test-money: ## Rumus uang — Go & TypeScript (100% paritas via fixture JSON)
	$(RUN) bash -c 'cd services/pos-engine && go test ./internal/money/... -v'
	$(RUN) bash -c 'pnpm --filter web test'

test-offline: ## Playwright, skenario offline (checkout offline + pemulihan antrean)
	$(RUN) bash -c 'cd apps/web && npx playwright install chromium --with-deps=false > /dev/null 2>&1 || npx playwright install chromium; CI=true npx playwright test offline-checkout sync-recovery'

web-dev: ## Jalankan Next.js development server
	$(RUN) bash -c 'pnpm --filter web dev'

web-build: ## Build Next.js PWA production
	$(RUN) bash -c 'pnpm --filter web build'

# HARUS `cd` ke modul: dijalankan dari /workspace, golangci-lint berhenti dengan
# "directory prefix . does not contain main module" — dan `|| true` menelannya,
# sehingga Go tidak pernah benar-benar di-lint meski CI terlihat hijau. Kelas bug
# yang sama pernah mematikan gerbang sqlc vet (commit f4c35cd).
lint: ## golangci-lint + biome
	$(RUN) bash -c 'cd services/pos-engine && golangci-lint run ./...'
	$(RUN) pnpm --filter web lint

docs-check: ## Validasi tautan dokumentasi
	@python3 -c "import os,re;bad=[];[bad.append(f'{os.path.join(r,n)}:{i} -> {m.group(1)}') for r,d,f in os.walk('.') if not [d.__setitem__(slice(None),[x for x in d if x not in ('.git','node_modules')])] for n in f if n.endswith('.md') for i,l in enumerate(open(os.path.join(r,n),encoding='utf-8'),1) for m in re.finditer(r'\]\((\.[^)#]*)\)',l) if not os.path.exists(os.path.normpath(os.path.join(r,m.group(1))))];print('LINK PUTUS:',len(bad));[print(' ',b) for b in bad]"

clean: ## Bersihkan cache Docker proyek ini
	$(DC) down -v
	docker builder prune -f
