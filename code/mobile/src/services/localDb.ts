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
  originVillageId?: number // family's home village/street of origin (from GeoCascadePicker)
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
// PATCH-PRIVACY-2026: neither ID format below encodes date of birth (or any
// other personal detail) any more — regulatory/privacy requirement. Both are
// opaque, high-entropy random identifiers; uniqueness is enforced by the
// database UNIQUE constraint server-side (with retry on collision). The `dob`
// (and region/district/ward) parameters are kept-but-unused so existing call
// sites don't need to change.
const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I — avoids confusion
function randomIdBlock(len: number): string {
  let out = ''
  for (let i = 0; i < len; i++) out += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)]
  return out
}

/**
 * generateBirthId — Birth Registration tracking ID
 *
 * Format: BID-XXXXXXXXXX (10 chars, opaque — no DOB or other PII derivable)
 *
 * This ID is stored with the birth record and presented to the family.
 * At age 18 a Village Officer enters this ID to look up the birth record
 * and issue the citizen's National ID (NIN).
 *
 * NO NIN is generated at birth — NIN issuance is a Village Officer workflow.
 */
export function generateBirthId(_dob?: string): string {
  return `BID-${randomIdBlock(10)}`
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

// National ID (NIN) — format: NIDA-XXXXXXXXXXXX-CC
export function generateNationalId(
  _dob?: string,
  _regionCode?: string,
  _districtCode?: string,
  _wardCode?: string
): string {
  const cc = String(Math.floor(Math.random() * 90) + 10)
  return `NIDA-${randomIdBlock(12)}-${cc}`
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
