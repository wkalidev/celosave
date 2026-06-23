FROM node:20-alpine AS builder
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@10

# Copy workspace manifests first for layer caching
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/backend/package.json ./packages/backend/

# Install only backend dependencies (no frontend)
RUN pnpm install --filter=backend --frozen-lockfile

# Copy backend source and compile
COPY packages/backend ./packages/backend
RUN pnpm --filter=backend run build

# ── Runtime image ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

RUN npm install -g pnpm@10

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/backend/package.json ./packages/backend/

RUN pnpm install --filter=backend --frozen-lockfile --prod

COPY --from=builder /app/packages/backend/dist ./packages/backend/dist

EXPOSE 3001
CMD ["node", "packages/backend/dist/index.js"]
