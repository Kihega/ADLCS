-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Jurisdiction" AS ENUM ('mainland', 'zanzibar');

-- CreateEnum
CREATE TYPE "AdminStatus" AS ENUM ('pending', 'active', 'suspended');

-- CreateEnum
CREATE TYPE "OfficerStatus" AS ENUM ('pending', 'active', 'offline', 'suspended');

-- CreateEnum
CREATE TYPE "VitalStatus" AS ENUM ('alive', 'deceased');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female');

-- CreateEnum
CREATE TYPE "MaritalStatus" AS ENUM ('single', 'married', 'widowed', 'divorced');

-- CreateEnum
CREATE TYPE "EducationLevel" AS ENUM ('none', 'primary', 'o_level', 'a_level', 'certificate', 'diploma', 'bachelor', 'master', 'phd', 'other');

-- CreateEnum
CREATE TYPE "MigrationStatus" AS ENUM ('pending', 'confirmed', 'cancelled', 'expired');

-- CreateEnum
CREATE TYPE "MarriageStatus" AS ENUM ('active', 'dissolved', 'pending_dissolution', 'unregistered');

-- CreateEnum
CREATE TYPE "KindOfMarriage" AS ENUM ('monogamous', 'potentially_polygamous', 'polygamous');

-- CreateEnum
CREATE TYPE "MarriageReligion" AS ENUM ('islamic', 'christian', 'customary', 'civil');

-- CreateEnum
CREATE TYPE "BuildingType" AS ENUM ('residential', 'business', 'hotel', 'hospital', 'school', 'college', 'university', 'industry', 'government', 'police', 'military', 'training', 'other');

-- CreateEnum
CREATE TYPE "OwnershipType" AS ENUM ('private', 'public', 'government');

-- CreateEnum
CREATE TYPE "IndustryType" AS ENUM ('processing', 'manufacturing', 'other');

-- CreateEnum
CREATE TYPE "InfraType" AS ENUM ('road', 'railway', 'station', 'port', 'bus_stand');

-- CreateEnum
CREATE TYPE "RoadType" AS ENUM ('tarmac', 'rough');

-- CreateEnum
CREATE TYPE "FacilityType" AS ENUM ('hospital', 'clinic', 'dispensary', 'health_centre');

-- CreateEnum
CREATE TYPE "FacilityOwnership" AS ENUM ('public', 'private', 'mission');

-- CreateEnum
CREATE TYPE "FacilityGrade" AS ENUM ('H', 'C', 'D', 'M', 'O');

-- CreateEnum
CREATE TYPE "DeathCategory" AS ENUM ('infant', 'adult');

-- CreateEnum
CREATE TYPE "DeathLocationType" AS ENUM ('hospital', 'outside');

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('email', 'google', 'apple');

-- CreateEnum
CREATE TYPE "PublicUserStatus" AS ENUM ('active', 'suspended');

-- CreateEnum
CREATE TYPE "AuditActorRole" AS ENUM ('super_admin', 'district_admin', 'village_officer', 'hospital_officer', 'public_user');

-- CreateEnum
CREATE TYPE "PopulationLevel" AS ENUM ('national', 'region', 'district', 'ward', 'village');

-- CreateTable
CREATE TABLE "regions" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "jurisdiction" "Jurisdiction" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "districts" (
    "id" SERIAL NOT NULL,
    "region_id" INTEGER NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "districts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wards" (
    "id" SERIAL NOT NULL,
    "district_id" INTEGER NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "villages" (
    "id" SERIAL NOT NULL,
    "ward_id" INTEGER NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "villages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "super_admins" (
    "id" TEXT NOT NULL,
    "employee_id" VARCHAR(30) NOT NULL,
    "nida_number" VARCHAR(100) NOT NULL,
    "full_name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(120) NOT NULL,
    "password_hash" TEXT,
    "mobile" VARCHAR(15),
    "department" VARCHAR(80),
    "profile_photo_url" TEXT,
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "mfa_secret" TEXT,
    "status" "AdminStatus" NOT NULL DEFAULT 'pending',
    "login_token_hash" TEXT,
    "login_token_expires" TIMESTAMP(3),
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login" TIMESTAMP(3),

    CONSTRAINT "super_admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "district_admins" (
    "id" TEXT NOT NULL,
    "employee_id" VARCHAR(30) NOT NULL,
    "nida_number" VARCHAR(100) NOT NULL,
    "full_name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(120) NOT NULL,
    "password_hash" TEXT,
    "mobile" VARCHAR(15),
    "region_id" INTEGER,
    "district_id" INTEGER,
    "profile_photo_url" TEXT,
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "mfa_secret" TEXT,
    "status" "AdminStatus" NOT NULL DEFAULT 'pending',
    "login_token_hash" TEXT,
    "login_token_expires" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login" TIMESTAMP(3),

    CONSTRAINT "district_admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "village_officers" (
    "id" TEXT NOT NULL,
    "employee_id" VARCHAR(30) NOT NULL,
    "nida_number" VARCHAR(100) NOT NULL,
    "full_name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(120) NOT NULL,
    "password_hash" TEXT,
    "mobile" VARCHAR(15),
    "village_id" INTEGER,
    "ward_id" INTEGER,
    "district_id" INTEGER,
    "profile_photo_url" TEXT,
    "device_fingerprint" TEXT,
    "device_bound_at" TIMESTAMP(3),
    "expo_push_token" TEXT,
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "mfa_secret" TEXT,
    "status" "OfficerStatus" NOT NULL DEFAULT 'pending',
    "login_token_hash" TEXT,
    "login_token_expires" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login" TIMESTAMP(3),

    CONSTRAINT "village_officers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hospital_officers" (
    "id" TEXT NOT NULL,
    "employee_id" VARCHAR(30) NOT NULL,
    "nida_number" VARCHAR(100) NOT NULL,
    "full_name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(120) NOT NULL,
    "password_hash" TEXT,
    "mobile" VARCHAR(15),
    "facility_id" INTEGER,
    "district_id" INTEGER,
    "profile_photo_url" TEXT,
    "device_fingerprint" TEXT,
    "device_bound_at" TIMESTAMP(3),
    "expo_push_token" TEXT,
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "mfa_secret" TEXT,
    "status" "OfficerStatus" NOT NULL DEFAULT 'pending',
    "login_token_hash" TEXT,
    "login_token_expires" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login" TIMESTAMP(3),

    CONSTRAINT "hospital_officers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_users" (
    "id" TEXT NOT NULL,
    "email" VARCHAR(120) NOT NULL,
    "password_hash" TEXT,
    "auth_provider" "AuthProvider" NOT NULL DEFAULT 'email',
    "oauth_id" TEXT,
    "display_name" VARCHAR(80),
    "status" "PublicUserStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login" TIMESTAMP(3),

    CONSTRAINT "public_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "citizens" (
    "id" TEXT NOT NULL,
    "national_id" VARCHAR(23) NOT NULL,
    "first_name" VARCHAR(60) NOT NULL,
    "middle_name" VARCHAR(60),
    "surname" VARCHAR(60) NOT NULL,
    "gender" "Gender" NOT NULL,
    "date_of_birth" DATE NOT NULL,
    "age" INTEGER NOT NULL DEFAULT 0,
    "vital_status" "VitalStatus" NOT NULL DEFAULT 'alive',
    "photo_url" TEXT,
    "fingerprint_template" TEXT,
    "signature_url" TEXT,
    "id_card_issued" DATE,
    "id_card_expires" DATE,
    "id_card_pdf_url" TEXT,
    "blood_group" VARCHAR(5),
    "current_village_id" INTEGER,
    "street_name" VARCHAR(80),
    "house_reg_number" VARCHAR(30),
    "father_citizen_id" TEXT,
    "mother_citizen_id" TEXT,
    "marital_status" "MaritalStatus" NOT NULL DEFAULT 'single',
    "education_level" "EducationLevel" NOT NULL DEFAULT 'none',
    "occupations" JSONB,
    "disability_status" BOOLEAN NOT NULL DEFAULT false,
    "disability_types" JSONB,
    "disability_cause" TEXT,
    "land_ownership_acres" DECIMAL(10,2),
    "animal_keeping" JSONB,
    "health_insurance" JSONB,
    "comm_devices" JSONB,
    "social_funds" JSONB,
    "registered_by" TEXT,
    "registered_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3),
    "region_id" INTEGER,

    CONSTRAINT "citizens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "citizen_children" (
    "id" TEXT NOT NULL,
    "parent_citizen_id" TEXT NOT NULL,
    "child_citizen_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "citizen_children_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "births" (
    "id" TEXT NOT NULL,
    "birth_cert_no" VARCHAR(30) NOT NULL,
    "child_citizen_id" TEXT NOT NULL,
    "child_first_name" VARCHAR(60) NOT NULL,
    "child_middle_name" VARCHAR(60),
    "child_surname" VARCHAR(60) NOT NULL,
    "gender" "Gender" NOT NULL,
    "date_of_birth" DATE NOT NULL,
    "father_citizen_id" TEXT,
    "mother_citizen_id" TEXT,
    "facility_id" INTEGER,
    "officer_id" TEXT NOT NULL,
    "cert_pdf_url" TEXT,
    "qr_payload" TEXT,
    "rita_synced" BOOLEAN NOT NULL DEFAULT false,
    "rita_sync_at" TIMESTAMP(3),
    "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "births_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deaths" (
    "id" TEXT NOT NULL,
    "death_cert_no" VARCHAR(30) NOT NULL,
    "citizen_id" TEXT,
    "national_id" VARCHAR(23),
    "date_of_death" DATE NOT NULL,
    "cause_of_death" TEXT NOT NULL,
    "age_at_death" INTEGER,
    "location_type" "DeathLocationType" NOT NULL,
    "category" "DeathCategory" NOT NULL,
    "place_of_death" VARCHAR(120),
    "last_residence" VARCHAR(200),
    "occupation" VARCHAR(120),
    "informant_name" VARCHAR(120),
    "informant_address" VARCHAR(200),
    "facility_id" INTEGER,
    "village_officer_id" TEXT,
    "hospital_officer_id" TEXT,
    "infant_father_id" TEXT,
    "infant_mother_id" TEXT,
    "cert_pdf_url" TEXT,
    "qr_payload" TEXT,
    "rita_synced" BOOLEAN NOT NULL DEFAULT false,
    "rita_sync_at" TIMESTAMP(3),
    "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deaths_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marriages" (
    "id" TEXT NOT NULL,
    "marriage_cert_no" VARCHAR(30) NOT NULL,
    "husband_id" TEXT NOT NULL,
    "wife_id" TEXT NOT NULL,
    "husband_nid" VARCHAR(23) NOT NULL,
    "wife_nid" VARCHAR(23) NOT NULL,
    "husband_age" INTEGER NOT NULL,
    "wife_age" INTEGER NOT NULL,
    "husband_status_prev" VARCHAR(20) NOT NULL,
    "wife_status_prev" VARCHAR(20) NOT NULL,
    "marriage_date" DATE NOT NULL,
    "marriage_place" VARCHAR(120) NOT NULL,
    "region_id" INTEGER,
    "religion" "MarriageReligion" NOT NULL,
    "kind_of_marriage" "KindOfMarriage" NOT NULL,
    "witness1_name" VARCHAR(120),
    "witness2_name" VARCHAR(120),
    "registrar_name" VARCHAR(120),
    "status" "MarriageStatus" NOT NULL DEFAULT 'active',
    "dissolution_date" DATE,
    "dissolution_reason" TEXT,
    "dissolution_auth" VARCHAR(120),
    "registered_by" TEXT NOT NULL,
    "cert_pdf_url" TEXT,
    "qr_payload" TEXT,
    "rita_synced" BOOLEAN NOT NULL DEFAULT false,
    "rita_sync_at" TIMESTAMP(3),
    "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marriages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migrations" (
    "id" TEXT NOT NULL,
    "citizen_id" TEXT NOT NULL,
    "from_village_id" INTEGER NOT NULL,
    "to_village_id" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "MigrationStatus" NOT NULL DEFAULT 'pending',
    "request_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiry_date" TIMESTAMP(3) NOT NULL,
    "confirmed_date" TIMESTAMP(3),
    "source_officer_id" TEXT NOT NULL,
    "target_officer_id" TEXT,

    CONSTRAINT "migrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_facilities" (
    "id" SERIAL NOT NULL,
    "facility_reg_no" VARCHAR(30) NOT NULL,
    "facility_name" VARCHAR(120) NOT NULL,
    "facility_type" "FacilityType" NOT NULL,
    "facility_grade" "FacilityGrade" NOT NULL,
    "village_id" INTEGER,
    "ownership_type" "FacilityOwnership" NOT NULL,
    "gps_lat" DECIMAL(10,8),
    "gps_lng" DECIMAL(11,8),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_facilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buildings" (
    "id" VARCHAR(20) NOT NULL,
    "building_type" "BuildingType" NOT NULL,
    "name" VARCHAR(120),
    "street_location" VARCHAR(120) NOT NULL,
    "village_id" INTEGER NOT NULL,
    "owners" JSONB NOT NULL,
    "ownership_type" "OwnershipType" NOT NULL,
    "hotel_class" VARCHAR(20),
    "industry_type" "IndustryType",
    "coverage_acres" DECIMAL(10,2),
    "num_buildings" INTEGER,
    "facility_id" INTEGER,
    "registered_by" TEXT NOT NULL,
    "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "buildings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_infrastructure" (
    "id" TEXT NOT NULL,
    "infra_type" "InfraType" NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "road_type" "RoadType",
    "coverage_acres" DECIMAL(10,2),
    "length_km" DECIMAL(10,2),
    "village_id" INTEGER NOT NULL,
    "registered_by" TEXT NOT NULL,
    "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "public_infrastructure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "population_snapshots" (
    "id" TEXT NOT NULL,
    "snapshot_date" DATE NOT NULL,
    "level" "PopulationLevel" NOT NULL,
    "scope_id" INTEGER NOT NULL,
    "total_population" BIGINT NOT NULL,
    "male_count" BIGINT NOT NULL,
    "female_count" BIGINT NOT NULL,
    "age_distribution" JSONB NOT NULL,
    "total_buildings" INTEGER NOT NULL DEFAULT 0,
    "total_infrastructure" INTEGER NOT NULL DEFAULT 0,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "population_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "actor_role" "AuditActorRole" NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "target_table" VARCHAR(60) NOT NULL,
    "target_id" TEXT,
    "old_data" JSONB,
    "new_data" JSONB,
    "ip_address" VARCHAR(45),
    "gps_lat" DECIMAL(10,8),
    "gps_lng" DECIMAL(11,8),
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "super_admins_employee_id_key" ON "super_admins"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "super_admins_nida_number_key" ON "super_admins"("nida_number");

-- CreateIndex
CREATE UNIQUE INDEX "super_admins_email_key" ON "super_admins"("email");

-- CreateIndex
CREATE UNIQUE INDEX "district_admins_employee_id_key" ON "district_admins"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "district_admins_nida_number_key" ON "district_admins"("nida_number");

-- CreateIndex
CREATE UNIQUE INDEX "district_admins_email_key" ON "district_admins"("email");

-- CreateIndex
CREATE UNIQUE INDEX "village_officers_employee_id_key" ON "village_officers"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "village_officers_nida_number_key" ON "village_officers"("nida_number");

-- CreateIndex
CREATE UNIQUE INDEX "village_officers_email_key" ON "village_officers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "village_officers_device_fingerprint_key" ON "village_officers"("device_fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "hospital_officers_employee_id_key" ON "hospital_officers"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "hospital_officers_nida_number_key" ON "hospital_officers"("nida_number");

-- CreateIndex
CREATE UNIQUE INDEX "hospital_officers_email_key" ON "hospital_officers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "hospital_officers_device_fingerprint_key" ON "hospital_officers"("device_fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "public_users_email_key" ON "public_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "citizens_national_id_key" ON "citizens"("national_id");

-- CreateIndex
CREATE UNIQUE INDEX "citizen_children_parent_citizen_id_child_citizen_id_key" ON "citizen_children"("parent_citizen_id", "child_citizen_id");

-- CreateIndex
CREATE UNIQUE INDEX "births_birth_cert_no_key" ON "births"("birth_cert_no");

-- CreateIndex
CREATE UNIQUE INDEX "births_child_citizen_id_key" ON "births"("child_citizen_id");

-- CreateIndex
CREATE UNIQUE INDEX "deaths_death_cert_no_key" ON "deaths"("death_cert_no");

-- CreateIndex
CREATE UNIQUE INDEX "deaths_citizen_id_key" ON "deaths"("citizen_id");

-- CreateIndex
CREATE UNIQUE INDEX "marriages_marriage_cert_no_key" ON "marriages"("marriage_cert_no");

-- CreateIndex
CREATE UNIQUE INDEX "health_facilities_facility_reg_no_key" ON "health_facilities"("facility_reg_no");

-- AddForeignKey
ALTER TABLE "districts" ADD CONSTRAINT "districts_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wards" ADD CONSTRAINT "wards_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "villages" ADD CONSTRAINT "villages_ward_id_fkey" FOREIGN KEY ("ward_id") REFERENCES "wards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "super_admins" ADD CONSTRAINT "super_admins_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "super_admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "district_admins" ADD CONSTRAINT "district_admins_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "super_admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "district_admins" ADD CONSTRAINT "district_admins_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "district_admins" ADD CONSTRAINT "district_admins_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "village_officers" ADD CONSTRAINT "village_officers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "district_admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "village_officers" ADD CONSTRAINT "village_officers_village_id_fkey" FOREIGN KEY ("village_id") REFERENCES "villages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "village_officers" ADD CONSTRAINT "village_officers_ward_id_fkey" FOREIGN KEY ("ward_id") REFERENCES "wards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "village_officers" ADD CONSTRAINT "village_officers_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospital_officers" ADD CONSTRAINT "hospital_officers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "district_admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospital_officers" ADD CONSTRAINT "hospital_officers_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "health_facilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospital_officers" ADD CONSTRAINT "hospital_officers_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citizens" ADD CONSTRAINT "citizens_current_village_id_fkey" FOREIGN KEY ("current_village_id") REFERENCES "villages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citizens" ADD CONSTRAINT "citizens_father_citizen_id_fkey" FOREIGN KEY ("father_citizen_id") REFERENCES "citizens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citizens" ADD CONSTRAINT "citizens_mother_citizen_id_fkey" FOREIGN KEY ("mother_citizen_id") REFERENCES "citizens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citizens" ADD CONSTRAINT "citizens_registered_by_fkey" FOREIGN KEY ("registered_by") REFERENCES "village_officers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citizens" ADD CONSTRAINT "citizens_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citizen_children" ADD CONSTRAINT "citizen_children_parent_citizen_id_fkey" FOREIGN KEY ("parent_citizen_id") REFERENCES "citizens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citizen_children" ADD CONSTRAINT "citizen_children_child_citizen_id_fkey" FOREIGN KEY ("child_citizen_id") REFERENCES "citizens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "births" ADD CONSTRAINT "births_child_citizen_id_fkey" FOREIGN KEY ("child_citizen_id") REFERENCES "citizens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "births" ADD CONSTRAINT "births_father_citizen_id_fkey" FOREIGN KEY ("father_citizen_id") REFERENCES "citizens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "births" ADD CONSTRAINT "births_mother_citizen_id_fkey" FOREIGN KEY ("mother_citizen_id") REFERENCES "citizens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "births" ADD CONSTRAINT "births_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "health_facilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "births" ADD CONSTRAINT "births_officer_id_fkey" FOREIGN KEY ("officer_id") REFERENCES "hospital_officers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deaths" ADD CONSTRAINT "deaths_citizen_id_fkey" FOREIGN KEY ("citizen_id") REFERENCES "citizens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deaths" ADD CONSTRAINT "deaths_infant_father_id_fkey" FOREIGN KEY ("infant_father_id") REFERENCES "citizens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deaths" ADD CONSTRAINT "deaths_infant_mother_id_fkey" FOREIGN KEY ("infant_mother_id") REFERENCES "citizens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deaths" ADD CONSTRAINT "deaths_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "health_facilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deaths" ADD CONSTRAINT "deaths_village_officer_id_fkey" FOREIGN KEY ("village_officer_id") REFERENCES "village_officers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deaths" ADD CONSTRAINT "deaths_hospital_officer_id_fkey" FOREIGN KEY ("hospital_officer_id") REFERENCES "hospital_officers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marriages" ADD CONSTRAINT "marriages_husband_id_fkey" FOREIGN KEY ("husband_id") REFERENCES "citizens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marriages" ADD CONSTRAINT "marriages_wife_id_fkey" FOREIGN KEY ("wife_id") REFERENCES "citizens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marriages" ADD CONSTRAINT "marriages_registered_by_fkey" FOREIGN KEY ("registered_by") REFERENCES "village_officers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migrations" ADD CONSTRAINT "migrations_citizen_id_fkey" FOREIGN KEY ("citizen_id") REFERENCES "citizens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migrations" ADD CONSTRAINT "migrations_from_village_id_fkey" FOREIGN KEY ("from_village_id") REFERENCES "villages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migrations" ADD CONSTRAINT "migrations_to_village_id_fkey" FOREIGN KEY ("to_village_id") REFERENCES "villages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migrations" ADD CONSTRAINT "migrations_source_officer_id_fkey" FOREIGN KEY ("source_officer_id") REFERENCES "village_officers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migrations" ADD CONSTRAINT "migrations_target_officer_id_fkey" FOREIGN KEY ("target_officer_id") REFERENCES "village_officers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_village_id_fkey" FOREIGN KEY ("village_id") REFERENCES "villages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_registered_by_fkey" FOREIGN KEY ("registered_by") REFERENCES "village_officers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_infrastructure" ADD CONSTRAINT "public_infrastructure_village_id_fkey" FOREIGN KEY ("village_id") REFERENCES "villages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_infrastructure" ADD CONSTRAINT "public_infrastructure_registered_by_fkey" FOREIGN KEY ("registered_by") REFERENCES "village_officers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "population_snapshots" ADD CONSTRAINT "snapshot_region_fk" FOREIGN KEY ("scope_id") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "population_snapshots" ADD CONSTRAINT "snapshot_district_fk" FOREIGN KEY ("scope_id") REFERENCES "districts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "population_snapshots" ADD CONSTRAINT "snapshot_ward_fk" FOREIGN KEY ("scope_id") REFERENCES "wards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "population_snapshots" ADD CONSTRAINT "snapshot_village_fk" FOREIGN KEY ("scope_id") REFERENCES "villages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_super_admin_fk" FOREIGN KEY ("actor_id") REFERENCES "super_admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_district_admin_fk" FOREIGN KEY ("actor_id") REFERENCES "district_admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_village_officer_fk" FOREIGN KEY ("actor_id") REFERENCES "village_officers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_hospital_officer_fk" FOREIGN KEY ("actor_id") REFERENCES "hospital_officers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

