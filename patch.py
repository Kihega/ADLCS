#!/usr/bin/env python3
"""
PATCH #1 — Fix Dockerfile COPY paths for Render Docker mode
PROBLEM: Render Docker build context = code/backend/, but Dockerfile
         uses COPY code/backend/... which fails (no nested path in context)
FIXES: "Exited with status 1 while building your code"
RUN FROM: repo root (cd ~/ADLCS)
"""

import os

DOCKERFILE_PATH = "code/backend/Dockerfile"

NEW_DOCKERFILE = '''\
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
'''

with open(DOCKERFILE_PATH, "w") as f:
    f.write(NEW_DOCKERFILE)

print(f"✅ Patched: {DOCKERFILE_PATH}")
print("   Fixed COPY paths: code/backend/... → relative paths")
print("   Build context is now correctly code/backend/")
print()
print("Next: git add code/backend/Dockerfile && git commit -m 'fix: Dockerfile COPY paths for Render Docker build' && git push")
