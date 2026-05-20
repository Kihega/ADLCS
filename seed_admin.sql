-- ============================================================
--  ADLCS — Tanzania Admin Hierarchy + Test Seed Data
--  Source: 2022 PHC Administrative Units Report (290 pages)
--  Run in Supabase SQL Editor (paste full file, click Run)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Schema additions (idempotent) ─────────────────────────────
DO $$ BEGIN
  CREATE TYPE "VillageType" AS ENUM ('village', 'street');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE villages
  ADD COLUMN IF NOT EXISTS type "VillageType" NOT NULL DEFAULT 'village';

ALTER TABLE health_facilities
  ADD COLUMN IF NOT EXISTS ward_id     INTEGER REFERENCES wards(id),
  ADD COLUMN IF NOT EXISTS district_id INTEGER REFERENCES districts(id);

-- ── Safe re-run cleanup ───────────────────────────────────────
DELETE FROM hospital_officers WHERE employee_id LIKE 'SEED-%';
DELETE FROM village_officers  WHERE employee_id LIKE 'SEED-%';
DELETE FROM health_facilities WHERE facility_reg_no LIKE 'SEED-%';
DELETE FROM district_admins   WHERE employee_id LIKE 'SEED-%';
DELETE FROM super_admins      WHERE employee_id = 'SEED-SA-001';

-- ── 1. REGIONS (31) ──────────────────────────────────────────────────
INSERT INTO regions (name, jurisdiction) VALUES
  ('Dodoma', 'mainland'),
  ('Arusha', 'mainland'),
  ('Kilimanjaro', 'mainland'),
  ('Tanga', 'mainland'),
  ('Morogoro', 'mainland'),
  ('Pwani', 'mainland'),
  ('Dar es Salaam', 'mainland'),
  ('Lindi', 'mainland'),
  ('Mtwara', 'mainland'),
  ('Ruvuma', 'mainland'),
  ('Iringa', 'mainland'),
  ('Mbeya', 'mainland'),
  ('Singida', 'mainland'),
  ('Tabora', 'mainland'),
  ('Rukwa', 'mainland'),
  ('Kigoma', 'mainland'),
  ('Shinyanga', 'mainland'),
  ('Kagera', 'mainland'),
  ('Mwanza', 'mainland'),
  ('Mara', 'mainland'),
  ('Manyara', 'mainland'),
  ('Njombe', 'mainland'),
  ('Katavi', 'mainland'),
  ('Simiyu', 'mainland'),
  ('Geita', 'mainland'),
  ('Songwe', 'mainland'),
  ('Kaskazini Unguja', 'zanzibar'),
  ('Kusini Unguja', 'zanzibar'),
  ('Mjini Magharibi', 'zanzibar'),
  ('Kaskazini Pemba', 'zanzibar'),
  ('Kusini Pemba', 'zanzibar')
ON CONFLICT DO NOTHING;

-- ── 2. DISTRICTS (195) ───────────────────────────────────────────────
-- Dodoma
INSERT INTO districts (region_id, name)
SELECT r.id, d.name FROM regions r CROSS JOIN (VALUES
  ('Kondoa District Council'),
  ('Kondoa Town Council'),
  ('Mpwapwa District Council'),
  ('Kongwa District Council'),
  ('Chamwino District Council'),
  ('Dodoma City Council'),
  ('Bahi District Council'),
  ('Chemba District Council')
) AS d(name) WHERE r.name = 'Dodoma' ON CONFLICT DO NOTHING;

-- Arusha
INSERT INTO districts (region_id, name)
SELECT r.id, d.name FROM regions r CROSS JOIN (VALUES
  ('Monduli District Council'),
  ('Meru District Council'),
  ('Arusha District Council'),
  ('Longido District Council'),
  ('Karatu District Council'),
  ('Ngorongoro District Council'),
  ('Arusha City Council')
) AS d(name) WHERE r.name = 'Arusha' ON CONFLICT DO NOTHING;

-- Kilimanjaro
INSERT INTO districts (region_id, name)
SELECT r.id, d.name FROM regions r CROSS JOIN (VALUES
  ('Rombo District Council'),
  ('Mwanga District Council'),
  ('Same District Council'),
  ('Moshi Municipal Council'),
  ('Moshi District Council'),
  ('Hai District Council'),
  ('Siha District Council')
) AS d(name) WHERE r.name = 'Kilimanjaro' ON CONFLICT DO NOTHING;

-- Tanga
INSERT INTO districts (region_id, name)
SELECT r.id, d.name FROM regions r CROSS JOIN (VALUES
  ('Lushoto District Council'),
  ('Bumbuli District Council'),
  ('Korogwe District Council'),
  ('Korogwe Town Council'),
  ('Muheza District Council'),
  ('Tanga City Council'),
  ('Pangani District Council'),
  ('Handeni District Council'),
  ('Handeni Town Council'),
  ('Kilindi District Council'),
  ('Mkinga District Council')
) AS d(name) WHERE r.name = 'Tanga' ON CONFLICT DO NOTHING;

-- Morogoro
INSERT INTO districts (region_id, name)
SELECT r.id, d.name FROM regions r CROSS JOIN (VALUES
  ('Kilosa District Council'),
  ('Morogoro District Council'),
  ('Morogoro Municipal Council'),
  ('Mlimba District Council'),
  ('Ifakara Town Council'),
  ('Ulanga District Council'),
  ('Malinyi District Council'),
  ('Mvomero District Council'),
  ('Gairo District Council')
) AS d(name) WHERE r.name = 'Morogoro' ON CONFLICT DO NOTHING;

-- Pwani
INSERT INTO districts (region_id, name)
SELECT r.id, d.name FROM regions r CROSS JOIN (VALUES
  ('Bagamoyo District Council'),
  ('Chalinze District Council'),
  ('Kibaha District Council'),
  ('Kibaha Town Council'),
  ('Kisarawe District Council'),
  ('Mkuranga District Council'),
  ('Rufiji District Council'),
  ('Mafia District Council'),
  ('Kibiti District Council')
) AS d(name) WHERE r.name = 'Pwani' ON CONFLICT DO NOTHING;

-- Dar es Salaam
INSERT INTO districts (region_id, name)
SELECT r.id, d.name FROM regions r CROSS JOIN (VALUES
  ('Kinondoni Municipal Council'),
  ('Dar Es Salaam City Council'),
  ('Temeke Municipal Council'),
  ('Kigamboni Municipal Council'),
  ('Ubungo Municipal Council')
) AS d(name) WHERE r.name = 'Dar es Salaam' ON CONFLICT DO NOTHING;

-- Lindi
INSERT INTO districts (region_id, name)
SELECT r.id, d.name FROM regions r CROSS JOIN (VALUES
  ('Kilwa District Council'),
  ('Mtama District Council'),
  ('Lindi Municipal Council'),
  ('Nachingwea District Council'),
  ('Liwale District Council'),
  ('Ruangwa District Council')
) AS d(name) WHERE r.name = 'Lindi' ON CONFLICT DO NOTHING;

-- Mtwara
INSERT INTO districts (region_id, name)
SELECT r.id, d.name FROM regions r CROSS JOIN (VALUES
  ('Mtwara District Council'),
  ('Nanyamba Town Council'),
  ('Mtwara Municipal Council'),
  ('Newala District Council'),
  ('Newala Town Council'),
  ('Masasi District Council'),
  ('Masasi Town Council'),
  ('Tandahimba District Council'),
  ('Nanyumbu District Council')
) AS d(name) WHERE r.name = 'Mtwara' ON CONFLICT DO NOTHING;

-- Ruvuma
INSERT INTO districts (region_id, name)
SELECT r.id, d.name FROM regions r CROSS JOIN (VALUES
  ('Tunduru District Council'),
  ('Songea District Council'),
  ('Songea Municipal Council'),
  ('Madaba District Council'),
  ('Mbinga District Council'),
  ('Mbinga Town Council'),
  ('Nyasa District Council'),
  ('Namtumbo District Council')
) AS d(name) WHERE r.name = 'Ruvuma' ON CONFLICT DO NOTHING;

-- Iringa
INSERT INTO districts (region_id, name)
SELECT r.id, d.name FROM regions r CROSS JOIN (VALUES
  ('Iringa District Council'),
  ('Iringa Municipal Council'),
  ('Mafinga Town Council'),
  ('Mufindi District Council'),
  ('Kilolo District Council')
) AS d(name) WHERE r.name = 'Iringa' ON CONFLICT DO NOTHING;

-- Mbeya
INSERT INTO districts (region_id, name)
SELECT r.id, d.name FROM regions r CROSS JOIN (VALUES
  ('Chunya District Council'),
  ('Mbeya District Council'),
  ('Mbeya City Council'),
  ('Kyela District Council'),
  ('Rungwe District Council'),
  ('Busokelo District Council'),
  ('Mbarali District Council')
) AS d(name) WHERE r.name = 'Mbeya' ON CONFLICT DO NOTHING;

-- Singida
INSERT INTO districts (region_id, name)
SELECT r.id, d.name FROM regions r CROSS JOIN (VALUES
  ('Iramba District Council'),
  ('Singida District Council'),
  ('Singida Municipal Council'),
  ('Manyoni District Council'),
  ('Itigi District Council'),
  ('Ikungi District Council'),
  ('Mkalama District Council')
) AS d(name) WHERE r.name = 'Singida' ON CONFLICT DO NOTHING;

-- Tabora
INSERT INTO districts (region_id, name)
SELECT r.id, d.name FROM regions r CROSS JOIN (VALUES
  ('Nzega Town Council'),
  ('Nzega District Council'),
  ('Igunga District Council'),
  ('Uyui District Council'),
  ('Urambo District Council'),
  ('Sikonge District Council'),
  ('Tabora Municipal Council'),
  ('Kaliua District Council')
) AS d(name) WHERE r.name = 'Tabora' ON CONFLICT DO NOTHING;

-- Rukwa
INSERT INTO districts (region_id, name)
SELECT r.id, d.name FROM regions r CROSS JOIN (VALUES
  ('Kalambo District Council'),
  ('Sumbawanga District Council'),
  ('Sumbawanga Municipal Council'),
  ('Nkasi District Council')
) AS d(name) WHERE r.name = 'Rukwa' ON CONFLICT DO NOTHING;

-- Kigoma
INSERT INTO districts (region_id, name)
SELECT r.id, d.name FROM regions r CROSS JOIN (VALUES
  ('Kibondo District Council'),
  ('Kasulu District Council'),
  ('Kasulu Town Council'),
  ('Kigoma District Council'),
  ('Kigoma Municipal Council'),
  ('Uvinza District Council'),
  ('Buhigwe District Council'),
  ('Kakonko District Council')
) AS d(name) WHERE r.name = 'Kigoma' ON CONFLICT DO NOTHING;

-- Shinyanga
INSERT INTO districts (region_id, name)
SELECT r.id, d.name FROM regions r CROSS JOIN (VALUES
  ('Ushetu District Council'),
  ('Kahama Municipal Council'),
  ('Msalala Distict Council'),
  ('Kishapu District Council'),
  ('Shinyanga District Council'),
  ('Shinyanga Municipal Council')
) AS d(name) WHERE r.name = 'Shinyanga' ON CONFLICT DO NOTHING;

-- Kagera
INSERT INTO districts (region_id, name)
SELECT r.id, d.name FROM regions r CROSS JOIN (VALUES
  ('Karagwe District Council'),
  ('Bukoba District Council'),
  ('Bukoba Municipal Council'),
  ('Muleba District Council'),
  ('Biharamulo District Council'),
  ('Ngara District Council'),
  ('Kyerwa District Council'),
  ('Missenyi District Council')
) AS d(name) WHERE r.name = 'Kagera' ON CONFLICT DO NOTHING;

-- Mwanza
INSERT INTO districts (region_id, name)
SELECT r.id, d.name FROM regions r CROSS JOIN (VALUES
  ('Ukerewe District Council'),
  ('Magu District Council'),
  ('Mwanza City Council'),
  ('Kwimba District Council'),
  ('Sengerema District Council'),
  ('Buchosa District Council'),
  ('Ilemela Municipal Council'),
  ('Misungwi District Council')
) AS d(name) WHERE r.name = 'Mwanza' ON CONFLICT DO NOTHING;

-- Mara
INSERT INTO districts (region_id, name)
SELECT r.id, d.name FROM regions r CROSS JOIN (VALUES
  ('Tarime District Council'),
  ('Tarime Town Council'),
  ('Serengeti District Council'),
  ('Musoma District Council'),
  ('Musoma Municipal Council'),
  ('Bunda District Council'),
  ('Bunda Town Council'),
  ('Butiama District Council'),
  ('Rorya District Council')
) AS d(name) WHERE r.name = 'Mara' ON CONFLICT DO NOTHING;

-- Manyara
INSERT INTO districts (region_id, name)
SELECT r.id, d.name FROM regions r CROSS JOIN (VALUES
  ('Babati District Council'),
  ('Babati Town Council'),
  ('Hanang District Council'),
  ('Mbulu District Council'),
  ('Mbulu Town Council'),
  ('Simanjiro District Council'),
  ('Kiteto District Council')
) AS d(name) WHERE r.name = 'Manyara' ON CONFLICT DO NOTHING;

-- Njombe
INSERT INTO districts (region_id, name)
SELECT r.id, d.name FROM regions r CROSS JOIN (VALUES
  ('Njombe District Council'),
  ('Njombe Town Council'),
  ('Makambako Town Council'),
  ('Ludewa District Council'),
  ('Makete District Council'),
  ('Wanging''Ombe District Council')
) AS d(name) WHERE r.name = 'Njombe' ON CONFLICT DO NOTHING;

-- Katavi
INSERT INTO districts (region_id, name)
SELECT r.id, d.name FROM regions r CROSS JOIN (VALUES
  ('Mpanda Municipal Council'),
  ('Nsimbo District Council'),
  ('Tanganyika District Council'),
  ('Mlele District Council'),
  ('Mpimbwe District Council')
) AS d(name) WHERE r.name = 'Katavi' ON CONFLICT DO NOTHING;

-- Simiyu
INSERT INTO districts (region_id, name)
SELECT r.id, d.name FROM regions r CROSS JOIN (VALUES
  ('Bariadi District Council'),
  ('Bariadi Town Council'),
  ('Itilima District Council'),
  ('Meatu District Council'),
  ('Maswa District Council'),
  ('Busega District Council')
) AS d(name) WHERE r.name = 'Simiyu' ON CONFLICT DO NOTHING;

-- Geita
INSERT INTO districts (region_id, name)
SELECT r.id, d.name FROM regions r CROSS JOIN (VALUES
  ('Geita District Council'),
  ('Geita Town Council'),
  ('Nyang''Hwale District Council'),
  ('Mbogwe District Council'),
  ('Bukombe District Council'),
  ('Chato District Council')
) AS d(name) WHERE r.name = 'Geita' ON CONFLICT DO NOTHING;

-- Songwe
INSERT INTO districts (region_id, name)
SELECT r.id, d.name FROM regions r CROSS JOIN (VALUES
  ('Momba District Council'),
  ('Tunduma Town Council'),
  ('Songwe District Council'),
  ('Mbozi District Council'),
  ('Ileje District Council')
) AS d(name) WHERE r.name = 'Songwe' ON CONFLICT DO NOTHING;

-- Kaskazini Unguja
INSERT INTO districts (region_id, name)
SELECT r.id, d.name FROM regions r CROSS JOIN (VALUES
  ('Kaskazini A District Council'),
  ('Kaskazini B Town Council')
) AS d(name) WHERE r.name = 'Kaskazini Unguja' ON CONFLICT DO NOTHING;

-- Kusini Unguja
INSERT INTO districts (region_id, name)
SELECT r.id, d.name FROM regions r CROSS JOIN (VALUES
  ('Kati Town Council'),
  ('Kusini District Council')
) AS d(name) WHERE r.name = 'Kusini Unguja' ON CONFLICT DO NOTHING;

-- Mjini Magharibi
INSERT INTO districts (region_id, name)
SELECT r.id, d.name FROM regions r CROSS JOIN (VALUES
  ('Mjini Municipal Council'),
  ('Magharibi A Municipal Council'),
  ('Magharibi B Municipal Council')
) AS d(name) WHERE r.name = 'Mjini Magharibi' ON CONFLICT DO NOTHING;

-- Kaskazini Pemba
INSERT INTO districts (region_id, name)
SELECT r.id, d.name FROM regions r CROSS JOIN (VALUES
  ('Wete Town Council'),
  ('Micheweni District Council')
) AS d(name) WHERE r.name = 'Kaskazini Pemba' ON CONFLICT DO NOTHING;

-- Kusini Pemba
INSERT INTO districts (region_id, name)
SELECT r.id, d.name FROM regions r CROSS JOIN (VALUES
  ('Chake Chake Town Council'),
  ('Mkoani Town Council')
) AS d(name) WHERE r.name = 'Kusini Pemba' ON CONFLICT DO NOTHING;

-- ── 3. WARDS / SHEHIA (4160) ──────────────────────────────────────────
-- Kondoa District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Changaa'),
  ('Hondomairo'),
  ('Thawi'),
  ('Kikilo'),
  ('Soera'),
  ('Salanka'),
  ('Bereko'),
  ('Kikore'),
  ('Mnenia'),
  ('Masange'),
  ('Itololo'),
  ('Kisese'),
  ('Itaswi'),
  ('Keikei'),
  ('Kwadelo'),
  ('Busi'),
  ('Kalamba'),
  ('Haubi'),
  ('Kinyasi'),
  ('Pahi'),
  ('Bumbuta')
) AS w(name) WHERE d.name = 'Kondoa District Council' ON CONFLICT DO NOTHING;

-- Kondoa Town Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Kondoa Mjini'),
  ('Kilimani'),
  ('Chemchem'),
  ('Suruke'),
  ('Kingale'),
  ('Serya'),
  ('Bolisa'),
  ('Kolo')
) AS w(name) WHERE d.name = 'Kondoa Town Council' ON CONFLICT DO NOTHING;

-- Mpwapwa District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Mazae'),
  ('Ving''Hawe'),
  ('Matomondo'),
  ('Kimagai'),
  ('Chunyu'),
  ('Godegode'),
  ('Mpwapwa Mjini'),
  ('Lupeta'),
  ('Gulwe'),
  ('Ng''Hambi'),
  ('Mlembule'),
  ('Mima'),
  ('Berege'),
  ('Chitemo'),
  ('Iwondo'),
  ('Kibakwe'),
  ('Lumuma'),
  ('Luhundwa'),
  ('Wotta'),
  ('Mbuga'),
  ('Kingiti'),
  ('Lufu'),
  ('Pwaga'),
  ('Galigali'),
  ('Wangi'),
  ('Massa'),
  ('Ipera'),
  ('Rudi'),
  ('Mlunduzi'),
  ('Mtera'),
  ('Chipogoro'),
  ('Malolo'),
  ('Mang''Aliza')
) AS w(name) WHERE d.name = 'Mpwapwa District Council' ON CONFLICT DO NOTHING;

-- Kongwa District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Hogoro'),
  ('Zoissa'),
  ('Mkoka'),
  ('Makawa'),
  ('Chitego'),
  ('Matongoro'),
  ('Songambele'),
  ('Njoge'),
  ('Pandambili'),
  ('Mlali'),
  ('Iduo'),
  ('Kibaigwa'),
  ('Chamkoroma'),
  ('Ngomai'),
  ('Chiwe'),
  ('Lenjulu'),
  ('Ng''Humbi'),
  ('Kongwa'),
  ('Sejeli'),
  ('Mtanana'),
  ('Sagara'),
  ('Ugogoni')
) AS w(name) WHERE d.name = 'Kongwa District Council' ON CONFLICT DO NOTHING;

-- Chamwino District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Haneti'),
  ('Segala'),
  ('Itiso'),
  ('Dabalo'),
  ('Zajilwa'),
  ('Membe'),
  ('Msanga'),
  ('Chilonwa'),
  ('Buigiri'),
  ('Majeleko'),
  ('Manchali'),
  ('Ikowa'),
  ('Msamalo'),
  ('Chamwino'),
  ('Igandu'),
  ('Muungano'),
  ('Mvumi Makulu'),
  ('Handali'),
  ('Mvumi Misheni'),
  ('Idifu'),
  ('Nghahelezi'),
  ('Makang''Wa'),
  ('Iringa Mvumi'),
  ('Manzase'),
  ('Fufu'),
  ('Mlowa Bwawani'),
  ('Loje'),
  ('Chiboli'),
  ('Nhinhi'),
  ('Ikombolinga'),
  ('Mlowa Barabarani'),
  ('Mpwayungu'),
  ('Nghambaku'),
  ('Chinugulu'),
  ('Manda'),
  ('Huzi')
) AS w(name) WHERE d.name = 'Chamwino District Council' ON CONFLICT DO NOTHING;

-- Dodoma City Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Msalato'),
  ('Makutupora'),
  ('Chihanga'),
  ('Hombolo Makulu'),
  ('Ipala'),
  ('Chahwa'),
  ('Hombolo Bwawani'),
  ('Mtumba'),
  ('Kikombo'),
  ('Nghong''Onha'),
  ('Ihumwa'),
  ('Viwandani'),
  ('Uhuru'),
  ('Chamwino'),
  ('Kiwanja Cha Ndege'),
  ('Makole'),
  ('Miyuji'),
  ('Nzuguni'),
  ('Dodoma Makulu'),
  ('Tambukareli'),
  ('Kilimani'),
  ('Kikuyu Kusini'),
  ('Kikuyu Kaskazini'),
  ('Mkonze'),
  ('Hazina'),
  ('Madukani'),
  ('Majengo'),
  ('Kizota'),
  ('Ntyuka'),
  ('Chang''Ombe'),
  ('Iyumbu'),
  ('Mnadani'),
  ('Ipagala'),
  ('Nkuhungu'),
  ('Mpunguzi'),
  ('Mbabala'),
  ('Zuzu'),
  ('Nala'),
  ('Mbalawala'),
  ('Chigongwe'),
  ('Matumbulu')
) AS w(name) WHERE d.name = 'Dodoma City Council' ON CONFLICT DO NOTHING;

-- Bahi District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Ibugule'),
  ('Chibelela'),
  ('Mwitikira'),
  ('Mtitaa'),
  ('Chikola'),
  ('Chipanga'),
  ('Chali'),
  ('Nondwa'),
  ('Mpalanga'),
  ('Chifutuka'),
  ('Bahi'),
  ('Mpamantwa'),
  ('Ibihwa'),
  ('Ilindi'),
  ('Kigwe'),
  ('Mpinga'),
  ('Makanda'),
  ('Lamaiti'),
  ('Babayu'),
  ('Zanka'),
  ('Msisi'),
  ('Mundemu')
) AS w(name) WHERE d.name = 'Bahi District Council' ON CONFLICT DO NOTHING;

-- Chemba District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Churuku'),
  ('Mondo'),
  ('Dalai'),
  ('Jangalo'),
  ('Paranga'),
  ('Msaada'),
  ('Kimaha'),
  ('Songolo'),
  ('Mrijo'),
  ('Chandama'),
  ('Goima'),
  ('Chemba'),
  ('Kidoka'),
  ('Soya'),
  ('Makorongo'),
  ('Gwandi'),
  ('Farkwa'),
  ('Tumbakose'),
  ('Babayu'),
  ('Ovada'),
  ('Mpendo'),
  ('Sanzawa'),
  ('Kwamtoro'),
  ('Lalta'),
  ('Lahoda'),
  ('Kinyamsindo')
) AS w(name) WHERE d.name = 'Chemba District Council' ON CONFLICT DO NOTHING;

-- Monduli District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Monduli Juu'),
  ('Engutoto'),
  ('Monduli Mjini'),
  ('Moita'),
  ('Sepeko'),
  ('Lolkisale'),
  ('Lepurko'),
  ('Meserani'),
  ('Mfereji'),
  ('Naalarami'),
  ('Lemooti'),
  ('Makuyuni'),
  ('Esilalei'),
  ('Mswakini'),
  ('Engaruka'),
  ('Selela'),
  ('Mto Wa Mbu'),
  ('Majengo'),
  ('Migungani')
) AS w(name) WHERE d.name = 'Monduli District Council' ON CONFLICT DO NOTHING;

-- Meru District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Ngarenanyuki'),
  ('Leguruki'),
  ('King''Ori'),
  ('Maji Ya Chai'),
  ('Kikatiti'),
  ('Ngabobo'),
  ('Uwiro'),
  ('Maruvango'),
  ('Malula'),
  ('Imbaseni'),
  ('Usariver'),
  ('Nkoaranga'),
  ('Poli'),
  ('Seela Sing''Isi'),
  ('Akheri'),
  ('Nkoanrua'),
  ('Songoro'),
  ('Nkoarisambu'),
  ('Nkoanekoli'),
  ('Ambureni'),
  ('Maroroni'),
  ('Makiba'),
  ('Mbuguni'),
  ('Kikwe'),
  ('Majengo'),
  ('Shambarai Burka')
) AS w(name) WHERE d.name = 'Meru District Council' ON CONFLICT DO NOTHING;

-- Arusha District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Oldonyosambu'),
  ('Lengijave'),
  ('Olturumet'),
  ('Mwandet'),
  ('Musa'),
  ('Kisongo'),
  ('Mateves'),
  ('Oldonyowass'),
  ('Lemanyata'),
  ('Laroi'),
  ('Ilkiding''A'),
  ('Olturoto'),
  ('Kiranyi'),
  ('Kimnyak'),
  ('Oljoro'),
  ('Sambasha'),
  ('Oloirien'),
  ('Olmotonyi'),
  ('Tarakwa'),
  ('Ilboru'),
  ('Bangata'),
  ('Sokon Ii'),
  ('Bwawani'),
  ('Nduruma'),
  ('Mlangarini'),
  ('Kiutu')
) AS w(name) WHERE d.name = 'Arusha District Council' ON CONFLICT DO NOTHING;

-- Longido District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Matale A'),
  ('Engarenaibor'),
  ('Mundarara'),
  ('Ketumbeine'),
  ('Elang''Atadapash'),
  ('Ilorienito'),
  ('Gelai Meirugoi'),
  ('Gelai Lumbwa'),
  ('Noondoto'),
  ('Engikaret'),
  ('Kimokouwa'),
  ('Namanga'),
  ('Orbomba'),
  ('Longido'),
  ('Tingatinga'),
  ('Olmolog'),
  ('Kamwanga'),
  ('Sinya')
) AS w(name) WHERE d.name = 'Longido District Council' ON CONFLICT DO NOTHING;

-- Karatu District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Baray'),
  ('Mang''Ola'),
  ('Endamaghang'),
  ('Karatu'),
  ('Daa'),
  ('Oldeani'),
  ('Qurus'),
  ('Ganako'),
  ('Rhotia'),
  ('Mbulumbulu'),
  ('Endamarariek'),
  ('Buger'),
  ('Endabash'),
  ('Kansay')
) AS w(name) WHERE d.name = 'Karatu District Council' ON CONFLICT DO NOTHING;

-- Ngorongoro District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Orgosorok'),
  ('Arash'),
  ('Soitsambu'),
  ('Enguserosambu'),
  ('Olorien/Magaiduru'),
  ('Maalon'),
  ('Ololosokwan'),
  ('Oloipiri'),
  ('Digodigo'),
  ('Oldonyosambu'),
  ('Pinyinyi'),
  ('Sale'),
  ('Malambo'),
  ('Samunge'),
  ('Kirangi'),
  ('Engaresero'),
  ('Piyaya'),
  ('Naiyobi'),
  ('Nainokanoka'),
  ('Olbalbal'),
  ('Ngorongoro'),
  ('Enduleni'),
  ('Kakesio'),
  ('Alailelai'),
  ('Ngoile'),
  ('Misigiyo'),
  ('Alaitolei'),
  ('Eyasi')
) AS w(name) WHERE d.name = 'Ngorongoro District Council' ON CONFLICT DO NOTHING;

-- Arusha City Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Kati'),
  ('Kaloleni'),
  ('Sekei'),
  ('Themi'),
  ('Daraja Ii'),
  ('Unga Ltd'),
  ('Ngarenaro'),
  ('Levolosi'),
  ('Kimandolu'),
  ('Baraa'),
  ('Oloirien'),
  ('Moshono'),
  ('Moivaro'),
  ('Lemara'),
  ('Terrat'),
  ('Sokon I'),
  ('Sombetini'),
  ('Engutoto'),
  ('Elerai'),
  ('Olasiti'),
  ('Muriet'),
  ('Olmoti'),
  ('Sakina'),
  ('Osunyai Jr'),
  ('Sinoni')
) AS w(name) WHERE d.name = 'Arusha City Council' ON CONFLICT DO NOTHING;

-- Rombo District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Motamburu Kitendeni'),
  ('Tarakea Motamburu'),
  ('Nanjara'),
  ('Reha'),
  ('Ubetu Kahe'),
  ('Kitirima'),
  ('Kingachi'),
  ('Kirongo Samanga'),
  ('Olele'),
  ('Marangu Kitowo'),
  ('Kisale Msaranga'),
  ('Katangara/Mrere'),
  ('Kirwa Keni'),
  ('Mrao Keryo'),
  ('Ushiri/Ikuini'),
  ('Kelamfua/Mokala'),
  ('Makiidi'),
  ('Shimbi'),
  ('Shimbi Kwandele'),
  ('Aleni'),
  ('Mengeni'),
  ('Manda'),
  ('Mengwe'),
  ('Ngoyoni'),
  ('Mamsera'),
  ('Chala'),
  ('Holili'),
  ('Mahida')
) AS w(name) WHERE d.name = 'Rombo District Council' ON CONFLICT DO NOTHING;

-- Mwanga District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Kighare'),
  ('Kirongwe'),
  ('Chomvu'),
  ('Mwaniko'),
  ('Msangeni'),
  ('Kifula'),
  ('Shighatini'),
  ('Kivisini'),
  ('Jipe'),
  ('Kigonigoni'),
  ('Toloha'),
  ('Kwakoa'),
  ('Mgagao'),
  ('Kirya'),
  ('Kilomeni'),
  ('Lembeni'),
  ('Ngujini'),
  ('Kileo'),
  ('Lang''Ata'),
  ('Mwanga')
) AS w(name) WHERE d.name = 'Mwanga District Council' ON CONFLICT DO NOTHING;

-- Same District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Ruvu'),
  ('Njoro'),
  ('Vumari'),
  ('Stesheni'),
  ('Same'),
  ('Kisima'),
  ('Kisiwani'),
  ('Bangalala'),
  ('Mwembe'),
  ('Mhezi'),
  ('Mshewa'),
  ('Msindo'),
  ('Vudee'),
  ('Hedaru'),
  ('Gavao-Saweni'),
  ('Mabilioni'),
  ('Makanya'),
  ('Suji'),
  ('Tae'),
  ('Chome'),
  ('Vuje'),
  ('Bombo'),
  ('Mtii'),
  ('Lugulu'),
  ('Maore'),
  ('Kalemawe'),
  ('Kihurio'),
  ('Bendera'),
  ('Ndungu'),
  ('Vunta'),
  ('Kirangare'),
  ('Myamba'),
  ('Mpinji'),
  ('Bwambo')
) AS w(name) WHERE d.name = 'Same District Council' ON CONFLICT DO NOTHING;

-- Moshi Municipal Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Kilimanjaro'),
  ('Mfumuni'),
  ('Kiusa'),
  ('Korongoni'),
  ('Soweto'),
  ('Shirimatunda'),
  ('Karanga'),
  ('Rau'),
  ('Bomambuzi'),
  ('Majengo'),
  ('Mawenzi'),
  ('Bondeni'),
  ('Kiborloni'),
  ('Ng''Ambo'),
  ('Msaranga'),
  ('Mji Mpya'),
  ('Miembeni'),
  ('Njoro'),
  ('Kaloleni'),
  ('Pasua')
) AS w(name) WHERE d.name = 'Moshi Municipal Council' ON CONFLICT DO NOTHING;

-- Moshi District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Kindi'),
  ('Kibosho Magharibi'),
  ('Kibosho Okaoni'),
  ('Kibosho Kati'),
  ('Kibosho Kirima'),
  ('Kibosho Mashariki'),
  ('Uru Kusini'),
  ('Uru Kaskazini'),
  ('Uru Shimbwe'),
  ('Uru Mashariki'),
  ('Mbokomu'),
  ('Old Moshi Magharibi'),
  ('Old Moshi Mashariki'),
  ('Kimochi'),
  ('Arusha Chini'),
  ('Mabogini'),
  ('Kirua Vunjo Magharibi'),
  ('Kilema Kaskazini'),
  ('Kilema Kati'),
  ('Kahe Mashariki'),
  ('Kahe Magharibi'),
  ('Kirua Vunjo Kusini'),
  ('Kirua Vunjo Mashariki'),
  ('Kilema Kusini'),
  ('Njia Panda'),
  ('Marangu Magharibi'),
  ('Marangu Mashariki'),
  ('Mamba Kusini'),
  ('Mamba Kaskazini'),
  ('Mwika Kaskazini'),
  ('Mwika Kusini'),
  ('Makuyuni')
) AS w(name) WHERE d.name = 'Moshi District Council' ON CONFLICT DO NOTHING;

-- Hai District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Machame Uroki'),
  ('Machame Magharibi'),
  ('Machame Kaskazini'),
  ('Machame Mashariki'),
  ('Machame Narumu'),
  ('Mnadani'),
  ('Weruweru'),
  ('Masama Magharibi'),
  ('Masama Kati'),
  ('Masama Mashariki'),
  ('Masama Rundugai'),
  ('Kia'),
  ('Muungano'),
  ('Bondeni'),
  ('Bomang''Ombe'),
  ('Masama Kusini'),
  ('Romu')
) AS w(name) WHERE d.name = 'Hai District Council' ON CONFLICT DO NOTHING;

-- Siha District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Miti Mirefu'),
  ('Ndumeti'),
  ('Ngarenairobi'),
  ('Karansi'),
  ('Gararagua'),
  ('Sanya Juu'),
  ('Livishi'),
  ('Nasai'),
  ('Kirua'),
  ('Ivaeny'),
  ('Kashashi'),
  ('Ormelili'),
  ('Olkolili'),
  ('Donyomurwak'),
  ('Songu'),
  ('Biriri'),
  ('Makiwaru')
) AS w(name) WHERE d.name = 'Siha District Council' ON CONFLICT DO NOTHING;

-- Lushoto District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Lushoto'),
  ('Magamba'),
  ('Kwai'),
  ('Migambo'),
  ('Gare'),
  ('Kwemashai'),
  ('Ngulwi'),
  ('Ubiri'),
  ('Ngwelo'),
  ('Kilole'),
  ('Mlola'),
  ('Makanya'),
  ('Malibwi'),
  ('Mbwei'),
  ('Kwekanga'),
  ('Rangwi'),
  ('Sunga'),
  ('Mbaru'),
  ('Mtae'),
  ('Shagayu'),
  ('Mbaramo'),
  ('Mnazi'),
  ('Lunguza'),
  ('Mng''Aro'),
  ('Shume'),
  ('Lukozi'),
  ('Malindi'),
  ('Mwangoi'),
  ('Manolo'),
  ('Mlalo'),
  ('Kwemshasha'),
  ('Hemtoye')
) AS w(name) WHERE d.name = 'Lushoto District Council' ON CONFLICT DO NOTHING;

-- Bumbuli District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Baga'),
  ('Mgwashi'),
  ('Nkongoi'),
  ('Kwemkomole'),
  ('Bumbuli'),
  ('Kisiwani'),
  ('Mamba'),
  ('Milingano'),
  ('Mayo'),
  ('Mahezangulu'),
  ('Tamota'),
  ('Funta'),
  ('Soni'),
  ('Mbuzii'),
  ('Mponde'),
  ('Usambara'),
  ('Vuga')
) AS w(name) WHERE d.name = 'Bumbuli District Council' ON CONFLICT DO NOTHING;

-- Korogwe District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Makuyuni'),
  ('Chekelei'),
  ('Mombo'),
  ('Mkalamo'),
  ('Mazinde'),
  ('Mkomazi'),
  ('Mswaha'),
  ('Magamba Kwalukonge'),
  ('Mkumbara'),
  ('Magila Gereza'),
  ('Vugiri'),
  ('Dindira'),
  ('Bungu'),
  ('Lutindi'),
  ('Kwashemshi'),
  ('Mpale'),
  ('Mgwashi'),
  ('Mlungui'),
  ('Lewa'),
  ('Mashewa'),
  ('Kizara'),
  ('Magoma'),
  ('Kerenge'),
  ('Kalalani'),
  ('Foroforo'),
  ('Makumba'),
  ('Kwagunda'),
  ('Mnyuzi'),
  ('Hale')
) AS w(name) WHERE d.name = 'Korogwe District Council' ON CONFLICT DO NOTHING;

-- Korogwe Town Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Mgombezi'),
  ('Mtonga'),
  ('Magunga'),
  ('Kwamndolwa'),
  ('Old Korogwe'),
  ('Manundu'),
  ('Kilole'),
  ('Kwamsisi'),
  ('Masuguru'),
  ('Majengo'),
  ('Bagamoyo')
) AS w(name) WHERE d.name = 'Korogwe Town Council' ON CONFLICT DO NOTHING;

-- Muheza District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Misozwe'),
  ('Pande Darajani'),
  ('Ngomeni'),
  ('Kigombe'),
  ('Lusanga'),
  ('Kicheba'),
  ('Mpapayu'),
  ('Mlingano'),
  ('Kwemingoji'),
  ('Magoroto'),
  ('Magila'),
  ('Mbaramo'),
  ('Majengo'),
  ('Masuguru'),
  ('Tingeni'),
  ('Kilulu'),
  ('Mkuzi'),
  ('Mtindiro'),
  ('Kwakifua'),
  ('Kwemkabala'),
  ('Genge'),
  ('Tanganyika'),
  ('Kwabada'),
  ('Kwafungo'),
  ('Songa'),
  ('Bwembwera'),
  ('Potwe'),
  ('Nkumba'),
  ('Tongwe'),
  ('Mhamba'),
  ('Makole'),
  ('Misalai'),
  ('Zirai'),
  ('Mbomole'),
  ('Amani'),
  ('Kwezitu')
) AS w(name) WHERE d.name = 'Muheza District Council' ON CONFLICT DO NOTHING;

-- Tanga City Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Nguvumali'),
  ('Chumbageni'),
  ('Mzizima'),
  ('Mabokweni'),
  ('Kiomoni'),
  ('Chongoleani'),
  ('Central'),
  ('Ngamiani Kaskazini'),
  ('Usagara'),
  ('Makorora'),
  ('Mzingani'),
  ('Mnyanjani'),
  ('Majengo'),
  ('Ngamiani Kati'),
  ('Ngamiani Kusini'),
  ('Msambweni'),
  ('Mwanzange'),
  ('Mabawa'),
  ('Magaoni'),
  ('Tangasisi'),
  ('Tongoni'),
  ('Marungu'),
  ('Pongwe'),
  ('Maweni'),
  ('Duga'),
  ('Kirare'),
  ('Masiwani')
) AS w(name) WHERE d.name = 'Tanga City Council' ON CONFLICT DO NOTHING;

-- Pangani District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Madanga'),
  ('Kimang''A'),
  ('Bushiri'),
  ('Masaika'),
  ('Pangani Mashariki'),
  ('Pangani Magharibi'),
  ('Bweni'),
  ('Mwera'),
  ('Tungamaa'),
  ('Kipumbwi'),
  ('Mikinguni'),
  ('Ubangaa'),
  ('Mkwaja'),
  ('Mkalamo')
) AS w(name) WHERE d.name = 'Pangani District Council' ON CONFLICT DO NOTHING;

-- Handeni District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Sindeni'),
  ('Misima'),
  ('Kiva'),
  ('Kwamatuku'),
  ('Segera'),
  ('Kwedizinga'),
  ('Kwamgwe'),
  ('Ndolwa'),
  ('Kabuku'),
  ('Mgambo'),
  ('Komkonga'),
  ('Kabuku Ndani'),
  ('Mazingara'),
  ('Mkata'),
  ('Kitumbi'),
  ('Kwamsisi'),
  ('Kwasunga'),
  ('Kwaluguru'),
  ('Kang''Ata'),
  ('Kwankonje'),
  ('Kwachaga')
) AS w(name) WHERE d.name = 'Handeni District Council' ON CONFLICT DO NOTHING;

-- Handeni Town Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Kwenjugo'),
  ('Mabanda'),
  ('Konje'),
  ('Mlimani'),
  ('Msasa'),
  ('Kideleko'),
  ('Kwamagome'),
  ('Vibaoni'),
  ('Chanika'),
  ('Mdoe'),
  ('Kwediyamba')
) AS w(name) WHERE d.name = 'Handeni Town Council' ON CONFLICT DO NOTHING;

-- Kilindi District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Mvungwe'),
  ('Kwediboma'),
  ('Saunyi'),
  ('Kisangasa'),
  ('Kibirashi'),
  ('Kilwa'),
  ('Mkindi'),
  ('Jaila'),
  ('Msanja'),
  ('Mabalanga'),
  ('Kimbe'),
  ('Kilindi'),
  ('Negero'),
  ('Lwande'),
  ('Kikunde'),
  ('Songe'),
  ('Pagwi'),
  ('Masagalu'),
  ('Tunguli'),
  ('Kwekivu'),
  ('Bokwa')
) AS w(name) WHERE d.name = 'Kilindi District Council' ON CONFLICT DO NOTHING;

-- Mkinga District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Mwakijembe'),
  ('Mkinga'),
  ('Duga'),
  ('Moa'),
  ('Manza'),
  ('Kwale'),
  ('Mtimbwani'),
  ('Doda'),
  ('Boma'),
  ('Parungu Kasera'),
  ('Mayomboni'),
  ('Sigaya'),
  ('Gombero'),
  ('Mhinduro'),
  ('Maramba'),
  ('Kigongoi Mashariki'),
  ('Daluni'),
  ('Bosha'),
  ('Bwiti'),
  ('Mnyenzani'),
  ('Kigongoi Magharibi')
) AS w(name) WHERE d.name = 'Mkinga District Council' ON CONFLICT DO NOTHING;

-- Kilosa District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Mabula'),
  ('Maguha'),
  ('Berega'),
  ('Magubike'),
  ('Mamboya'),
  ('Dumila'),
  ('Magole'),
  ('Msowero'),
  ('Kitete'),
  ('Mbigiri'),
  ('Mtumbatu'),
  ('Mvumi'),
  ('Rudewa'),
  ('Kimamba A'),
  ('Kimamba B'),
  ('Lumbiji'),
  ('Madoto'),
  ('Parakuyo')
) AS w(name) WHERE d.name = 'Kilosa District Council' ON CONFLICT DO NOTHING;

-- Morogoro District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Mkambalani'),
  ('Mikese'),
  ('Gwata'),
  ('Kidugalo'),
  ('Mkulazi'),
  ('Ngerengere'),
  ('Tununguo'),
  ('Matuli'),
  ('Kinole'),
  ('Kiroka'),
  ('Mkuyuni'),
  ('Tegetero'),
  ('Kibuko'),
  ('Tomondo'),
  ('Kibogwa'),
  ('Kibungo'),
  ('Kisemu'),
  ('Lundi'),
  ('Mtombozi'),
  ('Tawa'),
  ('Konde'),
  ('Kasanga'),
  ('Kolero'),
  ('Mvuha'),
  ('Selembala'),
  ('Bungu'),
  ('Bwakira Chini'),
  ('Bwakira Juu'),
  ('Kisaki'),
  ('Mngazi'),
  ('Singisa')
) AS w(name) WHERE d.name = 'Morogoro District Council' ON CONFLICT DO NOTHING;

-- Morogoro Municipal Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Sabasaba'),
  ('Uwanja Wa Taifa'),
  ('Kiwanja Cha Ndege'),
  ('Mji Mpya'),
  ('Kingo'),
  ('Mji Mkuu'),
  ('Sultan Area'),
  ('Mafiga'),
  ('Mazimbu'),
  ('Mwembesongo'),
  ('Kichangani'),
  ('Kilakala'),
  ('Boma'),
  ('Mlimani'),
  ('Mbuyuni'),
  ('Kingolwira'),
  ('Bigwa'),
  ('Mzinga'),
  ('Kihonda'),
  ('Kauzeni'),
  ('Luhungo'),
  ('Magadu'),
  ('Mindu'),
  ('Chamwino'),
  ('Lukobe'),
  ('Mkundi'),
  ('Kihonda Maghorofani'),
  ('Mafisa'),
  ('Tungi')
) AS w(name) WHERE d.name = 'Morogoro Municipal Council' ON CONFLICT DO NOTHING;

-- Mlimba District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Uchindile'),
  ('Masagati'),
  ('Utengule'),
  ('Kamwene'),
  ('Mlimba'),
  ('Kalengakelu'),
  ('Chisano'),
  ('Ching''Anda'),
  ('Chita'),
  ('Mngeta'),
  ('Mchombe'),
  ('Igima'),
  ('Mbingu'),
  ('Mofu'),
  ('Namwawala'),
  ('Idete')
) AS w(name) WHERE d.name = 'Mlimba District Council' ON CONFLICT DO NOTHING;

-- Ifakara Town Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Kidatu'),
  ('Msolwa Station'),
  ('Sanje'),
  ('Mkula'),
  ('Mang''Ula'),
  ('Mang''Ula ''B'''),
  ('Mwaya'),
  ('Kisawasawa'),
  ('Kiberege'),
  ('Signal'),
  ('Kibaoni'),
  ('Mbasa'),
  ('Katindiuka'),
  ('Michenga'),
  ('Lumemo'),
  ('Ifakara'),
  ('Lipangalala'),
  ('Mlabani'),
  ('Viwanjasitini')
) AS w(name) WHERE d.name = 'Ifakara Town Council' ON CONFLICT DO NOTHING;

-- Ulanga District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Ruaha'),
  ('Chilombola'),
  ('Sali'),
  ('Euga'),
  ('Mwaya'),
  ('Lukande'),
  ('Mbuga'),
  ('Ilonga'),
  ('Ketaketa'),
  ('Msogezi'),
  ('Vigoi'),
  ('Mahenge Mjini'),
  ('Isongo'),
  ('Uponera'),
  ('Mawasiliano'),
  ('Nawenge'),
  ('Minepa'),
  ('Lupiro'),
  ('Kichangani'),
  ('Iragua'),
  ('Milola')
) AS w(name) WHERE d.name = 'Ulanga District Council' ON CONFLICT DO NOTHING;

-- Malinyi District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Kilosa Mpepo'),
  ('Ngoheranga'),
  ('Biro'),
  ('Igawa'),
  ('Malinyi'),
  ('Sofi'),
  ('Usangule'),
  ('Mtimbira'),
  ('Itete'),
  ('Njiwa')
) AS w(name) WHERE d.name = 'Malinyi District Council' ON CONFLICT DO NOTHING;

-- Mvomero District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Bunduki'),
  ('Kikeo'),
  ('Langali'),
  ('Tchenzema'),
  ('Luale'),
  ('Mgeta'),
  ('Nyandira'),
  ('Mzumbe'),
  ('Mlali'),
  ('Doma'),
  ('Melela'),
  ('Homboza'),
  ('Lubungo'),
  ('Mangae'),
  ('Msongozi'),
  ('Mvomero'),
  ('Hembeti'),
  ('Maskati'),
  ('Kibati'),
  ('Dakawa'),
  ('Kinda'),
  ('Mkindo'),
  ('Pemba'),
  ('Sungaji'),
  ('Mhonda'),
  ('Diongoya'),
  ('Mtibwa'),
  ('Kanga'),
  ('Kweuma'),
  ('Mziha')
) AS w(name) WHERE d.name = 'Mvomero District Council' ON CONFLICT DO NOTHING;

-- Gairo District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Chakwale'),
  ('Iyogwe'),
  ('Idibo'),
  ('Kibedya'),
  ('Msingisi'),
  ('Gairo'),
  ('Rubeho'),
  ('Italagwe'),
  ('Chigela'),
  ('Leshata'),
  ('Madege'),
  ('Magoweko'),
  ('Mkalama'),
  ('Ukwamani'),
  ('Mandege'),
  ('Chagongwe'),
  ('Chanjale'),
  ('Nongwe')
) AS w(name) WHERE d.name = 'Gairo District Council' ON CONFLICT DO NOTHING;

-- Bagamoyo District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Makurunge'),
  ('Magomeni'),
  ('Kisutu'),
  ('Nianjema'),
  ('Dunda'),
  ('Fukayosi'),
  ('Yombo'),
  ('Kiromo'),
  ('Zinga'),
  ('Kerege')
) AS w(name) WHERE d.name = 'Bagamoyo District Council' ON CONFLICT DO NOTHING;

-- Chalinze District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Miono'),
  ('Mandera'),
  ('Kiwangwa'),
  ('Msata'),
  ('Kimange'),
  ('Mbwewe'),
  ('Kibindu'),
  ('Lugoba'),
  ('Msoga'),
  ('Talawanda'),
  ('Ubenazomozi'),
  ('Bwilingu'),
  ('Pera'),
  ('Vigwaza')
) AS w(name) WHERE d.name = 'Chalinze District Council' ON CONFLICT DO NOTHING;

-- Kibaha District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Gwata'),
  ('Dutumi'),
  ('Magindu'),
  ('Soga'),
  ('Ruvu'),
  ('Kwala'),
  ('Kikongo'),
  ('Mlandizi'),
  ('Kilangalanga'),
  ('Janga'),
  ('Bokomnemela'),
  ('Mtambani'),
  ('Mtongani'),
  ('Kawawa')
) AS w(name) WHERE d.name = 'Kibaha District Council' ON CONFLICT DO NOTHING;

-- Kibaha Town Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Pangani'),
  ('Mailimoja'),
  ('Tumbi'),
  ('Picha Ya Ndege'),
  ('Mkuza'),
  ('Kibaha'),
  ('Msangani'),
  ('Tangini'),
  ('Sofu'),
  ('Kongowe'),
  ('Misugusugu'),
  ('Visiga'),
  ('Mbwawa'),
  ('Viziwaziwa')
) AS w(name) WHERE d.name = 'Kibaha Town Council' ON CONFLICT DO NOTHING;

-- Kisarawe District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Mafizi'),
  ('Kurui'),
  ('Mzenga'),
  ('Vihingo'),
  ('Kisarawe'),
  ('Msimbu'),
  ('Masaki'),
  ('Kibuta'),
  ('Kiluvya'),
  ('Kazimzumbwi'),
  ('Marumbo'),
  ('Maneromango'),
  ('Msanga'),
  ('Boga'),
  ('Marui'),
  ('Chole'),
  ('Vikumburu')
) AS w(name) WHERE d.name = 'Kisarawe District Council' ON CONFLICT DO NOTHING;

-- Mkuranga District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Mkuranga'),
  ('Tambani'),
  ('Vikindu'),
  ('Vianzi'),
  ('Kiparang''Anda'),
  ('Mwandege'),
  ('Mipeko'),
  ('Tengelea'),
  ('Nyamato')
) AS w(name) WHERE d.name = 'Mkuranga District Council' ON CONFLICT DO NOTHING;

-- Rufiji District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Utete'),
  ('Mkongo'),
  ('Ngorongo'),
  ('Mwaseni'),
  ('Kipugira'),
  ('Chemchem'),
  ('Ngarambe'),
  ('Ikwiriri'),
  ('Mgomba'),
  ('Umwe'),
  ('Mohoro'),
  ('Chumbi'),
  ('Mbwara')
) AS w(name) WHERE d.name = 'Rufiji District Council' ON CONFLICT DO NOTHING;

-- Mafia District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Kanga'),
  ('Kirongwe'),
  ('Baleni'),
  ('Ndagoni'),
  ('Kilindoni'),
  ('Miburani'),
  ('Kiegeani'),
  ('Jibondo')
) AS w(name) WHERE d.name = 'Mafia District Council' ON CONFLICT DO NOTHING;

-- Kibiti District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Dimani'),
  ('Kibiti'),
  ('Mtawanya'),
  ('Bungu'),
  ('Mjawa'),
  ('Mwambao'),
  ('Mahege'),
  ('Mchukwi'),
  ('Mlanzi'),
  ('Salale'),
  ('Mtunda'),
  ('Ruaruke'),
  ('Msala'),
  ('Mbuchi'),
  ('Kiongoroni')
) AS w(name) WHERE d.name = 'Kibiti District Council' ON CONFLICT DO NOTHING;

-- Kinondoni Municipal Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Kigogo'),
  ('Mzimuni'),
  ('Magomeni'),
  ('Ndugumbi'),
  ('Tandale'),
  ('Kijitonyama'),
  ('Kinondoni'),
  ('Hananasif'),
  ('Mwananyamala'),
  ('Makumbusho'),
  ('Makongo'),
  ('Mbezi Juu'),
  ('Wazo'),
  ('Mabwepande'),
  ('Bunju'),
  ('Mbweni'),
  ('Kunduchi'),
  ('Kawe'),
  ('Mikocheni'),
  ('Msasani')
) AS w(name) WHERE d.name = 'Kinondoni Municipal Council' ON CONFLICT DO NOTHING;

-- Dar Es Salaam City Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Kariakoo'),
  ('Jangwani'),
  ('Gerezani'),
  ('Kisutu'),
  ('Mchafukoge'),
  ('Upanga Mashariki'),
  ('Upanga Magharibi'),
  ('Kivukoni'),
  ('Ilala'),
  ('Mchikichini'),
  ('Vingunguti'),
  ('Kipawa'),
  ('Buguruni'),
  ('Kiwalani'),
  ('Mnyamani'),
  ('Minazi Mirefu'),
  ('Tabata'),
  ('Kinyerezi'),
  ('Segerea'),
  ('Kimanga'),
  ('Liwiti'),
  ('Bonyokwa'),
  ('Kisukuru'),
  ('Ukonga'),
  ('Pugu'),
  ('Msongola'),
  ('Kitunda'),
  ('Chanika'),
  ('Kivule'),
  ('Gongolamboto'),
  ('Majohe'),
  ('Zingiziwa'),
  ('Buyuni'),
  ('Pugu Station'),
  ('Mzinga'),
  ('Kipunguni')
) AS w(name) WHERE d.name = 'Dar Es Salaam City Council' ON CONFLICT DO NOTHING;

-- Temeke Municipal Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Miburani'),
  ('Azimio'),
  ('Tandika'),
  ('Sandali'),
  ('Temeke'),
  ('Chang''Ombe'),
  ('Keko'),
  ('Kurasini'),
  ('Mtoni'),
  ('Buza'),
  ('Makangarawe'),
  ('Yombo Vituka'),
  ('Kilakala'),
  ('Kijichi'),
  ('Mbagala Kuu'),
  ('Toangoma'),
  ('Mianzini'),
  ('Kibondemaji'),
  ('Chamazi'),
  ('Kilungule'),
  ('Charambe'),
  ('Mbagala'),
  ('Kiburugwa')
) AS w(name) WHERE d.name = 'Temeke Municipal Council' ON CONFLICT DO NOTHING;

-- Kigamboni Municipal Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Kigamboni'),
  ('Tungi'),
  ('Mjimwema'),
  ('Kibada'),
  ('Vijibweni'),
  ('Kimbiji'),
  ('Pembamnazi'),
  ('Somangila'),
  ('Kisarawe Ii')
) AS w(name) WHERE d.name = 'Kigamboni Municipal Council' ON CONFLICT DO NOTHING;

-- Ubungo Municipal Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Ubungo'),
  ('Sinza'),
  ('Manzese'),
  ('Makurumla'),
  ('Mburahati'),
  ('Mabibo'),
  ('Makuburi'),
  ('Kimara'),
  ('Saranga'),
  ('Msigani'),
  ('Kwembe'),
  ('Kibamba'),
  ('Mbezi'),
  ('Goba')
) AS w(name) WHERE d.name = 'Ubungo Municipal Council' ON CONFLICT DO NOTHING;

-- Kilwa District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Kikole'),
  ('Kivinje'),
  ('Songosongo'),
  ('Masoko'),
  ('Kiranjeranje'),
  ('Mandawa'),
  ('Lihimalyao'),
  ('Pande'),
  ('Likawage'),
  ('Nanjirinji'),
  ('Chumo'),
  ('Kipatimu'),
  ('Kandawale'),
  ('Kibata'),
  ('Namayuni'),
  ('Tingi'),
  ('Miteja'),
  ('Mingumbi'),
  ('Kinjumbi'),
  ('Somanga'),
  ('Njinjo'),
  ('Mitole'),
  ('Miguruwe')
) AS w(name) WHERE d.name = 'Kilwa District Council' ON CONFLICT DO NOTHING;

-- Mtama District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Pangatena'),
  ('Navanga'),
  ('Sudi'),
  ('Nachunyu'),
  ('Kiwalala'),
  ('Mnolela'),
  ('Nahukahuka'),
  ('Nyangamara'),
  ('Mandwanga'),
  ('Longa'),
  ('Mtumbya'),
  ('Majengo'),
  ('Namangale'),
  ('Mtama'),
  ('Nyangao'),
  ('Namupa'),
  ('Nyengedi'),
  ('Mtua'),
  ('Mnara'),
  ('Chiponda')
) AS w(name) WHERE d.name = 'Mtama District Council' ON CONFLICT DO NOTHING;

-- Lindi Municipal Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Ndoro'),
  ('Makonde'),
  ('Mikumbi'),
  ('Mitandi'),
  ('Rahaleo'),
  ('Mwenge'),
  ('Matopeni'),
  ('Wailes'),
  ('Nachingwea'),
  ('Rasbura'),
  ('Mtanda'),
  ('Jamhuri'),
  ('Msinjahili'),
  ('Chikonji'),
  ('Mbanja'),
  ('Kitumbikwela'),
  ('Mingoyo'),
  ('Mnazimmoja'),
  ('Ng''Apa'),
  ('Tandangongoro'),
  ('Rutamba'),
  ('Milola'),
  ('Kiwawa'),
  ('Nangaru'),
  ('Matimba'),
  ('Mipingo'),
  ('Kitomanga'),
  ('Kilangala'),
  ('Mvuleni'),
  ('Kilolambwani'),
  ('Mchinga')
) AS w(name) WHERE d.name = 'Lindi Municipal Council' ON CONFLICT DO NOTHING;

-- Nachingwea District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Kilimarondo'),
  ('Mbondo'),
  ('Kiegei'),
  ('Matekwe'),
  ('Lionja'),
  ('Namikango'),
  ('Nditi'),
  ('Ngunichile'),
  ('Ruponda'),
  ('Mnero Miembeni'),
  ('Kipara Mnero'),
  ('Mkoka'),
  ('Chiola'),
  ('Mnero Ngongo'),
  ('Marambo'),
  ('Nambambo'),
  ('Kilimanihewa'),
  ('Nangowe'),
  ('Stesheni'),
  ('Namatula'),
  ('Mitumbati'),
  ('Ugawaji'),
  ('Boma'),
  ('Nachingwea Mjini'),
  ('Mpiruka'),
  ('Mkotokuyana'),
  ('Naipanga'),
  ('Naipingo'),
  ('Mtua'),
  ('Ndomoni'),
  ('Kipara Mtua'),
  ('Nang''Ondo'),
  ('Mchonda'),
  ('Chiumbati Shuleni'),
  ('Raha Leo')
) AS w(name) WHERE d.name = 'Nachingwea District Council' ON CONFLICT DO NOTHING;

-- Liwale District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Mlembwe'),
  ('Makata'),
  ('Barikiwa'),
  ('Mkutano'),
  ('Liwale Mjini'),
  ('Mihumo'),
  ('Ngongowele'),
  ('Mbaya'),
  ('Kimambi'),
  ('Mpigamiti'),
  ('Mangirikiti'),
  ('Nangando'),
  ('Likongowele'),
  ('Kichonda'),
  ('Lilombe'),
  ('Kiangara'),
  ('Kibutuka'),
  ('Nangano'),
  ('Mirui'),
  ('Liwale ''B''')
) AS w(name) WHERE d.name = 'Liwale District Council' ON CONFLICT DO NOTHING;

-- Ruangwa District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Mandawa'),
  ('Nambilanje'),
  ('Chibula'),
  ('Ruangwa'),
  ('Mbekenyera'),
  ('Namichiga'),
  ('Narungombe'),
  ('Makanjiro'),
  ('Likunja'),
  ('Chunyu'),
  ('Mandarawe'),
  ('Nachingwea'),
  ('Matambarale'),
  ('Nkowe'),
  ('Malolo'),
  ('Luchelegwa'),
  ('Chienjele'),
  ('Mnacho'),
  ('Nandagala'),
  ('Nanganga'),
  ('Chinongwe')
) AS w(name) WHERE d.name = 'Ruangwa District Council' ON CONFLICT DO NOTHING;

-- Mtwara District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Mahurunga'),
  ('Tangazo'),
  ('Madimba'),
  ('Ziwani'),
  ('Nanguruwe'),
  ('Mbawala'),
  ('Msanga Mkuu'),
  ('Msimbati'),
  ('Nalingu'),
  ('Moma'),
  ('Dihimba'),
  ('Muungano'),
  ('Lipwidi'),
  ('Mangopachanne'),
  ('Kitere'),
  ('Ndumbwe'),
  ('Mayanga'),
  ('Naumbu'),
  ('Libobe'),
  ('Mpapura'),
  ('Mkunwa')
) AS w(name) WHERE d.name = 'Mtwara District Council' ON CONFLICT DO NOTHING;

-- Nanyamba Town Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Mnima'),
  ('Kitaya'),
  ('Kiromba'),
  ('Chawi'),
  ('Kiyanga'),
  ('Njengwa'),
  ('Nitekela'),
  ('Nanyamba'),
  ('Mtiniko'),
  ('Namtumbuka'),
  ('Milangominne'),
  ('Mbembaleo'),
  ('Mtimbwilimbwi'),
  ('Dinyecha'),
  ('Nyundo'),
  ('Mnongodi'),
  ('Hinju')
) AS w(name) WHERE d.name = 'Nanyamba Town Council' ON CONFLICT DO NOTHING;

-- Mtwara Municipal Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Majengo'),
  ('Chikongola'),
  ('Likombe'),
  ('Reli'),
  ('Shangani'),
  ('Vigaeni'),
  ('Chuno'),
  ('Ufukoni'),
  ('Rahaleo'),
  ('Naliendele'),
  ('Magomeni'),
  ('Mtawanya'),
  ('Tandika'),
  ('Jangwani'),
  ('Kisungule'),
  ('Mitengo'),
  ('Mtonya'),
  ('Magengeni')
) AS w(name) WHERE d.name = 'Mtwara Municipal Council' ON CONFLICT DO NOTHING;

-- Newala District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Mikumbi'),
  ('Chihangu'),
  ('Nambali'),
  ('Mnyambe'),
  ('Chilangala'),
  ('Mkoma Ii'),
  ('Nandwahi'),
  ('Mnyeu'),
  ('Kitangari'),
  ('Chiwonga'),
  ('Muungano'),
  ('Mpwapwa'),
  ('Malatu'),
  ('Mchemo'),
  ('Mtopwa'),
  ('Chitekete'),
  ('Makukwe'),
  ('Mkwedu'),
  ('Mtunguru'),
  ('Mdimba Mpelepele'),
  ('Nakahako')
) AS w(name) WHERE d.name = 'Newala District Council' ON CONFLICT DO NOTHING;

-- Newala Town Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Luchingu'),
  ('Makote'),
  ('Mtonya'),
  ('Namiyonga'),
  ('Mnekachi'),
  ('Mahumbika'),
  ('Tulindane'),
  ('Julia'),
  ('Nangwala'),
  ('Makonga'),
  ('Mkulung''Ulu'),
  ('Nanguruwe'),
  ('Mkunya'),
  ('Mcholi I'),
  ('Mcholi Ii'),
  ('Mtumachi')
) AS w(name) WHERE d.name = 'Newala Town Council' ON CONFLICT DO NOTHING;

-- Masasi District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Chigugu'),
  ('Mwena'),
  ('Nanganga'),
  ('Chiwata'),
  ('Mpindimbi'),
  ('Chikukwe'),
  ('Nangoo'),
  ('Chikundi'),
  ('Ndanda'),
  ('Namatutwe'),
  ('Namajani'),
  ('Mlingula'),
  ('Chiwale'),
  ('Lukuledi'),
  ('Mpanyani'),
  ('Msikisi'),
  ('Chikunja'),
  ('Mkululu'),
  ('Lulindi'),
  ('Namwanga'),
  ('Mitesa'),
  ('Sindano'),
  ('Mchauru'),
  ('Mnavira'),
  ('Chikoropola'),
  ('Nanjota'),
  ('Chiungutwa'),
  ('Mbuyuni'),
  ('Lipumburu'),
  ('Mpeta'),
  ('Lupaso'),
  ('Mijelejele')
) AS w(name) WHERE d.name = 'Masasi District Council' ON CONFLICT DO NOTHING;

-- Masasi Town Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Mwenge Mtapika'),
  ('Temeke'),
  ('Mkuti'),
  ('Nyasa'),
  ('Marika'),
  ('Mkomaindo'),
  ('Mtandi'),
  ('Jida'),
  ('Migongo'),
  ('Sululu'),
  ('Chanikanguo'),
  ('Napupa'),
  ('Mumbaka'),
  ('Matawale')
) AS w(name) WHERE d.name = 'Masasi Town Council' ON CONFLICT DO NOTHING;

-- Tandahimba District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Kitama 1'),
  ('Michenjele'),
  ('Mihambwe'),
  ('Mkoreha'),
  ('Miuta'),
  ('Tandahimba'),
  ('Naputa'),
  ('Namikupa'),
  ('Nambahu'),
  ('Malopokelo'),
  ('Maundo'),
  ('Mnyawa'),
  ('Lukokoda'),
  ('Kwanyama'),
  ('Mchichira'),
  ('Mkundi'),
  ('Mahuta'),
  ('Nanhyanga'),
  ('Chingungwe'),
  ('Chikongola'),
  ('Dinduma'),
  ('Mdimba Mnyoma'),
  ('Milongodi'),
  ('Lyenje'),
  ('Chaume'),
  ('Mkonjowano'),
  ('Mndumbwe'),
  ('Mkwedu'),
  ('Luagala'),
  ('Litehu'),
  ('Ngunja'),
  ('Mkwiti')
) AS w(name) WHERE d.name = 'Tandahimba District Council' ON CONFLICT DO NOTHING;

-- Nanyumbu District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Lumesule'),
  ('Likokona'),
  ('Napacho'),
  ('Michiga'),
  ('Mangaka'),
  ('Nangomba'),
  ('Sengenya'),
  ('Chipuputa'),
  ('Kilimanihewa'),
  ('Mnanje'),
  ('Mikangaula'),
  ('Maratani'),
  ('Nandete'),
  ('Kamundi'),
  ('Mkonona'),
  ('Nanyumbu'),
  ('Masuguru')
) AS w(name) WHERE d.name = 'Nanyumbu District Council' ON CONFLICT DO NOTHING;

-- Tunduru District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Kalulu'),
  ('Ligunga'),
  ('Matemanga'),
  ('Namwinyu'),
  ('Jakika'),
  ('Mindu'),
  ('Ngapa'),
  ('Nakapanya'),
  ('Muhuwesi'),
  ('Namiungo'),
  ('Majimaji'),
  ('Namakambale'),
  ('Tinginya'),
  ('Mlingoti Mashariki'),
  ('Mlingoti Magharibi'),
  ('Masonya'),
  ('Sisi Kwa Sisi'),
  ('Mchangani'),
  ('Majengo'),
  ('Nanjoka'),
  ('Nakayaya'),
  ('Kidodoma'),
  ('Nandembo'),
  ('Nampungu'),
  ('Tuwemacho'),
  ('Ligoma'),
  ('Misechela'),
  ('Namasakata'),
  ('Mchuluka'),
  ('Mtina'),
  ('Mchesi'),
  ('Lukumbule'),
  ('Nalasi Magharibi'),
  ('Mchoteka'),
  ('Marumba'),
  ('Mbesa'),
  ('Mbati'),
  ('Nalasi Mashariki'),
  ('Chiwana')
) AS w(name) WHERE d.name = 'Tunduru District Council' ON CONFLICT DO NOTHING;

-- Songea District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Liganga'),
  ('Kilagano'),
  ('Mpandangindo'),
  ('Parangu'),
  ('Peramiho'),
  ('Litisha'),
  ('Litapwasi'),
  ('Mpitimbi'),
  ('Matimira'),
  ('Ndongosi'),
  ('Lilahi'),
  ('Muhukuru'),
  ('Kizuka'),
  ('Mbinga Mhalule')
) AS w(name) WHERE d.name = 'Songea District Council' ON CONFLICT DO NOTHING;

-- Songea Municipal Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Mjini'),
  ('Bombambili'),
  ('Matogoro'),
  ('Mshangano'),
  ('Mletele'),
  ('Seedfarm'),
  ('Tanga'),
  ('Msamala'),
  ('Ndilimalitembo'),
  ('Majengo'),
  ('Misufini'),
  ('Mfaranyaki'),
  ('Lizaboni'),
  ('Matarawe'),
  ('Ruvuma'),
  ('Subira'),
  ('Ruhuwiko'),
  ('Lilambo'),
  ('Mwengemshindo'),
  ('Mjimwema'),
  ('Mateka')
) AS w(name) WHERE d.name = 'Songea Municipal Council' ON CONFLICT DO NOTHING;

-- Madaba District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Lituta'),
  ('Mahanje'),
  ('Matetereka'),
  ('Wino'),
  ('Matumbi'),
  ('Mkongotema'),
  ('Gumbiro'),
  ('Mtyangimbole')
) AS w(name) WHERE d.name = 'Madaba District Council' ON CONFLICT DO NOTHING;

-- Mbinga District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Kigonsera'),
  ('Kihangi Mahuka'),
  ('Lukarasi'),
  ('Amani Makoro'),
  ('Mhongozi'),
  ('Kitumbalomo'),
  ('Mkako'),
  ('Matiri'),
  ('Kitura'),
  ('Mpapa'),
  ('Nyoni'),
  ('Mbuji'),
  ('Litembo'),
  ('Kambarage'),
  ('Kipapa'),
  ('Maguu'),
  ('Mikalanga'),
  ('Langiro'),
  ('Ruanda'),
  ('Litumbandyosi'),
  ('Namswea'),
  ('Muungano'),
  ('Wukiro'),
  ('Kipololo'),
  ('Ngima'),
  ('Mkumbi'),
  ('Linda'),
  ('Ukata')
) AS w(name) WHERE d.name = 'Mbinga District Council' ON CONFLICT DO NOTHING;

-- Mbinga Town Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Luwaita'),
  ('Myangayanga'),
  ('Kitanda'),
  ('Mpepai'),
  ('Utiri'),
  ('Mbinga Mjini'),
  ('Kilimani'),
  ('Mbangamao'),
  ('Kihungu'),
  ('Kikolo'),
  ('Mateka'),
  ('Mbambi'),
  ('Matarawe'),
  ('Bethrehemu'),
  ('Luhuwiko'),
  ('Lusonga'),
  ('Masumuni'),
  ('Mbinga Mjini B'),
  ('Kagugu')
) AS w(name) WHERE d.name = 'Mbinga Town Council' ON CONFLICT DO NOTHING;

-- Nyasa District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Chiwanda'),
  ('Mtipwili'),
  ('Kilosa'),
  ('Lipingo'),
  ('Liuli'),
  ('Kihagara'),
  ('Liparamba'),
  ('Tingi'),
  ('Kingerikiti'),
  ('Luhangarasi'),
  ('Mpepo'),
  ('Mipotopoto'),
  ('Upolo'),
  ('Lumeme'),
  ('Ngumbo'),
  ('Liwundi'),
  ('Mbaha'),
  ('Lituhi'),
  ('Linga')
) AS w(name) WHERE d.name = 'Nyasa District Council' ON CONFLICT DO NOTHING;

-- Namtumbo District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Lusewa'),
  ('Magazini'),
  ('Msisima'),
  ('Mkongo'),
  ('Ligera'),
  ('Msindo'),
  ('Luchili'),
  ('Namabengo'),
  ('Hanga'),
  ('Limamu'),
  ('Mkongo Gulioni'),
  ('Lisimonji'),
  ('Rwinga'),
  ('Kitanda'),
  ('Luegu'),
  ('Namtumbo'),
  ('Mgombasi'),
  ('Litola'),
  ('Likuyuseka'),
  ('Mputa'),
  ('Mchomoro')
) AS w(name) WHERE d.name = 'Namtumbo District Council' ON CONFLICT DO NOTHING;

-- Iringa District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Ifunda'),
  ('Lumuli'),
  ('Maboga'),
  ('Wasa'),
  ('Kihanga'),
  ('Kalenga'),
  ('Kiwere'),
  ('Nzihi'),
  ('Ulanda'),
  ('Mseke'),
  ('Magulilwa'),
  ('Mgama'),
  ('Luhota'),
  ('Lyamgungwe'),
  ('Masaka'),
  ('Kihorogota'),
  ('Izazi'),
  ('Nyang''Oro'),
  ('Mahuninga'),
  ('Idodi'),
  ('Mlowa'),
  ('Ilolompya'),
  ('Mlenge'),
  ('Mboliboli')
) AS w(name) WHERE d.name = 'Iringa District Council' ON CONFLICT DO NOTHING;

-- Iringa Municipal Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Kihesa'),
  ('Mtwivila'),
  ('Gangilonga'),
  ('Kitanzini'),
  ('Ruaha'),
  ('Mshindo'),
  ('Mivinjeni'),
  ('Mlandege'),
  ('Mwangata'),
  ('Kwakilosa'),
  ('Makorongoni'),
  ('Ilala'),
  ('Mkwawa'),
  ('Kitwiru'),
  ('Isakalilo'),
  ('Nduli'),
  ('Mkimbizi'),
  ('Igumbilo')
) AS w(name) WHERE d.name = 'Iringa Municipal Council' ON CONFLICT DO NOTHING;

-- Mafinga Town Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Sao Hill'),
  ('Changarawe'),
  ('Boma'),
  ('Rungemba'),
  ('Kinyanambo'),
  ('Upendo'),
  ('Wambi'),
  ('Isalavanu'),
  ('Bumilayinga')
) AS w(name) WHERE d.name = 'Mafinga Town Council' ON CONFLICT DO NOTHING;

-- Mufindi District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Ikweha'),
  ('Sadani'),
  ('Igombavanu'),
  ('Ihalimba'),
  ('Kibengu'),
  ('Ikongosi'),
  ('Ifwagi'),
  ('Mdabulo'),
  ('Ihanu'),
  ('Luhunga'),
  ('Mpanga Tazara'),
  ('Mtwango'),
  ('Kiyowela'),
  ('Makungu'),
  ('Mninga'),
  ('Kasanga'),
  ('Igowole'),
  ('Mtambula'),
  ('Itandula'),
  ('Idete'),
  ('Mbalamaziwa'),
  ('Idunda'),
  ('Malangali'),
  ('Nyololo'),
  ('Ihowanza'),
  ('Maduma')
) AS w(name) WHERE d.name = 'Mufindi District Council' ON CONFLICT DO NOTHING;

-- Kilolo District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Image'),
  ('Irole'),
  ('Ilula'),
  ('Uhambingeto'),
  ('Lugalo'),
  ('Nyalumbu'),
  ('Mlafu'),
  ('Ibumu'),
  ('Udekwa'),
  ('Mahenge'),
  ('Ruaha Mbuyuni'),
  ('Nyanzwa'),
  ('Mtitu'),
  ('Dabaga'),
  ('Ukumbi'),
  ('Ukwega'),
  ('Boma La Ng''Ombe'),
  ('Idete'),
  ('Masisiwe'),
  ('Ng''Uruhe'),
  ('Ng''Ang''Ange'),
  ('Ihimbo'),
  ('Kimala'),
  ('Kising''A')
) AS w(name) WHERE d.name = 'Kilolo District Council' ON CONFLICT DO NOTHING;

-- Chunya District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Sangambi'),
  ('Itewe'),
  ('Chokaa'),
  ('Mbugani'),
  ('Chalangwa'),
  ('Ifumbo'),
  ('Matundasi'),
  ('Makongolosi'),
  ('Bwawani'),
  ('Mkola'),
  ('Kasanga'),
  ('Kambikatoto'),
  ('Mafyeko'),
  ('Matwiga'),
  ('Mtanila'),
  ('Lupa'),
  ('Lualaje'),
  ('Upendo'),
  ('Mamba'),
  ('Nkung''Ungu')
) AS w(name) WHERE d.name = 'Chunya District Council' ON CONFLICT DO NOTHING;

-- Mbeya District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Santilya'),
  ('Ilembo'),
  ('Iwiji'),
  ('Isuto'),
  ('Masoko'),
  ('Itawa'),
  ('Shizuvi'),
  ('Izyra'),
  ('Igale'),
  ('Iwindi'),
  ('Utengule/Usongwe'),
  ('Mshewe'),
  ('Ikukwa'),
  ('Bonde La Songwe'),
  ('Swaya'),
  ('Nsalala'),
  ('Mjele'),
  ('Ihango'),
  ('Ulenje'),
  ('Tembela'),
  ('Ijombe'),
  ('Inyala'),
  ('Ilungu'),
  ('Maendeleo'),
  ('Lwanjilo'),
  ('Itewe'),
  ('Igoma')
) AS w(name) WHERE d.name = 'Mbeya District Council' ON CONFLICT DO NOTHING;

-- Mbeya City Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Itezi'),
  ('Igawilo'),
  ('Iganjo'),
  ('Uyole'),
  ('Iduda'),
  ('Mwasanga'),
  ('Tembela'),
  ('Ilomba'),
  ('Mwakibete'),
  ('Ruanda'),
  ('Iyela'),
  ('Sinde'),
  ('Maanga'),
  ('Mbalizi Road'),
  ('Forest'),
  ('Mabatini'),
  ('Nzovwe'),
  ('Kalobe'),
  ('Iyunga'),
  ('Iwambi'),
  ('Sisimba'),
  ('Isanga'),
  ('Iganzo'),
  ('Mwasenkwa'),
  ('Itagano'),
  ('Ilemi'),
  ('Isyesye'),
  ('Itende'),
  ('Iziwa'),
  ('Nsoho'),
  ('Majengo'),
  ('Ghana'),
  ('Nonde'),
  ('Itiji'),
  ('Maendeleo')
) AS w(name) WHERE d.name = 'Mbeya City Council' ON CONFLICT DO NOTHING;

-- Kyela District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Lusungo'),
  ('Makwale'),
  ('Matema'),
  ('Mwaya'),
  ('Ndobo'),
  ('Ipande'),
  ('Ikama'),
  ('Ipinda'),
  ('Muungano'),
  ('Talatala'),
  ('Mababu'),
  ('Nkokwa'),
  ('Kajunjumele'),
  ('Bujonde'),
  ('Ikolo'),
  ('Katumbasongwe'),
  ('Ngana'),
  ('Busale'),
  ('Ngonga'),
  ('Ikimba'),
  ('Itope'),
  ('Kyela'),
  ('Mikoroshoni'),
  ('Mbugani'),
  ('Mwanganyanga'),
  ('Serengeti'),
  ('Itunge'),
  ('Nkuyu'),
  ('Ndandalo'),
  ('Ipyana'),
  ('Bondeni'),
  ('Ibanda'),
  ('Njisi')
) AS w(name) WHERE d.name = 'Kyela District Council' ON CONFLICT DO NOTHING;

-- Rungwe District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Ibighi'),
  ('Bagamoyo'),
  ('Kawetele'),
  ('Bulyaga'),
  ('Msasani'),
  ('Makandana'),
  ('Itagata'),
  ('Masoko'),
  ('Kisiba'),
  ('Bujela'),
  ('Masukulu'),
  ('Ilima'),
  ('Kisondela'),
  ('Mpuguso'),
  ('Matwebe'),
  ('Swaya'),
  ('Isongole'),
  ('Masebe'),
  ('Suma'),
  ('Malindo'),
  ('Ikuti'),
  ('Nkunga'),
  ('Kinyala'),
  ('Kiwira'),
  ('Kyimo'),
  ('Lufingo'),
  ('Iponjola'),
  ('Lupepo'),
  ('Ndanto')
) AS w(name) WHERE d.name = 'Rungwe District Council' ON CONFLICT DO NOTHING;

-- Busokelo District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Kandete'),
  ('Luteba'),
  ('Isange'),
  ('Lwangwa'),
  ('Lufilyo'),
  ('Itete'),
  ('Kisegese'),
  ('Ntaba'),
  ('Kambasegela'),
  ('Lupata'),
  ('Mpata'),
  ('Kabula'),
  ('Mpombo')
) AS w(name) WHERE d.name = 'Busokelo District Council' ON CONFLICT DO NOTHING;

-- Mbarali District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Madibira'),
  ('Mawindi'),
  ('Ubaruku'),
  ('Imalilo Songwe'),
  ('Igava'),
  ('Ipwani'),
  ('Miyombweni'),
  ('Rujewa'),
  ('Lugelele'),
  ('Luhanga'),
  ('Ihahi'),
  ('Chimala'),
  ('Utengule Usangu'),
  ('Ruiwa'),
  ('Mahongole'),
  ('Igurusi'),
  ('Kongolo'),
  ('Mwatenga'),
  ('Itamboleo')
) AS w(name) WHERE d.name = 'Mbarali District Council' ON CONFLICT DO NOTHING;

-- Iramba District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Tulya'),
  ('Kidaru'),
  ('Kisiriri'),
  ('Kiomboi'),
  ('Old-Kiomboi'),
  ('Urughu'),
  ('Mtekente'),
  ('Ndago'),
  ('Mbelekese'),
  ('Kaselya'),
  ('Ndulungu'),
  ('Kinampanda'),
  ('Ulemo'),
  ('Kyengege'),
  ('Maluga'),
  ('Mukulu'),
  ('Mtoa'),
  ('Mgongo'),
  ('Shelui'),
  ('Ntwike')
) AS w(name) WHERE d.name = 'Iramba District Council' ON CONFLICT DO NOTHING;

-- Singida District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Mudida'),
  ('Makuro'),
  ('Kijota'),
  ('Mtinko'),
  ('Ughandi'),
  ('Msisi'),
  ('Ikhanoda'),
  ('Mwasauya'),
  ('Msange'),
  ('Maghojoa'),
  ('Mughamo'),
  ('Kinyagigi'),
  ('Merya'),
  ('Kinyeto'),
  ('Ntonge'),
  ('Ilongero'),
  ('Mrama'),
  ('Itaja'),
  ('Ngimu'),
  ('Mughunga'),
  ('Mgori')
) AS w(name) WHERE d.name = 'Singida District Council' ON CONFLICT DO NOTHING;

-- Singida Municipal Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Mughanga'),
  ('Mitunduruni'),
  ('Mtamaa'),
  ('Utemini'),
  ('Mwankoko'),
  ('Mandewa'),
  ('Minga'),
  ('Uhamaka'),
  ('Unyianga'),
  ('Mtipa'),
  ('Majengo'),
  ('Unyambwa'),
  ('Mungumaji'),
  ('Unyamikumbi'),
  ('Kindai'),
  ('Ipembe'),
  ('Misuna'),
  ('Kisaki')
) AS w(name) WHERE d.name = 'Singida Municipal Council' ON CONFLICT DO NOTHING;

-- Manyoni District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Manyoni'),
  ('Mkwese'),
  ('Muhalala'),
  ('Makuru'),
  ('Saranda'),
  ('Majiri'),
  ('Sasajila'),
  ('Solya'),
  ('Makutupora'),
  ('Makanda'),
  ('Kintinku'),
  ('Maweni'),
  ('Chikuyu'),
  ('Sanza'),
  ('Isseke'),
  ('Nkonko'),
  ('Sasilo'),
  ('Heka'),
  ('Chikola')
) AS w(name) WHERE d.name = 'Manyoni District Council' ON CONFLICT DO NOTHING;

-- Itigi District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Itigi Mjini'),
  ('Itigi Majengo'),
  ('Tambukareli'),
  ('Sanjaranda'),
  ('Aghondi'),
  ('Idodyandole'),
  ('Ipande'),
  ('Kitaraka'),
  ('Mgandu'),
  ('Mitundu'),
  ('Kalangali'),
  ('Mwamagembe'),
  ('Rungwa')
) AS w(name) WHERE d.name = 'Itigi District Council' ON CONFLICT DO NOTHING;

-- Ikungi District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Iyumbu'),
  ('Mgungira'),
  ('Mwaru'),
  ('Ighombwe'),
  ('Mtunduru'),
  ('Sepuka'),
  ('Irisya'),
  ('Puma'),
  ('Kituntu'),
  ('Iglansoni'),
  ('Isseke'),
  ('Ihanja'),
  ('Minyughe'),
  ('Muhintiri'),
  ('Makilawa'),
  ('Dung''Unyi'),
  ('Mang''Onyi'),
  ('Mkiwa'),
  ('Issuna'),
  ('Unyahati'),
  ('Ikungi'),
  ('Mungaa'),
  ('Siuyu'),
  ('Kikio'),
  ('Lighwa'),
  ('Misughaa'),
  ('Ntuntu'),
  ('Makiungu')
) AS w(name) WHERE d.name = 'Ikungi District Council' ON CONFLICT DO NOTHING;

-- Mkalama District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Mpambala'),
  ('Mwangeza'),
  ('Nkinto'),
  ('Ibaga'),
  ('Matongo'),
  ('Mwanga'),
  ('Gumanga'),
  ('Nduguti'),
  ('Ilunda'),
  ('Miganga'),
  ('Nkalakala'),
  ('Kinampundu'),
  ('Msingi'),
  ('Kinyangiri'),
  ('Iguguno'),
  ('Kikhonda'),
  ('Tumuli')
) AS w(name) WHERE d.name = 'Mkalama District Council' ON CONFLICT DO NOTHING;

-- Nzega Town Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Mbogwe'),
  ('Miguwa'),
  ('Itilo'),
  ('Ijanija'),
  ('Nzega Ndogo'),
  ('Nzega Mjini Mashariki'),
  ('Nzega Mjini Magharibi'),
  ('Uchama'),
  ('Mwanzoli'),
  ('Kitangili')
) AS w(name) WHERE d.name = 'Nzega Town Council' ON CONFLICT DO NOTHING;

-- Nzega District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Bukene'),
  ('Mogwa'),
  ('Mambali'),
  ('Kahamanhalanga'),
  ('Semembela'),
  ('Isagenhe'),
  ('Ikindwa'),
  ('Uduka'),
  ('Mbutu'),
  ('Nata'),
  ('Mwangoye'),
  ('Mwamala'),
  ('Igusule'),
  ('Shigamba'),
  ('Kasela'),
  ('Karitu'),
  ('Itobo'),
  ('Sigili'),
  ('Wela'),
  ('Muhugi'),
  ('Utwigu'),
  ('Lusu'),
  ('Isanzu'),
  ('Mwasala'),
  ('Mwantundu'),
  ('Puge'),
  ('Nkiniziwa'),
  ('Budushi'),
  ('Mwakashanhala'),
  ('Tongi'),
  ('Mizibaziba'),
  ('Milambo Itobo'),
  ('Magengati'),
  ('Ndala'),
  ('Mbagwa'),
  ('Ugembe')
) AS w(name) WHERE d.name = 'Nzega District Council' ON CONFLICT DO NOTHING;

-- Igunga District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Igunga'),
  ('Itumba'),
  ('Bukoko'),
  ('Isakamaliwa'),
  ('Nanga'),
  ('Nguvumoja'),
  ('Mbutu'),
  ('Lugubu'),
  ('Mtunguru'),
  ('Kining''Inila'),
  ('Igurubi'),
  ('Mwamashimba'),
  ('Kinungu'),
  ('Itunduru'),
  ('Mwamashiga'),
  ('Mwamakona'),
  ('Nyandekwa'),
  ('Ntobo'),
  ('Chomachankola'),
  ('Mwashikumbili'),
  ('Ziba'),
  ('Ndembezi'),
  ('Nkinga'),
  ('Ngulu'),
  ('Sungwizi'),
  ('Kitangili'),
  ('Ugaka'),
  ('Iborogelo'),
  ('Simbo'),
  ('Igoweko'),
  ('Mwisi'),
  ('Chabutwa'),
  ('Mwamala'),
  ('Tambalale'),
  ('Uswaya')
) AS w(name) WHERE d.name = 'Igunga District Council' ON CONFLICT DO NOTHING;

-- Uyui District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Lutende'),
  ('Kizengi'),
  ('Goweko'),
  ('Igalula'),
  ('Loya'),
  ('Miswaki'),
  ('Tura'),
  ('Nsololo'),
  ('Kigwa'),
  ('Miyenze'),
  ('Bukumbi'),
  ('Ikongolo'),
  ('Upuge'),
  ('Magiri'),
  ('Isikizya'),
  ('Shitage'),
  ('Nsimbo'),
  ('Ibelamilundi'),
  ('Nzubuka'),
  ('Igulungu'),
  ('Ilolangulu'),
  ('Mabama'),
  ('Ndono'),
  ('Ufuluma'),
  ('Usagari'),
  ('Ibiri'),
  ('Isila'),
  ('Kalola'),
  ('Makazi')
) AS w(name) WHERE d.name = 'Uyui District Council' ON CONFLICT DO NOTHING;

-- Urambo District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Kapilula'),
  ('Urambo'),
  ('Vumilia'),
  ('Muungano'),
  ('Songambele'),
  ('Uyogo'),
  ('Ugalla'),
  ('Usisya'),
  ('Itundu'),
  ('Kasisi'),
  ('Imalamakoye'),
  ('Nsenda'),
  ('Ukondamoyo'),
  ('Kiyungi'),
  ('Mchikichini'),
  ('Kiloleni'),
  ('Ussoke'),
  ('Uyumbu')
) AS w(name) WHERE d.name = 'Urambo District Council' ON CONFLICT DO NOTHING;

-- Sikonge District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Tutuo'),
  ('Chabutwa'),
  ('Kiloleli'),
  ('Kipanga'),
  ('Sikonge'),
  ('Igigwa'),
  ('Pangale'),
  ('Ipole'),
  ('Ngoywa'),
  ('Kisanga'),
  ('Misheni'),
  ('Mole'),
  ('Mpombwe'),
  ('Usunga'),
  ('Mkolye'),
  ('Nyahua'),
  ('Kitunda'),
  ('Kiloli'),
  ('Kipili'),
  ('Kilumbi')
) AS w(name) WHERE d.name = 'Sikonge District Council' ON CONFLICT DO NOTHING;

-- Tabora Municipal Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Kanyenye'),
  ('Gongoni'),
  ('Tambuka-Reli'),
  ('Kiloleni'),
  ('Mtendeni'),
  ('Isevya'),
  ('Ipuli'),
  ('Kakola'),
  ('Uyui'),
  ('Itonjanda'),
  ('Kalunde'),
  ('Misha'),
  ('Kabila'),
  ('Ikomwa'),
  ('Ifucha'),
  ('Mpela'),
  ('Mbugani'),
  ('Chemchem'),
  ('Cheyo'),
  ('Kitete'),
  ('Ng''Ambo'),
  ('Malolo'),
  ('Ndevelwa'),
  ('Itetemia'),
  ('Tumbi'),
  ('Ntalikwa'),
  ('Mwinyi'),
  ('Kidongochekundu')
) AS w(name) WHERE d.name = 'Tabora Municipal Council' ON CONFLICT DO NOTHING;

-- Kaliua District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Ukumbi Siganga'),
  ('Zugimlole'),
  ('Ugunga'),
  ('Kaliua'),
  ('Kamsekwa'),
  ('Ufukutwa'),
  ('Ushokola'),
  ('Kazaroho'),
  ('Igwisi'),
  ('Usimba'),
  ('Usinge'),
  ('Igagala'),
  ('Usenye'),
  ('Uyowa'),
  ('Silambo'),
  ('Ichemba'),
  ('Mwongozo'),
  ('Kanoge'),
  ('Mkindo'),
  ('Milambo'),
  ('Nhwande'),
  ('Makingi'),
  ('Kashishi'),
  ('Sasu'),
  ('Seleli'),
  ('Igombemkulu'),
  ('Kona Nne'),
  ('Ilege')
) AS w(name) WHERE d.name = 'Kaliua District Council' ON CONFLICT DO NOTHING;

-- Kalambo District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Kasanga'),
  ('Kisumba'),
  ('Mpombwe'),
  ('Samazi'),
  ('Mkowe'),
  ('Msanzi'),
  ('Matai'),
  ('Sopa'),
  ('Katete'),
  ('Mkali'),
  ('Lyowa'),
  ('Sundu'),
  ('Mbuluma'),
  ('Mwimbi'),
  ('Mambwekenya'),
  ('Ulumi'),
  ('Mnamba'),
  ('Mambwe Nkoswe'),
  ('Legezamwendo'),
  ('Mwazye'),
  ('Katazi'),
  ('Kilesha'),
  ('Kanyezi')
) AS w(name) WHERE d.name = 'Kalambo District Council' ON CONFLICT DO NOTHING;

-- Sumbawanga District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Mfinga'),
  ('Muze'),
  ('Mtowisa'),
  ('Milepa'),
  ('Zimba'),
  ('Kalumbaleza'),
  ('Mwadui'),
  ('Ilemba'),
  ('Kipeta'),
  ('Kaoze'),
  ('Kapenta'),
  ('Kilangawana'),
  ('Nankanga'),
  ('Miangalua'),
  ('Lusaka'),
  ('Laela'),
  ('Mnokola'),
  ('Kasanzama'),
  ('Sandulula'),
  ('Kaengesa'),
  ('Mpui'),
  ('Msandamuungano'),
  ('Kalambanzite'),
  ('Ikozi'),
  ('Mpwapwa'),
  ('Kanda'),
  ('Lyangalile')
) AS w(name) WHERE d.name = 'Sumbawanga District Council' ON CONFLICT DO NOTHING;

-- Sumbawanga Municipal Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Ntendo'),
  ('Senga'),
  ('Mollo'),
  ('Pito'),
  ('Milanzi'),
  ('Matanga'),
  ('Kasense'),
  ('Malangali'),
  ('Mazwi'),
  ('Izia'),
  ('Katandala'),
  ('Sumbawanga'),
  ('Kizwite'),
  ('Majengo'),
  ('Chanji'),
  ('Lwiche'),
  ('Momoka'),
  ('Mafulala'),
  ('Msua')
) AS w(name) WHERE d.name = 'Sumbawanga Municipal Council' ON CONFLICT DO NOTHING;

-- Nkasi District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Mkwamba'),
  ('Mtenga'),
  ('Isale'),
  ('Namanyere'),
  ('Nkomolo'),
  ('Kipundu'),
  ('Ntatumbila'),
  ('Majengo'),
  ('Mashete'),
  ('Isunta'),
  ('Paramawe'),
  ('Korongwe'),
  ('Kirando'),
  ('Kabwe'),
  ('Kipili'),
  ('Itete'),
  ('Mkinga'),
  ('Chala'),
  ('Nkandasi'),
  ('Kipande'),
  ('Kate'),
  ('Sintali'),
  ('Ntuchi'),
  ('Myula'),
  ('Kala'),
  ('Wampembe'),
  ('Ninde'),
  ('Kizumbi')
) AS w(name) WHERE d.name = 'Nkasi District Council' ON CONFLICT DO NOTHING;

-- Kibondo District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Misezero'),
  ('Bitare'),
  ('Kibondo Mjini'),
  ('Murungu'),
  ('Bunyambo'),
  ('Kitahana'),
  ('Biturana'),
  ('Kumwambu'),
  ('Rusohoko'),
  ('Kumsenga'),
  ('Kizazi'),
  ('Mabamba'),
  ('Itaba'),
  ('Kagezi'),
  ('Mukabuye'),
  ('Busagara'),
  ('Rugongwe'),
  ('Busunzu'),
  ('Nyaruyoba')
) AS w(name) WHERE d.name = 'Kibondo District Council' ON CONFLICT DO NOTHING;

-- Kasulu District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Kitanga'),
  ('Heru Ushingo'),
  ('Nyamidaho'),
  ('Kitagata'),
  ('Kagera Nkanda'),
  ('Makere'),
  ('Nyachenda'),
  ('Buhoro'),
  ('Nyamnyusi'),
  ('Nyakitonto'),
  ('Muzye'),
  ('Bugaga'),
  ('Kigembe'),
  ('Rusesa'),
  ('Kwaga'),
  ('Kalela'),
  ('Kurugongo'),
  ('Rungwe Mpya'),
  ('Asante Nyerere'),
  ('Titye'),
  ('Shunguliba')
) AS w(name) WHERE d.name = 'Kasulu District Council' ON CONFLICT DO NOTHING;

-- Kasulu Town Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Kigondo'),
  ('Msambara'),
  ('Ruhita'),
  ('Nyumbigwa'),
  ('Murufiti'),
  ('Nyansha'),
  ('Kumsenga'),
  ('Mwilamvya'),
  ('Murusi'),
  ('Murubona'),
  ('Kumnyika'),
  ('Kimobwa'),
  ('Muganza'),
  ('Muhunga'),
  ('Heru Juu')
) AS w(name) WHERE d.name = 'Kasulu Town Council' ON CONFLICT DO NOTHING;

-- Kigoma District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Mungonya'),
  ('Kagongo'),
  ('Mwandiga'),
  ('Ziwani'),
  ('Kagunga'),
  ('Mkigo'),
  ('Mwamgongo'),
  ('Kalinzi'),
  ('Nyarubanda'),
  ('Bitale'),
  ('Mkongoro'),
  ('Mahembe'),
  ('Matendo'),
  ('Nkungwe'),
  ('Kidahwe'),
  ('Simbo')
) AS w(name) WHERE d.name = 'Kigoma District Council' ON CONFLICT DO NOTHING;

-- Kigoma Municipal Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Gungu'),
  ('Kibirizi'),
  ('Mwanga Kusini'),
  ('Kigoma'),
  ('Bangwe'),
  ('Mwanga Kaskazini'),
  ('Katubuka'),
  ('Buhanda'),
  ('Businde'),
  ('Machinjioni'),
  ('Kagera'),
  ('Kasimbu'),
  ('Rubuga'),
  ('Kasingirima'),
  ('Majengo'),
  ('Kitongoni'),
  ('Kipampa'),
  ('Rusimbi'),
  ('Buzebazeba')
) AS w(name) WHERE d.name = 'Kigoma Municipal Council' ON CONFLICT DO NOTHING;

-- Uvinza District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Kalya'),
  ('Buhingu'),
  ('Igalula'),
  ('Sigunga'),
  ('Herembe'),
  ('Sunuka'),
  ('Ilagala'),
  ('Mwakizega'),
  ('Kandaga'),
  ('Kazuramimba'),
  ('Uvinza'),
  ('Mganza'),
  ('Mtegowanoti'),
  ('Nguruka'),
  ('Itebula'),
  ('Basanza')
) AS w(name) WHERE d.name = 'Uvinza District Council' ON CONFLICT DO NOTHING;

-- Buhigwe District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Nyamugali'),
  ('Biharu'),
  ('Muyama'),
  ('Kajana'),
  ('Mugera'),
  ('Kilelema'),
  ('Munyegera'),
  ('Bukuba'),
  ('Buhigwe'),
  ('Kibande'),
  ('Janda'),
  ('Munzeze'),
  ('Rusaba'),
  ('Muhinda'),
  ('Munanila'),
  ('Mwayaya'),
  ('Mkatanga'),
  ('Kibwigwa'),
  ('Mubanga'),
  ('Kinazi')
) AS w(name) WHERE d.name = 'Buhigwe District Council' ON CONFLICT DO NOTHING;

-- Kakonko District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Nyabibuye'),
  ('Nyamtukuza'),
  ('Muhange'),
  ('Gwarama'),
  ('Kakonko'),
  ('Kiziguzigu'),
  ('Kanyonza'),
  ('Kasuga'),
  ('Rugenge'),
  ('Kasanda'),
  ('Gwanumpu'),
  ('Katanga'),
  ('Mugunzu')
) AS w(name) WHERE d.name = 'Kakonko District Council' ON CONFLICT DO NOTHING;

-- Ushetu District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Igwamanoni'),
  ('Sabasabini'),
  ('Mpunze'),
  ('Igunda'),
  ('Ukune'),
  ('Chona'),
  ('Chambo'),
  ('Bulungwa'),
  ('Kisuke'),
  ('Nyamilangano'),
  ('Bukomela'),
  ('Idahina'),
  ('Uyogo'),
  ('Ushetu'),
  ('Ulowa'),
  ('Ubagwe'),
  ('Ulewe'),
  ('Nyankende')
) AS w(name) WHERE d.name = 'Ushetu District Council' ON CONFLICT DO NOTHING;

-- Kahama Municipal Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Busoka'),
  ('Mhongolo'),
  ('Mwendakulima'),
  ('Zongomera'),
  ('Nyahanga'),
  ('Malunga'),
  ('Majengo'),
  ('Nyasubi'),
  ('Nyihogo'),
  ('Mhungula'),
  ('Kahama Mjini'),
  ('Iyenze'),
  ('Kilago'),
  ('Nyandekwa'),
  ('Wendele'),
  ('Ngogwa'),
  ('Kinaga'),
  ('Mondo'),
  ('Kagongwa'),
  ('Isagehe')
) AS w(name) WHERE d.name = 'Kahama Municipal Council' ON CONFLICT DO NOTHING;

-- Msalala Distict Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Bulyan''Hulu'),
  ('Bugarama'),
  ('Lunguya'),
  ('Shilela'),
  ('Segese'),
  ('Mega'),
  ('Chela'),
  ('Busangi'),
  ('Ntobo'),
  ('Ngaya'),
  ('Bulige'),
  ('Kashishi'),
  ('Ikinda'),
  ('Mwanase'),
  ('Mwalugulu'),
  ('Jana'),
  ('Isaka'),
  ('Mwakata')
) AS w(name) WHERE d.name = 'Msalala Distict Council' ON CONFLICT DO NOTHING;

-- Kishapu District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Lagana'),
  ('Mwamashele'),
  ('Ngofila'),
  ('Kiloleli'),
  ('Ukenyenge'),
  ('Talaga'),
  ('Itilima'),
  ('Mwaweja'),
  ('Uchunga'),
  ('Kishapu'),
  ('Mwakipoya'),
  ('Shagihilu'),
  ('Somagedi'),
  ('Mwamalasa'),
  ('Masanga'),
  ('Ndoleleji'),
  ('Mwataga'),
  ('Bupigi'),
  ('Igaga'),
  ('Bunambiyu'),
  ('Bubiki'),
  ('Songwa'),
  ('Seke-Bugoro'),
  ('Mondo'),
  ('Mwadui Lohumbo'),
  ('Maganzo'),
  ('Busangwa'),
  ('Idukilo'),
  ('Mwasubi')
) AS w(name) WHERE d.name = 'Kishapu District Council' ON CONFLICT DO NOTHING;

-- Shinyanga District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Pandagichiza'),
  ('Mwakitolyo'),
  ('Salawe'),
  ('Solwa'),
  ('Iselamagazi'),
  ('Lyabukande'),
  ('Mwantini'),
  ('Mwenge'),
  ('Lyabusalu'),
  ('Mwalukwa'),
  ('Nyamalogo'),
  ('Lyamidati'),
  ('Imesela'),
  ('Usule'),
  ('Ilola'),
  ('Didia'),
  ('Itwangi'),
  ('Tinde'),
  ('Puni'),
  ('Nyida'),
  ('Nsalala'),
  ('Bukene'),
  ('Mwamala'),
  ('Samuye'),
  ('Usanda'),
  ('Masengwa')
) AS w(name) WHERE d.name = 'Shinyanga District Council' ON CONFLICT DO NOTHING;

-- Shinyanga Municipal Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Mwamalili'),
  ('Chibe'),
  ('Old Shinyanga'),
  ('Kolandoto'),
  ('Ibadakuli'),
  ('Ngokolo'),
  ('Mjini'),
  ('Chamaguha'),
  ('Ibinzamata'),
  ('Kitangili'),
  ('Kizumbi'),
  ('Mwawaza'),
  ('Ndala'),
  ('Kambarage'),
  ('Lubaga'),
  ('Ndembezi'),
  ('Masekelo')
) AS w(name) WHERE d.name = 'Shinyanga Municipal Council' ON CONFLICT DO NOTHING;

-- Karagwe District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Igurwa'),
  ('Kanoni'),
  ('Kihanga'),
  ('Kituntu'),
  ('Chanika'),
  ('Kayanga'),
  ('Bugene'),
  ('Ndama'),
  ('Rugera'),
  ('Nyakahanga'),
  ('Ihanda'),
  ('Chonyonyo'),
  ('Ihembe'),
  ('Nyaishozi'),
  ('Rugu'),
  ('Nyakasimbi'),
  ('Nyakakika'),
  ('Nyakabanga'),
  ('Kibondo'),
  ('Bweranyange'),
  ('Nyabiyonza'),
  ('Kiruruma'),
  ('Kamagambo')
) AS w(name) WHERE d.name = 'Karagwe District Council' ON CONFLICT DO NOTHING;

-- Bukoba District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Rubafu'),
  ('Kishanje'),
  ('Kaagya'),
  ('Behendangabo'),
  ('Nyakato'),
  ('Katoma'),
  ('Karabagaine'),
  ('Maruku'),
  ('Kanyangereko'),
  ('Bujugo'),
  ('Katerero'),
  ('Kemondo'),
  ('Nyakibimbili'),
  ('Ibwera'),
  ('Mikoni'),
  ('Kyamulaile'),
  ('Katoro'),
  ('Kaibanja'),
  ('Kasharu'),
  ('Kishogo'),
  ('Butelankuzi'),
  ('Rubale'),
  ('Rukoma'),
  ('Kikomelo'),
  ('Kibirizi'),
  ('Izimbya'),
  ('Kyaitoke'),
  ('Ruhunga'),
  ('Mugajwale')
) AS w(name) WHERE d.name = 'Bukoba District Council' ON CONFLICT DO NOTHING;

-- Bukoba Municipal Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Hamugembe'),
  ('Nshambya'),
  ('Buhembe'),
  ('Kahororo'),
  ('Kashai'),
  ('Miembeni'),
  ('Bilele'),
  ('Bakoba'),
  ('Ijuganyondo'),
  ('Kitendaguro'),
  ('Kibeta'),
  ('Kagondo'),
  ('Nyanga'),
  ('Rwamishenye')
) AS w(name) WHERE d.name = 'Bukoba Municipal Council' ON CONFLICT DO NOTHING;

-- Muleba District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Nyakatanga'),
  ('Ngenge'),
  ('Rutoro'),
  ('Ibuga'),
  ('Bulyakashaju'),
  ('Kamachumu'),
  ('Ruhanga'),
  ('Mafumbo'),
  ('Muhutwe'),
  ('Mayondwe'),
  ('Goziba'),
  ('Kerebe'),
  ('Bumbire'),
  ('Izigo'),
  ('Katoke'),
  ('Kagoma'),
  ('Kikuku'),
  ('Biirabo'),
  ('Mushabago'),
  ('Kabirizi'),
  ('Nshamba'),
  ('Kashasha'),
  ('Ijumbi'),
  ('Kishanda'),
  ('Buganguzi'),
  ('Ikuza'),
  ('Bureza'),
  ('Muleba'),
  ('Ikondo'),
  ('Buhangaza'),
  ('Mazinga'),
  ('Magata Karutanga'),
  ('Gwanseli'),
  ('Kibanga'),
  ('Kasharunga'),
  ('Rulanda'),
  ('Kimwani'),
  ('Nyakabango'),
  ('Kyebitembe'),
  ('Karambi'),
  ('Mubunda'),
  ('Bisheke'),
  ('Burungura')
) AS w(name) WHERE d.name = 'Muleba District Council' ON CONFLICT DO NOTHING;

-- Biharamulo District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Ruziba'),
  ('Biharamulo Mjini'),
  ('Bisibo'),
  ('Nyarubungo'),
  ('Nyamahanga'),
  ('Runazi'),
  ('Kabindi'),
  ('Nyamigogo'),
  ('Nyabusozi'),
  ('Nemba'),
  ('Katahoka'),
  ('Nyakahura'),
  ('Lusahunga'),
  ('Kaniha'),
  ('Nyantakara'),
  ('Kalenge'),
  ('Nyanza')
) AS w(name) WHERE d.name = 'Biharamulo District Council' ON CONFLICT DO NOTHING;

-- Ngara District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Kabanga'),
  ('Mabawe'),
  ('Kanazi'),
  ('Mugoma'),
  ('Kirushya'),
  ('Rusumo'),
  ('Ntobeye'),
  ('Nyamiaga'),
  ('Ngara Mjini'),
  ('Kibimba'),
  ('Murukurazo'),
  ('Kasulo'),
  ('Nyakisasa'),
  ('Rulenge'),
  ('Keza'),
  ('Bugarama'),
  ('Bukiriro'),
  ('Mbuba'),
  ('Kibogora'),
  ('Murusagamba'),
  ('Muganza'),
  ('Nyamagoma')
) AS w(name) WHERE d.name = 'Ngara District Council' ON CONFLICT DO NOTHING;

-- Kyerwa District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Kibingo'),
  ('Murongo'),
  ('Bugomora'),
  ('Kibare'),
  ('Mabira'),
  ('Businde'),
  ('Kamuli'),
  ('Nyakatuntu'),
  ('Kimuli'),
  ('Kikukuru'),
  ('Kitwe'),
  ('Bugara'),
  ('Kakanja'),
  ('Rwabwere'),
  ('Nkwenda'),
  ('Rukuraijo'),
  ('Songambele'),
  ('Kyerwa'),
  ('Kitwechenkura'),
  ('Iteera'),
  ('Isingiro'),
  ('Kaisho'),
  ('Rutunguru'),
  ('Nyaruzumbura')
) AS w(name) WHERE d.name = 'Kyerwa District Council' ON CONFLICT DO NOTHING;

-- Missenyi District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Kakunyu'),
  ('Nsunga'),
  ('Mutukula'),
  ('Kassambya'),
  ('Minziro'),
  ('Bugorora'),
  ('Kyaka'),
  ('Mushasha'),
  ('Kilimilile'),
  ('Mabale'),
  ('Ruzinga'),
  ('Kashenye'),
  ('Kanyigo'),
  ('Ishunju'),
  ('Buyango'),
  ('Bwanjai'),
  ('Ishozi'),
  ('Gera'),
  ('Bugandika'),
  ('Kitobo')
) AS w(name) WHERE d.name = 'Missenyi District Council' ON CONFLICT DO NOTHING;

-- Ukerewe District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Bwisya'),
  ('Bukungu'),
  ('Nyamanga'),
  ('Bukiko'),
  ('Mukituntu'),
  ('Murutunguru'),
  ('Kagunguli'),
  ('Bukindo'),
  ('Irugwa'),
  ('Nansio'),
  ('Kagera'),
  ('Nakatunguru'),
  ('Kakerege'),
  ('Bukongo'),
  ('Nkilizya'),
  ('Bukanda'),
  ('Namagondo'),
  ('Ngoma'),
  ('Igalla'),
  ('Bwiro'),
  ('Muriti'),
  ('Ilangala'),
  ('Namilembe'),
  ('Nduruma'),
  ('Kakukuru')
) AS w(name) WHERE d.name = 'Ukerewe District Council' ON CONFLICT DO NOTHING;

-- Magu District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Kisesa'),
  ('Bujashi'),
  ('Lutale'),
  ('Kongolo'),
  ('Bukandwe'),
  ('Bujora'),
  ('Chabula'),
  ('Nyanguge'),
  ('Kitongo Sima'),
  ('Mwamanga'),
  ('Kahangara'),
  ('Nyigogo'),
  ('Mwamabanza'),
  ('Sukuma'),
  ('Lubugu'),
  ('Magu Mjini'),
  ('Kandawe'),
  ('Isandula'),
  ('Itumbili'),
  ('Buhumbi'),
  ('Ng''Haya'),
  ('Nkungulu'),
  ('Jinjimili'),
  ('Shishani'),
  ('Kabila')
) AS w(name) WHERE d.name = 'Magu District Council' ON CONFLICT DO NOTHING;

-- Mwanza City Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Mkuyuni'),
  ('Igogo'),
  ('Pamba'),
  ('Nyamagana'),
  ('Mirongo'),
  ('Isamilo'),
  ('Mbugani'),
  ('Mahina'),
  ('Igoma'),
  ('Buhongwa'),
  ('Mkolani'),
  ('Butimba'),
  ('Nyegezi'),
  ('Mabatini'),
  ('Mhandu'),
  ('Kishili'),
  ('Lwanhima'),
  ('Luchelele')
) AS w(name) WHERE d.name = 'Mwanza City Council' ON CONFLICT DO NOTHING;

-- Kwimba District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Mwang''Halanga'),
  ('Igongwa'),
  ('Ngudu'),
  ('Nyamilama'),
  ('Mwakilyambiti'),
  ('Hungumalwa'),
  ('Ng''Hundi'),
  ('Mwankulwe'),
  ('Ilula'),
  ('Mwamala'),
  ('Kikubiji'),
  ('Mhande'),
  ('Bupamwa'),
  ('Fukalo'),
  ('Shilembo'),
  ('Walla'),
  ('Bungulwa'),
  ('Sumve'),
  ('Mantare'),
  ('Ngulla'),
  ('Mwabomba'),
  ('Mwagi'),
  ('Iseni'),
  ('Nyambiti'),
  ('Maligisu'),
  ('Mwandu'),
  ('Malya'),
  ('Lyoma'),
  ('Bugando'),
  ('Nkalalo')
) AS w(name) WHERE d.name = 'Kwimba District Council' ON CONFLICT DO NOTHING;

-- Sengerema District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Ibisabageni'),
  ('Tabaruka'),
  ('Busisi'),
  ('Sima'),
  ('Buzilasoga'),
  ('Igulumuki'),
  ('Kahumulo'),
  ('Nyampande'),
  ('Kishinda'),
  ('Mwabaluhi'),
  ('Nyatukara'),
  ('Nyampulukano'),
  ('Mission'),
  ('Ibondo'),
  ('Nyamazugo'),
  ('Chifunfu'),
  ('Katunguru'),
  ('Kasungamile'),
  ('Nyamatongo'),
  ('Nyamizeze'),
  ('Kasenyi'),
  ('Ngoma'),
  ('Buyagu'),
  ('Igalula'),
  ('Kagunga'),
  ('Bitoto')
) AS w(name) WHERE d.name = 'Sengerema District Council' ON CONFLICT DO NOTHING;

-- Buchosa District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Bangwe'),
  ('Katwe'),
  ('Maisome'),
  ('Kalebezo'),
  ('Nyehunge'),
  ('Kafunzo'),
  ('Bupandwa'),
  ('Iligamba'),
  ('Bugoro'),
  ('Lugata'),
  ('Buhama'),
  ('Nyakasasa'),
  ('Kasisa'),
  ('Nyakasungwa'),
  ('Nyanzenda'),
  ('Bulyaheke'),
  ('Kazunzu'),
  ('Irenza'),
  ('Luharanyonga'),
  ('Nyakaliro'),
  ('Bukokwa')
) AS w(name) WHERE d.name = 'Buchosa District Council' ON CONFLICT DO NOTHING;

-- Ilemela Municipal Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Buswelu'),
  ('Nyakato'),
  ('Nyamanoro'),
  ('Kirumba'),
  ('Kitangiri'),
  ('Pasiansi'),
  ('Ilemela'),
  ('Bugogwa'),
  ('Sangabuye'),
  ('Kayenze'),
  ('Shibula'),
  ('Kahama'),
  ('Kiseke'),
  ('Kawekamo'),
  ('Ibungilo'),
  ('Nyamhongolo'),
  ('Mecco'),
  ('Buzuruga'),
  ('Nyasaka')
) AS w(name) WHERE d.name = 'Ilemela Municipal Council' ON CONFLICT DO NOTHING;

-- Misungwi District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Bulemeji'),
  ('Idetemya'),
  ('Usagara'),
  ('Ukiriguru'),
  ('Kanyelele'),
  ('Fella'),
  ('Koromije'),
  ('Igokelo'),
  ('Mwaniko'),
  ('Misungwi'),
  ('Mabuki'),
  ('Mondo'),
  ('Mamaye'),
  ('Misasi'),
  ('Kijima'),
  ('Shilalo'),
  ('Buhingo'),
  ('Busongo'),
  ('Nhundulu'),
  ('Kasololo'),
  ('Isenengeja'),
  ('Gulumungu'),
  ('Lubili'),
  ('Ilujamate'),
  ('Mbarika'),
  ('Sumbugu'),
  ('Buhunda')
) AS w(name) WHERE d.name = 'Misungwi District Council' ON CONFLICT DO NOTHING;

-- Tarime District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Susuni'),
  ('Mwema'),
  ('Sirari'),
  ('Regicheri'),
  ('Gwitiryo'),
  ('Pemba'),
  ('Mbogi'),
  ('Binagi'),
  ('Nyarero'),
  ('Nyakonga'),
  ('Ganyange'),
  ('Kibasuka'),
  ('Nyamwaga'),
  ('Nyansincha'),
  ('Muriba'),
  ('Itiryo'),
  ('Nyanungu'),
  ('Gorong''A'),
  ('Kwihancha'),
  ('Nyarokoba'),
  ('Kemambo'),
  ('Matongo'),
  ('Bumera'),
  ('Kiore'),
  ('Manga'),
  ('Komaswa')
) AS w(name) WHERE d.name = 'Tarime District Council' ON CONFLICT DO NOTHING;

-- Tarime Town Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Nyandoto'),
  ('Nyamisangura'),
  ('Nkende'),
  ('Turwa'),
  ('Ketare'),
  ('Kenyamanyori'),
  ('Bomani'),
  ('Sabasaba')
) AS w(name) WHERE d.name = 'Tarime Town Council' ON CONFLICT DO NOTHING;

-- Serengeti District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Kenyamonta'),
  ('Majimoto'),
  ('Busawe'),
  ('Kisaka'),
  ('Ring''Wani'),
  ('Nyansurura'),
  ('Kebanchabancha'),
  ('Rung''Abure'),
  ('Mosongo'),
  ('Nyambureti'),
  ('Magange'),
  ('Nyamatare'),
  ('Nyamoko'),
  ('Machochwe'),
  ('Mbalibali'),
  ('Kisangura'),
  ('Manchira'),
  ('Sedeco'),
  ('Geitasamo'),
  ('Matare'),
  ('Stendi Kuu'),
  ('Mugumu'),
  ('Morotonga'),
  ('Uwanja Wa Ndege'),
  ('Ikoma'),
  ('Natta'),
  ('Nagusi'),
  ('Issenye'),
  ('Rigicha'),
  ('Kyambahi')
) AS w(name) WHERE d.name = 'Serengeti District Council' ON CONFLICT DO NOTHING;

-- Musoma District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Bukumi'),
  ('Makojo'),
  ('Bwasi'),
  ('Bulinga'),
  ('Bukima'),
  ('Rusoli'),
  ('Murangi'),
  ('Musanja'),
  ('Nyamrandirira'),
  ('Bugwema'),
  ('Nyambono'),
  ('Bugoji'),
  ('Suguti'),
  ('Tegeruka'),
  ('Busambara'),
  ('Kiriba'),
  ('Mugango'),
  ('Ifulifu'),
  ('Nyakatende'),
  ('Nyegina'),
  ('Etaro')
) AS w(name) WHERE d.name = 'Musoma District Council' ON CONFLICT DO NOTHING;

-- Musoma Municipal Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Mukendo'),
  ('Mwigobero'),
  ('Iringo'),
  ('Kitaji'),
  ('Nyasho'),
  ('Bweri'),
  ('Nyakato'),
  ('Kigera'),
  ('Kamunyonge'),
  ('Nyamatare'),
  ('Mwisenge'),
  ('Buhare'),
  ('Makoko'),
  ('Mshikamano'),
  ('Rwamlimi'),
  ('Kwangwa')
) AS w(name) WHERE d.name = 'Musoma Municipal Council' ON CONFLICT DO NOTHING;

-- Bunda District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Nyamuswa'),
  ('Ketare'),
  ('Salama'),
  ('Mihingo'),
  ('Mugeta'),
  ('Hunyari'),
  ('Nyamang''Uta'),
  ('Kibara'),
  ('Chitengule'),
  ('Nansimo'),
  ('Kisorya'),
  ('Nampindi'),
  ('Igundu'),
  ('Butimba'),
  ('Neruma'),
  ('Iramba'),
  ('Namhula'),
  ('Nyamihyoro'),
  ('Kasuguti')
) AS w(name) WHERE d.name = 'Bunda District Council' ON CONFLICT DO NOTHING;

-- Bunda Town Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Guta'),
  ('Wariku'),
  ('Kabasa'),
  ('Sazira'),
  ('Mcharo'),
  ('Kunzugu'),
  ('Nyatwali'),
  ('Balili'),
  ('Nyamakokoto'),
  ('Bunda Stoo'),
  ('Bunda Mjini'),
  ('Kabarimu'),
  ('Nyasura'),
  ('Manyamanyama')
) AS w(name) WHERE d.name = 'Bunda Town Council' ON CONFLICT DO NOTHING;

-- Butiama District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Buhemba'),
  ('Mirwa'),
  ('Muriaza'),
  ('Butiama'),
  ('Masaba'),
  ('Kyanyari'),
  ('Kukirango'),
  ('Kamugegi'),
  ('Buruma'),
  ('Bisumwa'),
  ('Nyankanga'),
  ('Bukabwa'),
  ('Butuguri'),
  ('Busegwe'),
  ('Bwiregi'),
  ('Buswahili'),
  ('Nyamimange'),
  ('Sirorisimba')
) AS w(name) WHERE d.name = 'Butiama District Council' ON CONFLICT DO NOTHING;

-- Rorya District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Kigunga'),
  ('Kirogo'),
  ('Nyamtinga'),
  ('Nyamagaro'),
  ('Nyahongo'),
  ('Mkoma'),
  ('Tai'),
  ('Bukura'),
  ('Kyangasaga'),
  ('Kinyenche'),
  ('Raranya'),
  ('Roche'),
  ('Kitembe'),
  ('Mirare'),
  ('Goribe'),
  ('Ikoma'),
  ('Koryo'),
  ('Bukwe'),
  ('Nyathorongo'),
  ('Rabour'),
  ('Nyaburongo'),
  ('Kisumwa'),
  ('Komuge'),
  ('Nyamunga'),
  ('Kyang''Ombe'),
  ('Baraki')
) AS w(name) WHERE d.name = 'Rorya District Council' ON CONFLICT DO NOTHING;

-- Babati District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Magara'),
  ('Nkaiti'),
  ('Mwada'),
  ('Kiru'),
  ('Magugu'),
  ('Kisangaji'),
  ('Mamire'),
  ('Gallapo'),
  ('Qash'),
  ('Endakiso'),
  ('Ayasanda'),
  ('Gidas'),
  ('Duru'),
  ('Riroda'),
  ('Boay'),
  ('Arri'),
  ('Dareda'),
  ('Dabil'),
  ('Ufana'),
  ('Bashnet'),
  ('Madunga'),
  ('Nar'),
  ('Ayalagaya'),
  ('Secheda'),
  ('Qameyu')
) AS w(name) WHERE d.name = 'Babati District Council' ON CONFLICT DO NOTHING;

-- Babati Town Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Babati'),
  ('Mutuka'),
  ('Nangara'),
  ('Bagara'),
  ('Sigino'),
  ('Maisaka'),
  ('Singe'),
  ('Bonga')
) AS w(name) WHERE d.name = 'Babati Town Council' ON CONFLICT DO NOTHING;

-- Hanang District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Masakta'),
  ('Masqaroda'),
  ('Endasiwold'),
  ('Endasak'),
  ('Endagaw'),
  ('Measkron'),
  ('Gidahababieg'),
  ('Hidet'),
  ('Simbay'),
  ('Sirop'),
  ('Gisambalang'),
  ('Nangwa'),
  ('Wareta'),
  ('Dirma'),
  ('Mogitu'),
  ('Dawar'),
  ('Gendabi'),
  ('Gitting'),
  ('Jorodom'),
  ('Dumbeta'),
  ('Ganana'),
  ('Katesh'),
  ('Lalaji'),
  ('Balang''Dalalu'),
  ('Gehandu'),
  ('Ishponga'),
  ('Laghanga'),
  ('Getanuwas'),
  ('Hirbadaw'),
  ('Garawja'),
  ('Bassodesh'),
  ('Bassotu'),
  ('Mulbadaw')
) AS w(name) WHERE d.name = 'Hanang District Council' ON CONFLICT DO NOTHING;

-- Mbulu District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Bashay'),
  ('Yaeda Ampa'),
  ('Tumati'),
  ('Dongobesh'),
  ('Gidhim'),
  ('Dinamu'),
  ('Haydom'),
  ('Eshkesh'),
  ('Endamilay'),
  ('Yaeda Chini'),
  ('Maretadu'),
  ('Haydarer'),
  ('Geterer'),
  ('Maghang'),
  ('Labay'),
  ('Masieda'),
  ('Endahagichan'),
  ('Masqaroda')
) AS w(name) WHERE d.name = 'Mbulu District Council' ON CONFLICT DO NOTHING;

-- Mbulu Town Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Marang'),
  ('Daudi'),
  ('Bargish'),
  ('Gunyoda'),
  ('Imboru'),
  ('Uhuru'),
  ('Ayamohe'),
  ('Sanu Baray'),
  ('Gehandu'),
  ('Ayamaami'),
  ('Endagikot'),
  ('Tlawi'),
  ('Silaloda'),
  ('Nahasey'),
  ('Kainam'),
  ('Nambis'),
  ('Murray')
) AS w(name) WHERE d.name = 'Mbulu Town Council' ON CONFLICT DO NOTHING;

-- Simanjiro District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Loiborsiret'),
  ('Emboreet'),
  ('Terrat'),
  ('Oljoro No.5'),
  ('Komolo'),
  ('Shambarai'),
  ('Mirerani'),
  ('Naisinyai'),
  ('Endiamutu'),
  ('Msitu Wa Tembo'),
  ('Ngorika'),
  ('Loiborsoit'),
  ('Ruvu Remit'),
  ('Orkesumet'),
  ('Naberera'),
  ('Kitwai'),
  ('Endonyongijape'),
  ('Langai')
) AS w(name) WHERE d.name = 'Simanjiro District Council' ON CONFLICT DO NOTHING;

-- Kiteto District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Makame'),
  ('Ndedo'),
  ('Kijungu'),
  ('Lengatei'),
  ('Loolera'),
  ('Sunya'),
  ('Dongo'),
  ('Laiseri'),
  ('Songambele'),
  ('Dosidosi'),
  ('Magungu'),
  ('Engusero'),
  ('Matui'),
  ('Chapakazi'),
  ('Ndirgishi'),
  ('Bwawani'),
  ('Njoro'),
  ('Olboloti'),
  ('Kibaya'),
  ('Partimbo'),
  ('Bwagamoyo'),
  ('Namelock'),
  ('Kaloleni')
) AS w(name) WHERE d.name = 'Kiteto District Council' ON CONFLICT DO NOTHING;

-- Njombe District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Kidegembye'),
  ('Matembwe'),
  ('Lupembe'),
  ('Ikondo'),
  ('Mfriga'),
  ('Idamba'),
  ('Ukalawa'),
  ('Mtwango'),
  ('Igongolo'),
  ('Kichiwa'),
  ('Ninga'),
  ('Ikuna')
) AS w(name) WHERE d.name = 'Njombe District Council' ON CONFLICT DO NOTHING;

-- Njombe Town Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Njombe Mjini'),
  ('Mjimwema'),
  ('Ramadhani'),
  ('Yakobi'),
  ('Kifanya'),
  ('Ihanga'),
  ('Iwungilo'),
  ('Luponde'),
  ('Matola'),
  ('Makowo'),
  ('Lugenge'),
  ('Uwemba'),
  ('Utalingoro')
) AS w(name) WHERE d.name = 'Njombe Town Council' ON CONFLICT DO NOTHING;

-- Makambako Town Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Makambako'),
  ('Mjimwema'),
  ('Mlowa'),
  ('Lyamkena'),
  ('Mwembetogwa'),
  ('Mahongole'),
  ('Kitandililo'),
  ('Utengule'),
  ('Maguvani'),
  ('Majengo'),
  ('Kitisi'),
  ('Kivavi')
) AS w(name) WHERE d.name = 'Makambako Town Council' ON CONFLICT DO NOTHING;

-- Makete District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Lupila'),
  ('Ukwama'),
  ('Ipepo'),
  ('Mbalatse'),
  ('Lupalilo'),
  ('Iwawa'),
  ('Mang''Oto'),
  ('Tandala'),
  ('Isapulano'),
  ('Bulongwa'),
  ('Kipagalo'),
  ('Luwumbu'),
  ('Matamba'),
  ('Mlondwe'),
  ('Kitulo'),
  ('Itundu'),
  ('Kinyika'),
  ('Iniho'),
  ('Ipelele'),
  ('Kigulu'),
  ('Ikuwo'),
  ('Mfumbi'),
  ('Kigala')
) AS w(name) WHERE d.name = 'Makete District Council' ON CONFLICT DO NOTHING;

-- Wanging'Ombe District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Imalinyi'),
  ('Ulembwe'),
  ('Makoga'),
  ('Kipengele'),
  ('Igosi'),
  ('Wangama'),
  ('Kidugala'),
  ('Usuka'),
  ('Igwachanya'),
  ('Mdandu'),
  ('Igima'),
  ('Itulahumba'),
  ('Saja'),
  ('Kijombe'),
  ('Wanging''Ombe'),
  ('Ilembula'),
  ('Uhambule'),
  ('Luduga'),
  ('Malangali'),
  ('Uhenga'),
  ('Udonja')
) AS w(name) WHERE d.name = 'Wanging''Ombe District Council' ON CONFLICT DO NOTHING;

-- Mpanda Municipal Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Shanwe'),
  ('Makanyagio'),
  ('Kashaulili'),
  ('Kawajense'),
  ('Nsemulwa'),
  ('Majengo'),
  ('Kasokola'),
  ('Kazima'),
  ('Uwanja Wa Ndege'),
  ('Kakese'),
  ('Misunkumilo'),
  ('Mpanda Hotel'),
  ('Ilembo'),
  ('Mwamkulu'),
  ('Magamba')
) AS w(name) WHERE d.name = 'Mpanda Municipal Council' ON CONFLICT DO NOTHING;

-- Nsimbo District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Sitalike'),
  ('Ibindi'),
  ('Itenka'),
  ('Machimboni'),
  ('Kapalala'),
  ('Nsimbo'),
  ('Kanoge'),
  ('Ugalla'),
  ('Litapunga'),
  ('Mtapenda'),
  ('Katumba')
) AS w(name) WHERE d.name = 'Nsimbo District Council' ON CONFLICT DO NOTHING;

-- Tanganyika District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Mishamo'),
  ('Mpandandogo'),
  ('Kabungu'),
  ('Ilangu'),
  ('Bulamata'),
  ('Ipwaga'),
  ('Tongwe'),
  ('Mnyagala'),
  ('Mwese'),
  ('Katuma'),
  ('Sibwesa'),
  ('Kasekese'),
  ('Ikola'),
  ('Karema'),
  ('Kapalamsenga'),
  ('Isengule')
) AS w(name) WHERE d.name = 'Tanganyika District Council' ON CONFLICT DO NOTHING;

-- Mlele District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Utende'),
  ('Inyonga'),
  ('Kamsisi'),
  ('Ilunde'),
  ('Ilela'),
  ('Nsenkwa')
) AS w(name) WHERE d.name = 'Mlele District Council' ON CONFLICT DO NOTHING;

-- Mpimbwe District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Majimoto'),
  ('Mamba'),
  ('Kasansa'),
  ('Mbede'),
  ('Usevya'),
  ('Kibaoni'),
  ('Ikuba')
) AS w(name) WHERE d.name = 'Mpimbwe District Council' ON CONFLICT DO NOTHING;

-- Bariadi District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Itubukilo'),
  ('Sakwe'),
  ('Ngulyati'),
  ('Kilalo'),
  ('Kasoli'),
  ('Mwasubuya'),
  ('Gambosi'),
  ('Ikungulyabashashi'),
  ('Dutwa'),
  ('Sapiwi'),
  ('Masewa'),
  ('Matongo'),
  ('Gilya'),
  ('Mwaubingi'),
  ('Gibishi'),
  ('Nkindwabiye'),
  ('Ihusi'),
  ('Mwaumatondo'),
  ('Nkololo'),
  ('Banemhi'),
  ('Mwadobana')
) AS w(name) WHERE d.name = 'Bariadi District Council' ON CONFLICT DO NOTHING;

-- Bariadi Town Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Mhango'),
  ('Guduwi'),
  ('Nyakabindi'),
  ('Bariadi'),
  ('Sima'),
  ('Malambo'),
  ('Somanda'),
  ('Nyangokolwa'),
  ('Bunamhala'),
  ('Isanga')
) AS w(name) WHERE d.name = 'Bariadi Town Council' ON CONFLICT DO NOTHING;

-- Itilima District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Bumera'),
  ('Ikindilo'),
  ('Mwamtani'),
  ('Sagata'),
  ('Mwaswale'),
  ('Nkuyu'),
  ('Mhunze'),
  ('Migato'),
  ('Chinamili'),
  ('Ndolelezi'),
  ('Lagangabilili'),
  ('Budalabujiga'),
  ('Nkoma'),
  ('Mwalushu'),
  ('Nyamalapa'),
  ('Luguru'),
  ('Nhobora'),
  ('Zagayu'),
  ('Kinang''Weli'),
  ('Mbita'),
  ('Sawida')
) AS w(name) WHERE d.name = 'Itilima District Council' ON CONFLICT DO NOTHING;

-- Meatu District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Mwanhuzi'),
  ('Nkoma'),
  ('Kimali'),
  ('Mwamishali'),
  ('Mwangudo'),
  ('Mwanyahina'),
  ('Imalaseko'),
  ('Mwabuzo'),
  ('Mwamalole'),
  ('Mwanjolo'),
  ('Mwamanongu'),
  ('Ng''Hoboko'),
  ('Bukundi'),
  ('Mwamanimba'),
  ('Mbushi'),
  ('Kabondo'),
  ('Itinje'),
  ('Lubiga'),
  ('Isengwa'),
  ('Mbugayabanghya'),
  ('Kisesa'),
  ('Mwandoya'),
  ('Lingeka'),
  ('Sakasaka'),
  ('Mwabuma'),
  ('Mwabusalu'),
  ('Mwasengela'),
  ('Tindabuligi'),
  ('Mwakisandu')
) AS w(name) WHERE d.name = 'Meatu District Council' ON CONFLICT DO NOTHING;

-- Maswa District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Kadoto'),
  ('Shishiyu'),
  ('Nyabubinza'),
  ('Mwang''Honoli'),
  ('Kulimi'),
  ('Malampaka'),
  ('Badi'),
  ('Mwabayanda'),
  ('Mataba'),
  ('Jija'),
  ('Seng''Wa'),
  ('Masela'),
  ('Isanga'),
  ('Zanzui'),
  ('Mwamashimba'),
  ('Buchambi'),
  ('Busangi'),
  ('Nyalikungu'),
  ('Binza'),
  ('Bugarama'),
  ('Shanwa'),
  ('Sola'),
  ('Ng''Wigwa'),
  ('Nguliguli'),
  ('Ipililo'),
  ('Senani'),
  ('Mwamanenge'),
  ('Sukuma'),
  ('Mpindo'),
  ('Dakama'),
  ('Lalago'),
  ('Budekwa'),
  ('Busilili'),
  ('Sangamwalugesha'),
  ('Mbaragane'),
  ('Mwabaratulu')
) AS w(name) WHERE d.name = 'Maswa District Council' ON CONFLICT DO NOTHING;

-- Busega District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Shigala'),
  ('Badugu'),
  ('Nyaluhande'),
  ('Kiloleli'),
  ('Mwamanyili'),
  ('Kabita'),
  ('Nyashimo'),
  ('Kalemela'),
  ('Lamadi'),
  ('Lutubiga'),
  ('Mkula'),
  ('Ngasamo'),
  ('Malili'),
  ('Igalukilo'),
  ('Imalamate')
) AS w(name) WHERE d.name = 'Busega District Council' ON CONFLICT DO NOTHING;

-- Geita District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Kagu'),
  ('Bugulula'),
  ('Senga'),
  ('Kakubilo'),
  ('Nkome'),
  ('Katoma'),
  ('Nzera'),
  ('Lwenzera'),
  ('Kamhanga'),
  ('Bugalama'),
  ('Lubanga'),
  ('Isulwabutundwe'),
  ('Nyamboge'),
  ('Izumacheli'),
  ('Nyawilimilwa'),
  ('Kamena'),
  ('Nyamalimbe'),
  ('Bujula'),
  ('Bukoli'),
  ('Butobela'),
  ('Nyarugusu'),
  ('Nyakamwaga'),
  ('Rwamgasa'),
  ('Busanda'),
  ('Nyalwanzaja'),
  ('Nyaruyeye'),
  ('Butundwe'),
  ('Magenge'),
  ('Kaseme'),
  ('Katoro'),
  ('Nyamigota'),
  ('Nyakagomba'),
  ('Nyachiluluma'),
  ('Bukondo'),
  ('Chigunga'),
  ('Nyamwilolelwa'),
  ('Ludete')
) AS w(name) WHERE d.name = 'Geita District Council' ON CONFLICT DO NOTHING;

-- Geita Town Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Nyankumbu'),
  ('Bombambili'),
  ('Mtakuja'),
  ('Mgusu'),
  ('Kalangalala'),
  ('Buhalahala'),
  ('Nyanguku'),
  ('Ihanamilo'),
  ('Kasamwa'),
  ('Bulela'),
  ('Shiloleli'),
  ('Kanyala'),
  ('Bung''Wangoko')
) AS w(name) WHERE d.name = 'Geita Town Council' ON CONFLICT DO NOTHING;

-- Nyang'Hwale District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Shabaka'),
  ('Mwingiro'),
  ('Nyabulanda'),
  ('Nyang''Hwale'),
  ('Kaboha'),
  ('Busolwa'),
  ('Kakora'),
  ('Nyijundu'),
  ('Nyamtukuza'),
  ('Nyugwa'),
  ('Kharumwa'),
  ('Izunya'),
  ('Bukwimba'),
  ('Kafita'),
  ('Nundu')
) AS w(name) WHERE d.name = 'Nyang''Hwale District Council' ON CONFLICT DO NOTHING;

-- Mbogwe District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Lugunga'),
  ('Nyakafulu'),
  ('Bukandwe'),
  ('Nhomolwa'),
  ('Masumbwe'),
  ('Iponya'),
  ('Nanda'),
  ('Mbogwe'),
  ('Ngemo'),
  ('Ushirika'),
  ('Nyasato'),
  ('Bunigonzi'),
  ('Ikobe'),
  ('Lulembela'),
  ('Ikunguigazi'),
  ('Isebya'),
  ('Ilolangulu')
) AS w(name) WHERE d.name = 'Mbogwe District Council' ON CONFLICT DO NOTHING;

-- Bukombe District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Lyambamgongo'),
  ('Bukombe'),
  ('Bugelenga'),
  ('Iyogelo'),
  ('Ng''Anzo'),
  ('Butinzya'),
  ('Ushirombo'),
  ('Igulwa'),
  ('Katente'),
  ('Bulangwa'),
  ('Katome'),
  ('Bulega'),
  ('Runzewe Mashariki'),
  ('Runzewe Magharibi'),
  ('Namonge'),
  ('Uyovu'),
  ('Busonzo')
) AS w(name) WHERE d.name = 'Bukombe District Council' ON CONFLICT DO NOTHING;

-- Chato District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Ichwankima'),
  ('Kachwamba'),
  ('Kasenga'),
  ('Ilemela'),
  ('Muganza'),
  ('Bwongera'),
  ('Kigongo'),
  ('Nyamirembe'),
  ('Chato'),
  ('Muungano'),
  ('Bwina'),
  ('Katende'),
  ('Ilyamchele'),
  ('Bukome'),
  ('Makurugusi'),
  ('Buseresere'),
  ('Butengo Rumasa'),
  ('Iparamasa'),
  ('Buziku'),
  ('Nyarutembo'),
  ('Bwanga'),
  ('Bwera'),
  ('Minkoto')
) AS w(name) WHERE d.name = 'Chato District Council' ON CONFLICT DO NOTHING;

-- Momba District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Chilulumo'),
  ('Kamsamba'),
  ('Ivuna'),
  ('Mpapa'),
  ('Mkulwe'),
  ('Mkomba'),
  ('Chitete'),
  ('Msangano'),
  ('Nkangamo'),
  ('Ndalambo'),
  ('Kapele'),
  ('Nzoka'),
  ('Myunga'),
  ('Ikana')
) AS w(name) WHERE d.name = 'Momba District Council' ON CONFLICT DO NOTHING;

-- Tunduma Town Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Chiwezi'),
  ('Katete'),
  ('Mpemba'),
  ('Mpande'),
  ('Chapwa'),
  ('Sogea'),
  ('Kaloleni'),
  ('Tunduma'),
  ('Majengo'),
  ('Chipaka'),
  ('Muungano'),
  ('Mwakakati'),
  ('Uwanjani'),
  ('Makambini')
) AS w(name) WHERE d.name = 'Tunduma Town Council' ON CONFLICT DO NOTHING;

-- Songwe District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Gua'),
  ('Ngwala'),
  ('Kapalala'),
  ('Udinde'),
  ('Mbangala'),
  ('Saza'),
  ('Mkwajuni'),
  ('Mwambani'),
  ('Kanga'),
  ('Ifwenkenya'),
  ('Galula'),
  ('Mbuyuni'),
  ('Magamba'),
  ('Totowe'),
  ('Mpona'),
  ('Namkukwe'),
  ('Manda')
) AS w(name) WHERE d.name = 'Songwe District Council' ON CONFLICT DO NOTHING;

-- Mbozi District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Msia'),
  ('Isalalo'),
  ('Nanyala'),
  ('Ruanda'),
  ('Iyula'),
  ('Mlangali'),
  ('Idiwili'),
  ('Ihanda'),
  ('Nyimbili'),
  ('Ipunga'),
  ('Ukwile'),
  ('Vwawa'),
  ('Hezya'),
  ('Kilimampimbi'),
  ('Ilolo'),
  ('Ichenjezya'),
  ('Hasanga'),
  ('Hasamba'),
  ('Bara'),
  ('Nambinzo'),
  ('Itaka'),
  ('Halungu'),
  ('Isansa'),
  ('Igamba'),
  ('Magamba'),
  ('Itumpi'),
  ('Shiwinga'),
  ('Mahenje'),
  ('Mlowo')
) AS w(name) WHERE d.name = 'Mbozi District Council' ON CONFLICT DO NOTHING;

-- Ileje District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Itumba'),
  ('Itale'),
  ('Ibaba'),
  ('Ndola'),
  ('Bupigu'),
  ('Isongole'),
  ('Chitete'),
  ('Mbebe'),
  ('Mlale'),
  ('Luswisi'),
  ('Ngulilo'),
  ('Lubanda'),
  ('Ngulugulu'),
  ('Sange'),
  ('Ikinga'),
  ('Kafule'),
  ('Malangali'),
  ('Kalembo')
) AS w(name) WHERE d.name = 'Ileje District Council' ON CONFLICT DO NOTHING;

-- Kaskazini A District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Kigunda'),
  ('Kilindi'),
  ('Banda Kuu'),
  ('Kiungani'),
  ('Fukuchani'),
  ('Kidoti'),
  ('Tazari'),
  ('Kilimani Tazari'),
  ('Bwereu'),
  ('Kivunge'),
  ('Muwange'),
  ('Pitanazako'),
  ('Potoa'),
  ('Kijini Matemwe'),
  ('Kigomani'),
  ('Kigongoni'),
  ('Juga Kuu'),
  ('Mbuyutende'),
  ('Mkwajuni'),
  ('Kibeni'),
  ('Moga'),
  ('Chutama'),
  ('Kidombo'),
  ('Matemwe Kaskazini'),
  ('Gamba')
) AS w(name) WHERE d.name = 'Kaskazini A District Council' ON CONFLICT DO NOTHING;

-- Kaskazini B Town Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Mnyimbi'),
  ('Donge Mbiji'),
  ('Donge Pwani'),
  ('Mkataleni'),
  ('Donge Mtambile'),
  ('Donge Karange'),
  ('Donge Vijibweni'),
  ('Njia Ya Mtoni'),
  ('Majenzi'),
  ('Kitope'),
  ('Kilombero'),
  ('Mbaleni'),
  ('Kwagube'),
  ('Mahonda'),
  ('Kinduni'),
  ('Matetema'),
  ('Upenja'),
  ('Kiwengwa'),
  ('Pangeni'),
  ('Mgambo'),
  ('Kisongoni'),
  ('Misufini'),
  ('Makoba'),
  ('Kiongwe Kidogo'),
  ('Kidanzini'),
  ('Mafufuni'),
  ('Mangapwani'),
  ('Fujoni'),
  ('Kiombamvua'),
  ('Mkadini'),
  ('Zingwezingwe')
) AS w(name) WHERE d.name = 'Kaskazini B Town Council' ON CONFLICT DO NOTHING;

-- Kati Town Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Kiboje Mwembeshauri'),
  ('Kiboje Mkwajuni'),
  ('Ghana'),
  ('Mgeni Haji'),
  ('Uzini'),
  ('Mitakawani'),
  ('Tunduni'),
  ('Charawe'),
  ('Bambi'),
  ('Pagali'),
  ('Umbuji'),
  ('Mchangani Shamba'),
  ('Mpapa'),
  ('Kijibwemtu'),
  ('Kidimni'),
  ('Machui'),
  ('Miwani'),
  ('Koani'),
  ('Jendele'),
  ('Chwaka'),
  ('Marumbi'),
  ('Uroa'),
  ('Pongwe'),
  ('Ndijani Mseweni'),
  ('Cheju')
) AS w(name) WHERE d.name = 'Kati Town Council' ON CONFLICT DO NOTHING;

-- Kusini District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Michamvi'),
  ('Paje'),
  ('Bwejuu'),
  ('Dongwe'),
  ('Jambiani Kikadini'),
  ('Jambiani Kibigija'),
  ('Kitogani'),
  ('Muungoni'),
  ('Nganani'),
  ('Mzuri'),
  ('Kajengwa'),
  ('Kijini'),
  ('Kiongoni'),
  ('Tasani'),
  ('Mtende'),
  ('Kibuteni'),
  ('Kizimkazi Dimbani'),
  ('Kizimkazi Mkunguni'),
  ('Muyuni A'),
  ('Muyuni B'),
  ('Muyuni C')
) AS w(name) WHERE d.name = 'Kusini District Council' ON CONFLICT DO NOTHING;

-- Mjini Municipal Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Shangani'),
  ('Mkunazini'),
  ('Kiponda'),
  ('Malindi'),
  ('Mchangani'),
  ('Vikokotoni'),
  ('Mlandege'),
  ('Gulioni'),
  ('Makadara'),
  ('Muembetanga'),
  ('Mitiulaya'),
  ('Shaurimoyo'),
  ('Saateni'),
  ('Kwamtipura'),
  ('Mkele'),
  ('Mboriborini'),
  ('Mwembemakumbi'),
  ('Maruhubi'),
  ('Masumbani'),
  ('Chumbuni'),
  ('Karakana'),
  ('Banko'),
  ('Kilimahewa Juu')
) AS w(name) WHERE d.name = 'Mjini Municipal Council' ON CONFLICT DO NOTHING;

-- Magharibi A Municipal Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Bububu'),
  ('Mbuzini'),
  ('Dole'),
  ('Kizimbani'),
  ('Chemchem'),
  ('Chuini'),
  ('Kama'),
  ('Kihinani'),
  ('Kikaangoni'),
  ('Mfenesini'),
  ('Mwakaje'),
  ('Bumbwisudi'),
  ('Mwera'),
  ('Muembe Mchomeke'),
  ('Kianga'),
  ('Masingini'),
  ('Mtoni Kidatu'),
  ('Mtoni Chemchem'),
  ('Welezo'),
  ('Uholanzi'),
  ('Mtofaani'),
  ('Michikichini'),
  ('Hawaii'),
  ('Mto Pepo'),
  ('Munduli'),
  ('Mtoni'),
  ('Sharifu Msa'),
  ('Mwanyanya'),
  ('Kibweni'),
  ('Kwa Goa')
) AS w(name) WHERE d.name = 'Magharibi A Municipal Council' ON CONFLICT DO NOTHING;

-- Magharibi B Municipal Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Mwanakwerekwe'),
  ('Mikarafuuni'),
  ('Magogoni'),
  ('Jitimai'),
  ('Sokoni'),
  ('Melinne'),
  ('Taveta'),
  ('Kijitoupele'),
  ('Uzi'),
  ('Kinuni'),
  ('Mnarani'),
  ('Pangawe'),
  ('Muembe Majogoo'),
  ('Kibondeni'),
  ('Uwandani'),
  ('Chunga'),
  ('Mambosasa'),
  ('Fuoni Kipungani'),
  ('Fuoni Migombani'),
  ('Maungani'),
  ('Kisauni'),
  ('Tomondo'),
  ('Fumba'),
  ('Bweleo'),
  ('Dimani'),
  ('Kombeni'),
  ('Nyamanzi'),
  ('Shakani'),
  ('Chukwani'),
  ('Kiembesamaki'),
  ('Mbweni'),
  ('Mombasa'),
  ('Kwa Mchina'),
  ('Michungwani')
) AS w(name) WHERE d.name = 'Magharibi B Municipal Council' ON CONFLICT DO NOTHING;

-- Wete Town Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Fundo'),
  ('Gando'),
  ('Ukunjwi'),
  ('Junguni'),
  ('Finya'),
  ('Mgogoni'),
  ('Kizimbani'),
  ('Kinyasini'),
  ('Kipangani'),
  ('Selem'),
  ('Jadida'),
  ('Mtemani'),
  ('Bopwe'),
  ('Utaani'),
  ('Pandani'),
  ('Maziwani'),
  ('Mzambarau Takao'),
  ('Shengejuu'),
  ('Kiungoni'),
  ('Pembeni'),
  ('Mjananza'),
  ('Mlindo'),
  ('Mchanga Mdogo'),
  ('Kojani'),
  ('Kinyikani')
) AS w(name) WHERE d.name = 'Wete Town Council' ON CONFLICT DO NOTHING;

-- Micheweni District Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Majenzi'),
  ('Micheweni'),
  ('Shumba Mjini'),
  ('Chamboni'),
  ('Shanake'),
  ('Kiuyu Mbuyuni'),
  ('Maziwa Ng''Ombe'),
  ('Sizini'),
  ('Mjini Wingwi'),
  ('Wingwi Njuguni'),
  ('Mtemani'),
  ('Tondooni'),
  ('Makangale'),
  ('Msuka Magharibi'),
  ('Msuka Mashariki'),
  ('Kifundi'),
  ('Konde'),
  ('Kipange'),
  ('Mihogoni'),
  ('Tumbe Magharibi'),
  ('Tumbe Mashariki'),
  ('Shumba Viamboni'),
  ('Chimba'),
  ('Kinowe')
) AS w(name) WHERE d.name = 'Micheweni District Council' ON CONFLICT DO NOTHING;

-- Chake Chake Town Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Chanjaani'),
  ('Shungi'),
  ('Madungu'),
  ('Tibirinzi'),
  ('Chachani'),
  ('Kichungwani'),
  ('Msingini'),
  ('Wawi'),
  ('Wara'),
  ('Mkoroshoni'),
  ('Mvumoni'),
  ('Mgogoni'),
  ('Kibokoni'),
  ('Gombani'),
  ('Ole'),
  ('Mchanga Mrima'),
  ('Mjini Ole'),
  ('Vitongoji'),
  ('Ng''Ambwa'),
  ('Uwandani'),
  ('Pujini'),
  ('Matale'),
  ('Mfikiwa'),
  ('Chonga'),
  ('Mgelema'),
  ('Kilindi'),
  ('Ziwani'),
  ('Kwale'),
  ('Mbuzini'),
  ('Ndagoni'),
  ('Wesha'),
  ('Michungwani')
) AS w(name) WHERE d.name = 'Chake Chake Town Council' ON CONFLICT DO NOTHING;

-- Mkoani Town Council
INSERT INTO wards (district_id, name)
SELECT d.id, w.name FROM districts d CROSS JOIN (VALUES
  ('Ngwachani'),
  ('Wambaa'),
  ('Chumbageni'),
  ('Mgagadu'),
  ('Chambani'),
  ('Ukutini'),
  ('Dodo'),
  ('Mwambe'),
  ('Shamiani'),
  ('Jombwe'),
  ('Mchakwe'),
  ('Kiwani'),
  ('Mtangani'),
  ('Kendwa'),
  ('Kisiwapanza'),
  ('Kangani'),
  ('Kengeja'),
  ('Kuukuu'),
  ('Mkungu'),
  ('Chole'),
  ('Mtambile'),
  ('Mizingani'),
  ('Mjimbini'),
  ('Minazini'),
  ('Ng''Ombeni'),
  ('Makombeni'),
  ('Mbuguani'),
  ('Uweleni'),
  ('Changaweni'),
  ('Makoongwe'),
  ('Shidi'),
  ('Michenzani'),
  ('Mbuyuni'),
  ('Stahabu'),
  ('Mkanyageni'),
  ('Chokocho')
) AS w(name) WHERE d.name = 'Mkoani Town Council' ON CONFLICT DO NOTHING;


-- ── 4. SUPER ADMIN ────────────────────────────────────────────────────────────
--    email: superadmin@nbs.go.tz   password: Admin@1234
INSERT INTO super_admins (id, employee_id, nida_number, full_name, email,
  password_hash, mobile, department, status)
VALUES (
  '00000000-0000-0000-0000-000000000001', 'SEED-SA-001',
  '19700101-00000-00001-01', 'System Super Admin', 'superadmin@nbs.go.tz',
  crypt('Admin@1234', gen_salt('bf', 10)),
  '+255700000001', 'NBS Central Administration', 'active'
) ON CONFLICT (employee_id) DO UPDATE
    SET status = 'active',
        password_hash = crypt('Admin@1234', gen_salt('bf', 10));


-- ── 5. DISTRICT ADMINS ────────────────────────────────────────────────────────

-- 5-A  Kinondoni, Dar es Salaam (Mainland)
--      email: da.kinondoni@nbs.go.tz   password: Admin@1234
INSERT INTO district_admins (id, employee_id, nida_number, full_name, email,
  password_hash, mobile, region_id, district_id, status, created_by)
SELECT '00000000-0000-0000-0000-000000000010', 'SEED-DA-001',
  '19800315-07031-10001-11', 'Amina Juma Mwangi', 'da.kinondoni@nbs.go.tz',
  crypt('Admin@1234', gen_salt('bf', 10)), '+255711000010',
  r.id, d.id, 'active', '00000000-0000-0000-0000-000000000001'
FROM regions r JOIN districts d ON d.region_id = r.id
WHERE r.name = 'Dar es Salaam' AND d.name = 'Kinondoni Municipal Council' LIMIT 1
ON CONFLICT (employee_id) DO NOTHING;

-- 5-B  Mjini Municipal, Zanzibar
--      email: da.mjini@ocgs.go.tz   password: Admin@1234
INSERT INTO district_admins (id, employee_id, nida_number, full_name, email,
  password_hash, mobile, region_id, district_id, status, created_by)
SELECT '00000000-0000-0000-0000-000000000011', 'SEED-DA-002',
  '19820622-27011-10002-22', 'Fatuma Said Hamad', 'da.mjini@ocgs.go.tz',
  crypt('Admin@1234', gen_salt('bf', 10)), '+255777000011',
  r.id, d.id, 'active', '00000000-0000-0000-0000-000000000001'
FROM regions r JOIN districts d ON d.region_id = r.id
WHERE r.name = 'Mjini Magharibi' AND d.name = 'Mjini Municipal Council' LIMIT 1
ON CONFLICT (employee_id) DO NOTHING;


-- ── 6. HEALTH FACILITIES ─────────────────────────────────────────────────────

-- 6-A  Muhimbili National Hospital — Dar es Salaam (Mainland)
--      Region: Dar es Salaam | District: Kinondoni | Ward: Magomeni
INSERT INTO health_facilities (facility_reg_no, facility_name, facility_type,
  facility_grade, ownership_type, ward_id, district_id, gps_lat, gps_lng)
SELECT 'SEED-HF-MNH-001', 'Muhimbili National Hospital',
  'hospital', 'H', 'public', w.id, d.id, -6.80125000, 39.27180000
FROM regions r
  JOIN districts d ON d.region_id = r.id
  JOIN wards    w ON w.district_id = d.id
WHERE r.name = 'Dar es Salaam'
  AND d.name  = 'Kinondoni Municipal Council'
  AND w.name  = 'Magomeni'
LIMIT 1
ON CONFLICT (facility_reg_no) DO NOTHING;

-- 6-B  Mnazi Mmoja Hospital — Zanzibar (Mjini Magharibi)
--      Region: Mjini Magharibi | District: Mjini Municipal | Shehia: Shangani
INSERT INTO health_facilities (facility_reg_no, facility_name, facility_type,
  facility_grade, ownership_type, ward_id, district_id, gps_lat, gps_lng)
SELECT 'SEED-HF-MNZ-002', 'Mnazi Mmoja Hospital',
  'hospital', 'H', 'public', w.id, d.id, -6.16670000, 39.20000000
FROM regions r
  JOIN districts d ON d.region_id = r.id
  JOIN wards    w ON w.district_id = d.id
WHERE r.name = 'Mjini Magharibi'
  AND d.name  = 'Mjini Municipal Council'
  AND w.name  = 'Shangani'
LIMIT 1
ON CONFLICT (facility_reg_no) DO NOTHING;


-- ── 7. HOSPITAL OFFICERS ─────────────────────────────────────────────────────

-- 7-A  John Baraka Mkumbwa — Muhimbili (Mainland)
--      email: ho.muhimbili@nbs.go.tz   password: Admin@1234
INSERT INTO hospital_officers (id, employee_id, nida_number, full_name, email,
  password_hash, mobile, facility_id, district_id, status, created_by)
SELECT '00000000-0000-0000-0000-000000000020', 'SEED-HO-001',
  '19900101-07031-20001-33', 'John Baraka Mkumbwa', 'ho.muhimbili@nbs.go.tz',
  crypt('Admin@1234', gen_salt('bf', 10)), '+255712000020',
  hf.id, hf.district_id, 'active', '00000000-0000-0000-0000-000000000010'
FROM health_facilities hf
WHERE hf.facility_reg_no = 'SEED-HF-MNH-001'
ON CONFLICT (employee_id) DO NOTHING;

-- 7-B  Maryam Ali Kombo — Mnazi Mmoja (Zanzibar)
--      email: ho.mnazimmoja@ocgs.go.tz   password: Admin@1234
INSERT INTO hospital_officers (id, employee_id, nida_number, full_name, email,
  password_hash, mobile, facility_id, district_id, status, created_by)
SELECT '00000000-0000-0000-0000-000000000021', 'SEED-HO-002',
  '19920622-27011-20002-44', 'Maryam Ali Kombo', 'ho.mnazimmoja@ocgs.go.tz',
  crypt('Admin@1234', gen_salt('bf', 10)), '+255777000021',
  hf.id, hf.district_id, 'active', '00000000-0000-0000-0000-000000000011'
FROM health_facilities hf
WHERE hf.facility_reg_no = 'SEED-HF-MNZ-002'
ON CONFLICT (employee_id) DO NOTHING;


-- ── 8. VILLAGE OFFICERS ──────────────────────────────────────────────────────

-- 8-A  Emmanuel Petro Kimani — Kinondoni (Mainland, Magomeni Ward)
--      email: vo.kinondoni@nbs.go.tz   password: Admin@1234
INSERT INTO village_officers (id, employee_id, nida_number, full_name, email,
  password_hash, mobile, ward_id, district_id, status, created_by)
SELECT '00000000-0000-0000-0000-000000000030', 'SEED-VO-001',
  '19950315-07031-30001-55', 'Emmanuel Petro Kimani', 'vo.kinondoni@nbs.go.tz',
  crypt('Admin@1234', gen_salt('bf', 10)), '+255714000030',
  w.id, d.id, 'active', '00000000-0000-0000-0000-000000000010'
FROM regions r
  JOIN districts d ON d.region_id = r.id
  JOIN wards    w ON w.district_id = d.id
WHERE r.name = 'Dar es Salaam'
  AND d.name  = 'Kinondoni Municipal Council'
  AND w.name  = 'Magomeni'
LIMIT 1
ON CONFLICT (employee_id) DO NOTHING;

-- 8-B  Zuhura Mahmoud Juma — Mjini Zanzibar (Shangani Shehia)
--      email: vo.mjini@ocgs.go.tz   password: Admin@1234
INSERT INTO village_officers (id, employee_id, nida_number, full_name, email,
  password_hash, mobile, ward_id, district_id, status, created_by)
SELECT '00000000-0000-0000-0000-000000000031', 'SEED-VO-002',
  '19970622-27011-30002-66', 'Zuhura Mahmoud Juma', 'vo.mjini@ocgs.go.tz',
  crypt('Admin@1234', gen_salt('bf', 10)), '+255777000031',
  w.id, d.id, 'active', '00000000-0000-0000-0000-000000000011'
FROM regions r
  JOIN districts d ON d.region_id = r.id
  JOIN wards    w ON w.district_id = d.id
WHERE r.name = 'Mjini Magharibi'
  AND d.name  = 'Mjini Municipal Council'
  AND w.name  = 'Shangani'
LIMIT 1
ON CONFLICT (employee_id) DO NOTHING;


-- ── 9. ENSURE ALL SEED ACCOUNTS ARE ACTIVE ────────────────────────────────────
UPDATE hospital_officers SET status = 'active' WHERE employee_id LIKE 'SEED-%';
UPDATE village_officers  SET status = 'active' WHERE employee_id LIKE 'SEED-%';
UPDATE district_admins   SET status = 'active' WHERE employee_id LIKE 'SEED-%';


-- ── 10. VERIFICATION (run after insert) ──────────────────────────────────────
SELECT 'Regions'    AS entity, COUNT(*) AS total FROM regions;
SELECT 'Districts'  AS entity, COUNT(*) AS total FROM districts;
SELECT 'Wards'      AS entity, COUNT(*) AS total FROM wards;
SELECT 'SuperAdmins'      AS entity, COUNT(*) FROM super_admins    WHERE employee_id LIKE 'SEED-%';
SELECT 'DistrictAdmins'   AS entity, COUNT(*) FROM district_admins WHERE employee_id LIKE 'SEED-%';
SELECT 'HealthFacilities' AS entity, COUNT(*) FROM health_facilities WHERE facility_reg_no LIKE 'SEED-%';
SELECT 'HospitalOfficers' AS entity, COUNT(*) FROM hospital_officers WHERE employee_id LIKE 'SEED-%';
SELECT 'VillageOfficers'  AS entity, COUNT(*) FROM village_officers  WHERE employee_id LIKE 'SEED-%';

-- Full facility card (what the mobile dashboard fetches)
SELECT hf.facility_name, hf.facility_type, hf.facility_grade,
  r.name AS region, r.jurisdiction, d.name AS district, w.name AS ward_shehia,
  ho.full_name AS officer, ho.email
FROM health_facilities hf
  JOIN districts d ON d.id = hf.district_id
  JOIN regions   r ON r.id = d.region_id
  JOIN wards     w ON w.id = hf.ward_id
  LEFT JOIN hospital_officers ho ON ho.facility_id = hf.id
WHERE hf.facility_reg_no LIKE 'SEED-%';

-- ============================================================
--  ALL SEED ACCOUNTS  (password: Admin@1234 for all)
--  superadmin@nbs.go.tz        Super Admin
--  da.kinondoni@nbs.go.tz      District Admin — Dar es Salaam
--  da.mjini@ocgs.go.tz         District Admin — Zanzibar
--  ho.muhimbili@nbs.go.tz      Hospital Officer — Muhimbili
--  ho.mnazimmoja@ocgs.go.tz    Hospital Officer — Mnazi Mmoja
--  vo.kinondoni@nbs.go.tz      Village Officer  — Kinondoni
--  vo.mjini@ocgs.go.tz         Village Officer  — Mjini Zanzibar
-- ============================================================
