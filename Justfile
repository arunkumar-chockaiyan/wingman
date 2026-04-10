set windows-shell := ["cmd.exe", "/d", "/c"]

# Default recipe to show available commands
default:
    @just --list

# =======================
# Development environment
# =======================

# Start all infrastructure (Kafka, Vosk, Loki, etc.)
infra-up:
    docker compose -f docker-compose.yml up -d

# Stop all infrastructure
infra-down:
    docker compose -f docker-compose.yml down

# Run the backend dev server
dev-backend:
    npm run dev

# Run the frontend dev server
dev-frontend:
    cd frontend && npm run dev

# Run both frontend and backend servers simultaneously
dev: infra-up
    npx concurrently "npm run dev" "cd frontend && npm run dev"

# =======================
# Database / Prisma
# =======================

db-migrate:
    npx prisma migrate dev

db-seed:
    npx ts-node prisma/seed.ts

db-setup: db-migrate db-seed

db-studio:
    npx prisma studio

# =======================
# Testing
# =======================

test:
    npx vitest run tests/unit

test-int:
    npx vitest run tests/integration --pool=forks

# =======================
# Building for Production
# =======================

build-backend:
    npx tsc

build-frontend:
    cd frontend && npm run build

build: build-backend build-frontend
