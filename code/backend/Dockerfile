# ─────────────────────────────────────────────────────────────
# ADLCS Backend — Node.js 20 on Alpine Linux
# Build context = code/backend/ (Render Docker mode)
# Alpine is used to keep the image small (~180MB vs ~900MB on Debian).
# OpenSSL is required by Prisma Client at runtime.
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS base

# Install system dependencies
RUN apk add --no-cache openssl dumb-init

WORKDIR /app

# ── Dependency layer (cached unless package-lock.json changes) ──
# Build context is code/backend/ so paths are relative to it
COPY package.json package-lock.json ./
COPY prisma ./prisma/

RUN npm ci --omit=dev && npx prisma generate

# ── Source layer ──
COPY src ./src/

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 5000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]
