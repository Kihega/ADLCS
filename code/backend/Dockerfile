# ─────────────────────────────────────────────────────────────
# ADLCS Backend — Node.js 20 on Alpine Linux
# Alpine is used to keep the image small (~180MB vs ~900MB on Debian).
# OpenSSL is required by Prisma Client at runtime.
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS base

# Install system dependencies
# openssl  — Prisma needs it for query engine binary
# dumb-init — proper PID 1 / signal handling in containers
RUN apk add --no-cache openssl dumb-init

WORKDIR /app

# ── Dependency layer (cached unless package-lock.json changes) ──
COPY code/backend/package.json code/backend/package-lock.json ./
COPY code/backend/prisma ./prisma/

# npm ci is stricter than npm install — uses lockfile exactly
RUN npm ci --omit=dev && npx prisma generate

# ── Source layer ──
COPY code/backend/src ./src/

# Non-root user for security — never run Node as root in prod
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 5000

# dumb-init wraps the Node process so SIGTERM is handled cleanly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]
