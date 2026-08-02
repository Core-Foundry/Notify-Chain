FROM node:22-slim AS base
WORKDIR /app

# ── deps ──────────────────────────────────────────────────────────────────────
FROM base AS deps
COPY package*.json ./
RUN npm ci

# ── dev: live-reloading dev server ────────────────────────────────────────────
# Vite VITE_* vars are embedded at build time — pass them as build args.
FROM deps AS dev
ARG VITE_EVENTS_API_URL=http://localhost:8787/api/events
ARG VITE_STELLAR_NETWORK=TESTNET
ENV VITE_EVENTS_API_URL=$VITE_EVENTS_API_URL
ENV VITE_STELLAR_NETWORK=$VITE_STELLAR_NETWORK
COPY . .
EXPOSE 5173
# --host binds to 0.0.0.0 so the port is reachable from outside the container
CMD ["node", "./node_modules/vite/bin/vite.js", "--host"]

# ── build: production static assets ──────────────────────────────────────────
FROM deps AS build
ARG VITE_EVENTS_API_URL=http://localhost:8787/api/events
ARG VITE_STELLAR_NETWORK=TESTNET
ENV VITE_EVENTS_API_URL=$VITE_EVENTS_API_URL
ENV VITE_STELLAR_NETWORK=$VITE_STELLAR_NETWORK
COPY . .
RUN npm run build

# ── production: serve built assets via Vite preview ──────────────────────────
FROM node:22-slim AS production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 4173
CMD ["node", "./node_modules/vite/bin/vite.js", "preview", "--host", "--port", "4173"]
