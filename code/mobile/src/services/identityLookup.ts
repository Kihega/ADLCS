/**
 * identityLookup.ts — client-side rules for identifying a citizen.
 *
 * Citizens are fetched ONLY by Birth ID (BID — the main way) or by NIN
 * (verified against the NBS registry / NIDA by the backend). Names are never
 * accepted, so nobody can register a certificate for a person they typed in.
 */
export type IdKind = 'BID' | 'NIN' | null

export function classifyId(raw: string): IdKind {
  const v = (raw ?? '').trim().toUpperCase()
  if (/^BID-[A-Z0-9]{6,12}$/.test(v)) return 'BID'
  if (/^NIDA-[A-Z0-9]{12}-\d{2}$/.test(v)) return 'NIN' // legacy NBS-generated
  if (/^[\d\s-]+$/.test(v) && v.replace(/[\s-]/g, '').length === 20) return 'NIN'
  return null
}

export const isValidId = (raw: string): boolean => classifyId(raw) !== null

export const ID_HELP =
  'Enter a Birth ID starting with BID- (main way), or a 20-digit NIN such as 20020505514250000124 if the citizen has no Birth ID. Names cannot be used.'
