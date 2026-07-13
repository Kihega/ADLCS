-- 2026_07_cleanup_and_migration.sql
-- Run this in the Supabase SQL editor (or `psql` against DATABASE_URL) AFTER
-- confirming backend/prisma/schema.prisma matches what you expect — this
-- project has been edited with raw SQL directly against Supabase, so
-- `prisma migrate` has never been used and there is no migration history to
-- diff against. This file is the manual equivalent for THIS patch only.
--
-- Safe to run more than once (every statement is guarded with IF EXISTS).

BEGIN;

-- 1) Drop the two unused tables (no UI anywhere writes to these anymore).
DROP TABLE IF EXISTS "buildings" CASCADE;
DROP TABLE IF EXISTS "public_infrastructure" CASCADE;

-- 2) Drop their now-orphaned enum types.
DROP TYPE IF EXISTS "BuildingType";
DROP TYPE IF EXISTS "OwnershipType";
DROP TYPE IF EXISTS "IndustryType";
DROP TYPE IF EXISTS "InfraType";
DROP TYPE IF EXISTS "RoadType";

-- 3) Indexes to support the new migration inbox/outbox queries.
CREATE INDEX IF NOT EXISTS "migrations_target_officer_id_status_idx"
  ON "migrations" ("target_officer_id", "status");
CREATE INDEX IF NOT EXISTS "migrations_source_officer_id_idx"
  ON "migrations" ("source_officer_id");

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────
-- AFTER running the above in Supabase, on your machine (not this sandbox —
-- it has no network access to your DB) run:
--
--   cd code/backend
--   npx prisma generate
--   npx prisma db pull --print          # sanity-check: confirm the live DB
--                                       # now matches schema.prisma with no
--                                       # unexpected extra tables/columns
--
-- If `db pull --print` reveals tables/columns NOT in schema.prisma (very
-- likely, given raw SQL has been run directly against Supabase for a
-- while), that output IS your clean ERD source of truth. At that point the
-- safest path to a schema that's actually in sync, without risking data
-- loss, is:
--
--   npx prisma db pull                  # overwrite schema.prisma from the
--                                       # live DB, then hand-restore the
--                                       # @map/relation names Prisma can't
--                                       # infer (compare against a backup
--                                       # of the current schema.prisma first)
--
-- I can't run `prisma db pull`/`db push` myself from here — this sandbox
-- has no network access to Supabase — so this step needs to happen on your
-- machine where the DATABASE_URL / DATABASE_URL_POOLER env vars resolve.
