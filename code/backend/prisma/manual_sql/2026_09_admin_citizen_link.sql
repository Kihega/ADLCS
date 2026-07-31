-- 2026_09_admin_citizen_link.sql
-- Run this in the Supabase SQL editor (or `psql` against DATABASE_URL).
-- Safe to run more than once.
--
-- Adds citizen_id — a real foreign key from each of the four officer/admin
-- identity tables back to citizens(id), confirming their own identity is
-- linked to an actual citizen record (found via Birth ID search at
-- registration time) rather than just a duplicated string.

BEGIN;

ALTER TABLE "super_admins"
  ADD COLUMN IF NOT EXISTS "citizen_id" TEXT;
ALTER TABLE "district_admins"
  ADD COLUMN IF NOT EXISTS "citizen_id" TEXT;
ALTER TABLE "village_officers"
  ADD COLUMN IF NOT EXISTS "citizen_id" TEXT;
ALTER TABLE "hospital_officers"
  ADD COLUMN IF NOT EXISTS "citizen_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "super_admins_citizen_id_key"      ON "super_admins" ("citizen_id");
CREATE UNIQUE INDEX IF NOT EXISTS "district_admins_citizen_id_key"   ON "district_admins" ("citizen_id");
CREATE UNIQUE INDEX IF NOT EXISTS "village_officers_citizen_id_key"  ON "village_officers" ("citizen_id");
CREATE UNIQUE INDEX IF NOT EXISTS "hospital_officers_citizen_id_key" ON "hospital_officers" ("citizen_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE constraint_name = 'super_admins_citizen_id_fkey') THEN
    ALTER TABLE "super_admins" ADD CONSTRAINT "super_admins_citizen_id_fkey"
      FOREIGN KEY ("citizen_id") REFERENCES "citizens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE constraint_name = 'district_admins_citizen_id_fkey') THEN
    ALTER TABLE "district_admins" ADD CONSTRAINT "district_admins_citizen_id_fkey"
      FOREIGN KEY ("citizen_id") REFERENCES "citizens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE constraint_name = 'village_officers_citizen_id_fkey') THEN
    ALTER TABLE "village_officers" ADD CONSTRAINT "village_officers_citizen_id_fkey"
      FOREIGN KEY ("citizen_id") REFERENCES "citizens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE constraint_name = 'hospital_officers_citizen_id_fkey') THEN
    ALTER TABLE "hospital_officers" ADD CONSTRAINT "hospital_officers_citizen_id_fkey"
      FOREIGN KEY ("citizen_id") REFERENCES "citizens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;

-- AFTER running the above in Supabase, on your machine run:
--   cd code/backend
--   npx prisma generate
