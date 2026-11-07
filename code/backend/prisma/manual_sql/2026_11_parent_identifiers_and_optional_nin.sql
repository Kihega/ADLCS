-- 2026_11_parent_identifiers_and_optional_nin.sql
-- Run in the Supabase SQL editor BEFORE deploying the matching backend.
-- Safe to run more than once.
--  1. citizens.national_id becomes optional (NIN is issued by NIDA, not NBS).
--  2. births gets parent identifier/name columns (BID or NIN as entered).
BEGIN;
ALTER TABLE "citizens" ALTER COLUMN "national_id" DROP NOT NULL;
ALTER TABLE "births" ADD COLUMN IF NOT EXISTS "father_identifier" VARCHAR(40);
ALTER TABLE "births" ADD COLUMN IF NOT EXISTS "mother_identifier" VARCHAR(40);
ALTER TABLE "births" ADD COLUMN IF NOT EXISTS "father_name" VARCHAR(150);
ALTER TABLE "births" ADD COLUMN IF NOT EXISTS "mother_name" VARCHAR(150);
COMMIT;
-- then on your machine:  npx prisma generate --schema=prisma/schema.prisma
