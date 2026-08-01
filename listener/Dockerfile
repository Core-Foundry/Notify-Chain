FROM node:22-slim AS base
WORKDIR /app

# Build tools required for native sqlite3 bindings
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
  && rm -rf /var/lib/apt/lists/*

# ── deps: install all deps (including devDeps needed to compile) ──────────────
FROM base AS deps
COPY package*.json ./
RUN npm ci

# ── build: compile TypeScript to dist/ ───────────────────────────────────────
FROM deps AS build
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ── production: minimal runtime image ────────────────────────────────────────
FROM node:22-slim AS production
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

# Persistent SQLite data directory — mount a named volume here
RUN mkdir -p /app/data

EXPOSE 8787

# Migrate then start. Migration script is compiled to dist/scripts/migrate-db.js
CMD ["sh", "-c", "node dist/scripts/migrate-db.js && node dist/index.js"]
