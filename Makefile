.PHONY: up down logs build migrate seed seed-demo test lint fmt typecheck dev ci

# ── Docker ────────────────────────────────────────────────────────────────────
up:            ## Start the full dev stack (api, worker, postgres+postgis, redis, minio)
	docker compose up -d --build

down:          ## Stop the stack
	docker compose down

build:         ## Rebuild images
	docker compose build

logs:          ## Tail api logs
	docker compose logs -f api

# ── Backend (run from repo root; uses backend/ venv-less system python) ───────
install:       ## Install backend deps (dev)
	python3 -m pip install -r backend/requirements-dev.txt

migrate:       ## Apply alembic migrations
	cd backend && alembic upgrade head

seed:          ## Seed locations, default plan and super admin
	cd backend && python -m app.scripts.seed

seed-demo:     ## Seed + demo data (owner, verification, listings)
	cd backend && python -m app.scripts.seed --demo

test:          ## Run backend tests
	cd backend && python -m pytest -q --cov=app --cov-report=term-missing

lint:          ## Ruff lint
	cd backend && ruff check .

fmt:           ## Ruff format
	cd backend && ruff format .

typecheck:     ## mypy (light)
	cd backend && mypy app

dev:           ## Run API with reload (needs DATABASE_URL)
	cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

ci:            ## What CI runs
	cd backend && ruff check . && python -m pytest -q
