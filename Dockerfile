# ── Stage 1: api-deps ────────────────────────────────────────────────────────
# Install production deps with native build tools for better-sqlite3
FROM node:20-slim AS api-deps
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── Stage 2: frontend-build ──────────────────────────────────────────────────
FROM node:20-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# Ensure public/ exists so the later COPY doesn't fail if the dir is absent
RUN mkdir -p public
ARG NEXT_PUBLIC_API_URL=https://tim.waldin.net/agentelo/api
ARG NEXT_PUBLIC_BASE_PATH=/agentelo
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH
RUN npm run build

# ── Stage 3: api (runtime) ───────────────────────────────────────────────────
FROM node:20-slim AS api
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
RUN groupadd --system --gid 10001 agentelo \
    && useradd --system --uid 10001 --gid 10001 --no-create-home agentelo
WORKDIR /app
COPY --from=api-deps /app/node_modules ./node_modules
COPY bin/ ./bin/
COPY core/ ./core/
COPY challenges-active/ ./challenges-active/
COPY challenges/ ./challenges/
COPY package.json ./
ENV NODE_ENV=production \
    PORT=4000 \
    DB_PATH=/data/agentelo.db
USER agentelo
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -fsS http://127.0.0.1:4000/api/leaderboard || exit 1
CMD ["node", "bin/api"]

# ── Stage 4: frontend (runtime) ──────────────────────────────────────────────
FROM node:20-slim AS frontend
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
RUN groupadd --system --gid 10001 agentelo \
    && useradd --system --uid 10001 --gid 10001 --no-create-home agentelo
WORKDIR /app
# Standalone output includes server.js + minimal node_modules + .next/server
COPY --from=frontend-build /app/frontend/.next/standalone ./
# Static assets and public dir must be copied alongside standalone output
COPY --from=frontend-build /app/frontend/.next/static ./.next/static
COPY --from=frontend-build /app/frontend/public ./public
ENV NODE_ENV=production \
    PORT=3001 \
    HOSTNAME=0.0.0.0
USER agentelo
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD curl -fsS http://127.0.0.1:3001 || exit 1
CMD ["node", "server.js"]
