/**
 * localDb.ts  v10.0  STUBS ONLY — online-only mode
 *
 * SQLite / expo-sqlite completely removed.
 * ALL registration data goes directly to the backend (Render) → Supabase.
 *
 * Retained exports:
 *   • Type definitions  (LocalBirth, LocalDeath) — used by screens
 *   • BID / cert generators — used by form screens to pre-fill numbers
 *   • No-op async stubs — satisfy any remaining imports without crashing
 *
 * ⚠️  NO NIN IS GENERATED AT BIRTH.
 *     generateNewbornNationalId() is intentionally removed.
 *     NIN issuance is a Village Officer workflow triggered at age 18
 *     when the citizen presents their Birth Registration ID (BID).
 */

// ─── Types ─────────────────────────────────────────────────────────────────────
export interface LocalBirth {
  id: string
  certNo: string
  birthId: string // Birth Registration ID — NIN issued at age 18
  childFirstName: string
  childMiddleName: string
  childSurname: string
  gender: string
  dateOfBirth: string // DD/MM/YYYY
  fatherName: string
  fatherNid: string
  motherName: string
  motherNid: string
  facilityName: string
  facilityDistrict: string
  facilityRegion: string
  officerName: string
  registeredAt: string // ISO
  synced: number // 0 | 1
  certPdfPath: string
  rawJson: string
  nationalId?: string // NIN — undefined/empty until issued at age 18
}

export interface LocalDeath {
  id: string
  certNo: string
  nationalId: string
  deceasedName: string
  causeOfDeath: string
  dateOfDeath: string // DD/MM/YYYY
  locationType: string
  category: string
  informantName: string
  facilityName: string
  officerName: string
  registeredAt: string
  synced: number
  certPdfPath: string
  rawJson: string
}

export interface LocalMarriage {
  id: string
  certNo: string
  husbandName: string
  husbandNid: string
  wifeName: string
  wifeNid: string
  marriageDate: string // DD/MM/YYYY
  marriagePlace: string
  marriageType: string // civil | religious | customary
  witness1Name: string
  witness2Name: string
  officerName: string
  registeredAt: string // ISO
}

export interface OfficerCache {
  officerName: string
  facilityName: string
  facilityType: string
  facilityGrade: string
  facilityRegion: string
  facilityDistrict: string
  facilityGpsLat: string
  facilityGpsLng: string
  todayBirths: number
  todayDeaths: number
  monthBirths: number
  monthDeaths: number
  pendingCases: number
  facilityCertIssued: number
  facilityDeliveries: number
}

// ─── Cert / ID generators ──────────────────────────────────────────────────────
/**
 * generateBirthId — Birth Registration tracking ID
 *
 * Format: BID-YYYYMMDD-XXXXXXX
 * Example: BID-20260601-3847291
 *
 * This ID is stored with the birth record and presented to the family.
 * At age 18 a Village Officer enters this ID to look up the birth record
 * and issue the citizen's National ID (NIN).
 *
 * NO NIN is generated at birth — NIN issuance is a Village Officer workflow.
 */
export function generateBirthId(dob: string): string {
  const parts = dob.split('/')
  const day = (parts[0] ?? '01').padStart(2, '0')
  const month = (parts[1] ?? '01').padStart(2, '0')
  const year = parts[2] ?? String(new Date().getFullYear())
  const date = `${year}${month}${day}`
  const seq = String(Math.floor(Math.random() * 9000000) + 1000000)
  return `BID-${date}-${seq}`
}

export function generateBirthCertNo(): string {
  const seq = Math.floor(Math.random() * 90000000 + 10000000)
  return `${seq} A`
}

export function generateDeathCertNo(): string {
  const seq = Math.floor(Math.random() * 90000000 + 10000000)
  return `TZ-D-${seq} A`
}

// generateNewbornNationalId() REMOVED — NIN is NOT issued at birth.
// Village Officer issues NIN at age 18 via the NIN issuance workflow.

export function generateNationalId(
  dob: string,
  regionCode = '07',
  districtCode = '03',
  wardCode = '1'
): string {
  const parts = dob.split('/')
  const day = (parts[0] ?? '01').padStart(2, '0')
  const month = (parts[1] ?? '01').padStart(2, '0')
  const year = parts[2] ?? '2026'
  const date = `${year}${month}${day}`
  const loc = `${regionCode.padStart(2, '0')}${districtCode.padStart(2, '0')}${wardCode.padStart(1, '0')}`
  const seq = String(Math.floor(Math.random() * 90000) + 10000).padStart(5, '0')
  const cc = String(Math.floor(Math.random() * 90) + 10)
  return `${date}-${loc}-${seq}-${cc}`
}

// ─── No-op stubs (satisfy imports, no SQLite operations) ──────────────────────
export async function getDb(): Promise<any> {
  return null
}
export async function saveBirth(d: any): Promise<any> {
  return {
    ...d,
    id: `stub-${Date.now()}`,
    registeredAt: new Date().toISOString(),
    synced: 0,
    certPdfPath: '',
  }
}
export async function saveDeath(d: any): Promise<any> {
  return {
    ...d,
    id: `stub-${Date.now()}`,
    registeredAt: new Date().toISOString(),
    synced: 0,
    certPdfPath: '',
  }
}
export async function markBirthSynced(_id: string): Promise<void> {}
export async function markDeathSynced(_id: string): Promise<void> {}
export async function getAllBirths(): Promise<LocalBirth[]> {
  return []
}
export async function getAllDeaths(): Promise<LocalDeath[]> {
  return []
}
export async function getPendingBirths(): Promise<LocalBirth[]> {
  return []
}
export async function getPendingDeaths(): Promise<LocalDeath[]> {
  return []
}
export async function getBirthById(_id: string): Promise<LocalBirth | null> {
  return null
}
export async function updateBirthCertPath(_id: string, _path: string): Promise<void> {}
export async function updateDeathCertPath(_id: string, _path: string): Promise<void> {}
export async function getLocalStats() {
  return {
    todayBirths: 0,
    todayDeaths: 0,
    monthBirths: 0,
    monthDeaths: 0,
    pendingSync: 0,
    totalBirths: 0,
    totalDeaths: 0,
  }
}
export async function cacheOfficerData(_data: Partial<OfficerCache>): Promise<void> {}
export async function getCachedOfficerData(): Promise<Partial<OfficerCache>> {
  return {}
}
