-- 2026_08_migration_token.sql
-- Run this in the Supabase SQL editor (or `psql` against DATABASE_URL).
-- Adds the migration_token column used by the new Incoming/Outgoing
-- migration confirmation flow (PATCH-MIGFLOW-2026). Safe to run more than
-- once.

BEGIN;

ALTER TABLE "migrations"
  ADD COLUMN IF NOT EXISTS "migration_token" VARCHAR(20);

CREATE UNIQUE INDEX IF NOT EXISTS "migrations_migration_token_key"
  ON "migrations" ("migration_token");

COMMIT;

-- AFTER running the above in Supabase, on your machine run:
--   cd code/backend
--   npx prisma generate
