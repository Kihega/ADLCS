/**
 * localDb.ts  v8.0  STUBS ONLY — online-only mode
 *
 * SQLite / expo-sqlite completely removed.
 * Retained exports:
 *   • Type definitions  (LocalBirth, LocalDeath) — used by screens
 *   • Cert / ID generators — used by form screens to pre-fill cert numbers
 *   • No-op async stubs — satisfy any remaining imports without crashing
 *
 * All real data persistence goes directly to the backend via syncService.
 */

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
  registeredAt:     string   // ISO
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
  officerName:        string
  facilityName:       string
  facilityType:       string
  facilityGrade:      string
  facilityRegion:     string
  facilityDistrict:   string
  facilityGpsLat:     string
  facilityGpsLng:     string
  todayBirths:        number
  todayDeaths:        number
  monthBirths:        number
  monthDeaths:        number
  pendingCases:       number
  facilityCertIssued: number
  facilityDeliveries: number
}

// ─── Cert / ID generators ──────────────────────────────────────────────────────
export function generateBirthCertNo(): string {
  const seq = Math.floor(Math.random() * 90000000 + 10000000)
  return `${seq} A`
}

export function generateDeathCertNo(): string {
  const seq = Math.floor(Math.random() * 90000000 + 10000000)
  return `TZ-D-${seq} A`
}

export function generateNewbornNationalId(
  dob: string,
  regionCode   = '07',
  districtCode = '03',
  wardCode     = '1',
): string {
  const parts   = dob.split('/')
  const day     = (parts[0] ?? '01').padStart(2, '0')
  const month   = (parts[1] ?? '01').padStart(2, '0')
  const year    = parts[2] ?? String(new Date().getFullYear())
  const date    = `${year}${month}${day}`
  const loc     = `${regionCode.padStart(2,'0')}${districtCode.padStart(2,'0')}${wardCode.padStart(1,'0')}`
  const seq     = String(Math.floor(Math.random() * 89999) + 10001).padStart(5, '0')
  const cc      = String(Math.floor(Math.random() * 89) + 10)
  return `${date}-${loc}-${seq}-${cc}`
}

export function generateNationalId(
  dob: string,
  regionCode   = '07',
  districtCode = '03',
  wardCode     = '1',
): string {
  const parts = dob.split('/')
  const day   = (parts[0] ?? '01').padStart(2, '0')
  const month = (parts[1] ?? '01').padStart(2, '0')
  const year  = parts[2] ?? '2026'
  const date  = `${year}${month}${day}`
  const loc   = `${regionCode.padStart(2,'0')}${districtCode.padStart(2,'0')}${wardCode.padStart(1,'0')}`
  const seq   = String(Math.floor(Math.random() * 90000) + 10000).padStart(5, '0')
  const cc    = String(Math.floor(Math.random() * 90) + 10)
  return `${date}-${loc}-${seq}-${cc}`
}

// ─── No-op stubs (satisfy imports, no SQLite operations) ──────────────────────
export async function getDb(): Promise<any>           { return null }
export async function saveBirth(d: any): Promise<any> { return { ...d, id:`stub-${Date.now()}`, registeredAt:new Date().toISOString(), synced:0, certPdfPath:'' } }
export async function saveDeath(d: any): Promise<any> { return { ...d, id:`stub-${Date.now()}`, registeredAt:new Date().toISOString(), synced:0, certPdfPath:'' } }
export async function markBirthSynced(_id: string): Promise<void> {}
export async function markDeathSynced(_id: string): Promise<void> {}
export async function getAllBirths(): Promise<LocalBirth[]> { return [] }
export async function getAllDeaths(): Promise<LocalDeath[]> { return [] }
export async function getPendingBirths(): Promise<LocalBirth[]> { return [] }
export async function getPendingDeaths(): Promise<LocalDeath[]> { return [] }
export async function getBirthById(_id: string): Promise<LocalBirth | null> { return null }
export async function updateBirthCertPath(_id: string, _path: string): Promise<void> {}
export async function updateDeathCertPath(_id: string, _path: string): Promise<void> {}
export async function getLocalStats() {
  return { todayBirths:0, todayDeaths:0, monthBirths:0, monthDeaths:0, pendingSync:0, totalBirths:0, totalDeaths:0 }
}
export async function cacheOfficerData(_data: Partial<OfficerCache>): Promise<void> {}
export async function getCachedOfficerData(): Promise<Partial<OfficerCache>> { return {} }
