/**
 * localDb.ts — ADLCS Offline-First Local SQLite Database
 *
 * All registrations are saved HERE first before any network call.
 * The app works 100% without internet — records sync to backend when online.
 *
 * Tables: births · deaths · certificates · sync_queue · officer_cache
 */

import * as SQLite from 'expo-sqlite'

let _db: SQLite.SQLiteDatabase | null = null

// ─── Types ─────────────────────────────────────────────────────────────────────
export interface LocalBirth {
  id:               string
  certNo:           string
  nationalId:       string
  childFirstName:   string
  childMiddleName:  string
  childSurname:     string
  gender:           string
  dateOfBirth:      string   // DD/MM/YYYY
  fatherName:       string
  fatherNid:        string
  motherName:       string
  motherNid:        string
  facilityName:     string
  facilityDistrict: string
  facilityRegion:   string
  officerName:      string
  registeredAt:     string   // ISO string
  synced:           number   // 0 | 1
  certPdfPath:      string
  rawJson:          string
}

export interface LocalDeath {
  id:               string
  certNo:           string
  nationalId:       string
  deceasedName:     string
  causeOfDeath:     string
  dateOfDeath:      string   // DD/MM/YYYY
  locationType:     string
  category:         string
  informantName:    string
  facilityName:     string
  officerName:      string
  registeredAt:     string
  synced:           number
  certPdfPath:      string
  rawJson:          string
}

export interface OfficerCache {
  officerName:      string
  facilityName:     string
  facilityType:     string
  facilityGrade:    string
  facilityRegion:   string
  facilityDistrict: string
  facilityGpsLat:   string
  facilityGpsLng:   string
  todayBirths:      number
  todayDeaths:      number
  monthBirths:      number
  monthDeaths:      number
  pendingCases:     number
  facilityCertIssued: number
  facilityDeliveries: number
}

// ─── Open / Init ───────────────────────────────────────────────────────────────
export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db
  _db = await SQLite.openDatabaseAsync('adlcs_local.db')
  await _db.execAsync('PRAGMA journal_mode = WAL;')
  await _db.execAsync('PRAGMA foreign_keys = ON;')
  await initSchema(_db)
  return _db
}

async function initSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS births (
      id               TEXT PRIMARY KEY,
      cert_no          TEXT UNIQUE NOT NULL,
      national_id      TEXT,
      child_first_name TEXT NOT NULL,
      child_middle_name TEXT DEFAULT '',
      child_surname    TEXT NOT NULL,
      gender           TEXT NOT NULL,
      date_of_birth    TEXT NOT NULL,
      father_name      TEXT DEFAULT '',
      father_nid       TEXT DEFAULT '',
      mother_name      TEXT DEFAULT '',
      mother_nid       TEXT DEFAULT '',
      facility_name    TEXT DEFAULT '',
      facility_district TEXT DEFAULT '',
      facility_region  TEXT DEFAULT '',
      officer_name     TEXT DEFAULT '',
      registered_at    TEXT NOT NULL,
      synced           INTEGER DEFAULT 0,
      cert_pdf_path    TEXT DEFAULT '',
      raw_json         TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS deaths (
      id               TEXT PRIMARY KEY,
      cert_no          TEXT UNIQUE NOT NULL,
      national_id      TEXT DEFAULT '',
      deceased_name    TEXT DEFAULT '',
      cause_of_death   TEXT NOT NULL,
      date_of_death    TEXT NOT NULL,
      location_type    TEXT NOT NULL,
      category         TEXT NOT NULL,
      informant_name   TEXT DEFAULT '',
      facility_name    TEXT DEFAULT '',
      officer_name     TEXT DEFAULT '',
      registered_at    TEXT NOT NULL,
      synced           INTEGER DEFAULT 0,
      cert_pdf_path    TEXT DEFAULT '',
      raw_json         TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS officer_cache (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)
}

// ─── ID / Cert generators ──────────────────────────────────────────────────────
function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

export function generateBirthCertNo(): string {
  const seq = Math.floor(Math.random() * 90000000 + 10000000)
  return `${seq} A`
}

export function generateDeathCertNo(): string {
  const seq = Math.floor(Math.random() * 90000000 + 10000000)
  return `TZ-D-${seq} A`
}

export function generateNewbornNationalId(dob: string): string {
  // Spec §2.7 Step 4 — format: TZ-YYYYMMDD-XXXXX
  const parts    = dob.split('/')
  const day      = (parts[0] ?? '01').padStart(2, '0')
  const month    = (parts[1] ?? '01').padStart(2, '0')
  const year     = parts[2] ?? new Date().getFullYear().toString()
  const datePart = `${year}${month}${day}`
  const seq      = String(Math.floor(Math.random() * 90000) + 10000).padStart(5, '0')
  return `TZ-${datePart}-${seq}`
}

export function generateNationalId(dob: string, regionCode = '07', districtCode = '03', wardCode = '1'): string {
  // Parse DD/MM/YYYY
  const parts  = dob.split('/')
  const day    = (parts[0] ?? '01').padStart(2, '0')
  const month  = (parts[1] ?? '01').padStart(2, '0')
  const year   = parts[2] ?? '2026'
  const datePart = `${year}${month}${day}`
  const locPart  = `${regionCode.padStart(2,'0')}${districtCode.padStart(2,'0')}${wardCode.padStart(1,'0')}`
  const seq      = String(Math.floor(Math.random() * 90000) + 10000).padStart(5,'0')
  const cc       = String(Math.floor(Math.random() * 90) + 10)
  return `${datePart}-${locPart}-${seq}-${cc}`
}

// ─── Births ────────────────────────────────────────────────────────────────────
export async function saveBirth(data: Omit<LocalBirth,'id'|'registeredAt'|'synced'|'certPdfPath'>): Promise<LocalBirth> {
  const db   = await getDb()
  const id   = uuid()
  const now  = new Date().toISOString()
  const row: LocalBirth = { ...data, id, registeredAt: now, synced: 0, certPdfPath: '' }
  await db.runAsync(
    `INSERT INTO births (id,cert_no,national_id,child_first_name,child_middle_name,child_surname,gender,date_of_birth,father_name,father_nid,mother_name,mother_nid,facility_name,facility_district,facility_region,officer_name,registered_at,synced,cert_pdf_path,raw_json)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,'',?)`,
    [id, data.certNo, data.nationalId, data.childFirstName, data.childMiddleName, data.childSurname,
     data.gender, data.dateOfBirth, data.fatherName, data.fatherNid, data.motherName, data.motherNid,
     data.facilityName, data.facilityDistrict, data.facilityRegion, data.officerName, now, data.rawJson]
  )
  return row
}

export async function updateBirthCertPath(id: string, path: string): Promise<void> {
  const db = await getDb()
  await db.runAsync('UPDATE births SET cert_pdf_path = ? WHERE id = ?', [path, id])
}

export async function markBirthSynced(id: string): Promise<void> {
  const db = await getDb()
  await db.runAsync('UPDATE births SET synced = 1 WHERE id = ?', [id])
}

export async function getAllBirths(): Promise<LocalBirth[]> {
  const db = await getDb()
  const rows = await db.getAllAsync<any>('SELECT * FROM births ORDER BY registered_at DESC')
  return rows.map(mapBirth)
}

export async function getPendingBirths(): Promise<LocalBirth[]> {
  const db = await getDb()
  const rows = await db.getAllAsync<any>('SELECT * FROM births WHERE synced = 0 ORDER BY registered_at DESC')
  return rows.map(mapBirth)
}

export async function getBirthById(id: string): Promise<LocalBirth | null> {
  const db  = await getDb()
  const row = await db.getFirstAsync<any>('SELECT * FROM births WHERE id = ?', [id])
  return row ? mapBirth(row) : null
}

function mapBirth(r: any): LocalBirth {
  return {
    id: r.id, certNo: r.cert_no, nationalId: r.national_id ?? '',
    childFirstName: r.child_first_name, childMiddleName: r.child_middle_name ?? '',
    childSurname: r.child_surname, gender: r.gender, dateOfBirth: r.date_of_birth,
    fatherName: r.father_name ?? '', fatherNid: r.father_nid ?? '',
    motherName: r.mother_name ?? '', motherNid: r.mother_nid ?? '',
    facilityName: r.facility_name ?? '', facilityDistrict: r.facility_district ?? '',
    facilityRegion: r.facility_region ?? '', officerName: r.officer_name ?? '',
    registeredAt: r.registered_at, synced: r.synced, certPdfPath: r.cert_pdf_path ?? '',
    rawJson: r.raw_json ?? '{}',
  }
}

// ─── Deaths ────────────────────────────────────────────────────────────────────
export async function saveDeath(data: Omit<LocalDeath,'id'|'registeredAt'|'synced'|'certPdfPath'>): Promise<LocalDeath> {
  const db  = await getDb()
  const id  = uuid()
  const now = new Date().toISOString()
  const row: LocalDeath = { ...data, id, registeredAt: now, synced: 0, certPdfPath: '' }
  await db.runAsync(
    `INSERT INTO deaths (id,cert_no,national_id,deceased_name,cause_of_death,date_of_death,location_type,category,informant_name,facility_name,officer_name,registered_at,synced,cert_pdf_path,raw_json)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,'',?)`,
    [id, data.certNo, data.nationalId, data.deceasedName, data.causeOfDeath, data.dateOfDeath,
     data.locationType, data.category, data.informantName, data.facilityName, data.officerName, now, data.rawJson]
  )
  return row
}

export async function updateDeathCertPath(id: string, path: string): Promise<void> {
  const db = await getDb()
  await db.runAsync('UPDATE deaths SET cert_pdf_path = ? WHERE id = ?', [path, id])
}

export async function markDeathSynced(id: string): Promise<void> {
  const db = await getDb()
  await db.runAsync('UPDATE deaths SET synced = 1 WHERE id = ?', [id])
}

export async function getAllDeaths(): Promise<LocalDeath[]> {
  const db = await getDb()
  const rows = await db.getAllAsync<any>('SELECT * FROM deaths ORDER BY registered_at DESC')
  return rows.map(mapDeath)
}

export async function getPendingDeaths(): Promise<LocalDeath[]> {
  const db = await getDb()
  const rows = await db.getAllAsync<any>('SELECT * FROM deaths WHERE synced = 0 ORDER BY registered_at DESC')
  return rows.map(mapDeath)
}

function mapDeath(r: any): LocalDeath {
  return {
    id: r.id, certNo: r.cert_no, nationalId: r.national_id ?? '',
    deceasedName: r.deceased_name ?? '', causeOfDeath: r.cause_of_death,
    dateOfDeath: r.date_of_death, locationType: r.location_type, category: r.category,
    informantName: r.informant_name ?? '', facilityName: r.facility_name ?? '',
    officerName: r.officer_name ?? '', registeredAt: r.registered_at,
    synced: r.synced, certPdfPath: r.cert_pdf_path ?? '', rawJson: r.raw_json ?? '{}',
  }
}

// ─── Dashboard stats from local DB ────────────────────────────────────────────
export async function getLocalStats(): Promise<{
  todayBirths: number; todayDeaths: number
  monthBirths: number; monthDeaths: number
  pendingSync: number; totalBirths: number; totalDeaths: number
}> {
  const db      = await getDb()
  const today   = new Date(); today.setHours(0,0)
  const monthS  = new Date(today.getFullYear(), today.getMonth(), 1)
  const todayS  = today.toISOString()
  const monthSS = monthS.toISOString()

  const [tb, td, mb, md, ps, total_b, total_d] = await Promise.all([
    db.getFirstAsync<{c:number}>('SELECT COUNT(*) as c FROM births WHERE registered_at >= ?', [todayS]),
    db.getFirstAsync<{c:number}>('SELECT COUNT(*) as c FROM deaths WHERE registered_at >= ?', [todayS]),
    db.getFirstAsync<{c:number}>('SELECT COUNT(*) as c FROM births WHERE registered_at >= ?', [monthSS]),
    db.getFirstAsync<{c:number}>('SELECT COUNT(*) as c FROM deaths WHERE registered_at >= ?', [monthSS]),
    db.getFirstAsync<{c:number}>('SELECT COUNT(*) as c FROM births WHERE synced = 0 UNION ALL SELECT COUNT(*) FROM deaths WHERE synced = 0'),
    db.getFirstAsync<{c:number}>('SELECT COUNT(*) as c FROM births'),
    db.getFirstAsync<{c:number}>('SELECT COUNT(*) as c FROM deaths'),
  ])

  const pendingB = await db.getFirstAsync<{c:number}>('SELECT COUNT(*) as c FROM births WHERE synced = 0')
  const pendingD = await db.getFirstAsync<{c:number}>('SELECT COUNT(*) as c FROM deaths WHERE synced = 0')

  return {
    todayBirths: tb?.c ?? 0, todayDeaths: td?.c ?? 0,
    monthBirths: mb?.c ?? 0, monthDeaths: md?.c ?? 0,
    pendingSync: (pendingB?.c ?? 0) + (pendingD?.c ?? 0),
    totalBirths: total_b?.c ?? 0, totalDeaths: total_d?.c ?? 0,
  }
}

// ─── Officer cache ─────────────────────────────────────────────────────────────
export async function cacheOfficerData(data: Partial<OfficerCache>): Promise<void> {
  const db = await getDb()
  for (const [k, v] of Object.entries(data)) {
    await db.runAsync(
      'INSERT OR REPLACE INTO officer_cache (key, value) VALUES (?, ?)',
      [k, String(v ?? '')]
    )
  }
}

export async function getCachedOfficerData(): Promise<Partial<OfficerCache>> {
  const db   = await getDb()
  const rows = await db.getAllAsync<{key: string; value: string}>('SELECT key, value FROM officer_cache')
  const out: Record<string, any> = {}
  for (const r of rows) out[r.key] = r.value
  return out as Partial<OfficerCache>
}