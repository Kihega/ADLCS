-- 2026_11_remove_marriage.sql
-- Marriage registration was removed from ADLCS. Run once (safe to repeat):
--   psql "$DATABASE_URL" -f backend/prisma/manual_sql/2026_11_remove_marriage.sql
-- (backend/scripts/patch2-db.js does the same thing for you.)
BEGIN;
DROP TABLE IF EXISTS "marriages" CASCADE;
DROP TYPE  IF EXISTS "MarriageStatus";
DROP TYPE  IF EXISTS "KindOfMarriage";
DROP TYPE  IF EXISTS "MarriageReligion";
COMMIT;
