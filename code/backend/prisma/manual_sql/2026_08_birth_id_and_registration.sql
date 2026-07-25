-- 2026_08_birth_id_and_registration.sql
-- Run this in the Supabase SQL editor (or `psql` against DATABASE_URL).
-- Safe to run more than once.
--
-- 1. Adds citizens.birth_id — the denormalized Birth ID used as the
--    canonical lookup key for an already-registered citizen.
-- 2. Renames nida_number -> birth_id on the four officer/admin identity
--    tables (their OWN identity field, separate from citizens.birth_id).

BEGIN;

ALTER TABLE "citizens"
  ADD COLUMN IF NOT EXISTS "birth_id" VARCHAR(20);

CREATE UNIQUE INDEX IF NOT EXISTS "citizens_birth_id_key"
  ON "citizens" ("birth_id");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'super_admins' AND column_name = 'nida_number') THEN
    ALTER TABLE "super_admins" RENAME COLUMN "nida_number" TO "birth_id";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'district_admins' AND column_name = 'nida_number') THEN
    ALTER TABLE "district_admins" RENAME COLUMN "nida_number" TO "birth_id";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'village_officers' AND column_name = 'nida_number') THEN
    ALTER TABLE "village_officers" RENAME COLUMN "nida_number" TO "birth_id";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'hospital_officers' AND column_name = 'nida_number') THEN
    ALTER TABLE "hospital_officers" RENAME COLUMN "nida_number" TO "birth_id";
  END IF;
END $$;

COMMIT;

-- AFTER running the above in Supabase, on your machine run:
--   cd code/backend
--   npx prisma generate
