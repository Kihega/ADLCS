/**
 * session.ts — the signed-in officer's session, in one place.
 *
 * Every piece of per-user state on the device (tokens, role, name, employee
 * id, theme preference, bell state, last-sync, offline outbox) belongs to the
 * officer who is signed in right now:
 *
 *   startSession()  — login. Wipes anything a previous user left behind, then
 *                     stores the new officer's session.
 *   endSession()    — sign-out. Idempotent (many callers can trigger it, only
 *                     one run happens): revokes the refresh token on the
 *                     server (best effort), wipes every per-user key, tells
 *                     the theme to fall back to the default, and RESETS the
 *                     navigation stack to Login (never a second `replace`).
 *   goToLogin()     — safe, idempotent redirect used by screens that notice
 *                     there is no token (e.g. the 60 s polling loop).
 *
 * A theme choice, an unsynced record, a dismissed bell … made by officer A is
 * therefore invisible to officer B who signs in on the same phone.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { navigationRef } from '../navigation/navigationService'
import { resolveBase } from './apiResolver'

/** Every key that is scoped to the signed-in officer and wiped at sign-out. */
export const SESSION_KEYS = [
  'tzcrvs_access_token',
  'tzcrvs_refresh_token',
  'tzcrvs_role',
  'tzcrvs_officer_name',
  'tzcrvs_employee_id',
  'tzcrvs_device_activated',
  'tzcrvs_bell_dismissed_date',
  'tzcrvs_last_sync',
]

export type SessionEvent = 'start' | 'end'
type Listener = (event: SessionEvent) => void
const listeners = new Set<Listener>()

/** Subscribe to login / sign-out. Returns the unsubscribe function. */
export function subscribeSession(fn: Listener): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function notifySessionChanged(event: SessionEvent = 'start'): void {
  listeners.forEach((fn) => {
    try {
      fn(event)
    } catch {
      /* a listener must never break the session flow */
    }
  })
}

export type StartSessionInput = {
  accessToken: string
  refreshToken: string
  role: string
  fullName: string
  employeeId: string
}

export async function startSession(input: StartSessionInput): Promise<void> {
  // Purge whatever a previous officer left on this device first.
  try {
    await AsyncStorage.multiRemove(SESSION_KEYS)
  } catch {
    /* best effort */
  }
  await AsyncStorage.multiSet([
    ['tzcrvs_access_token', input.accessToken],
    ['tzcrvs_refresh_token', input.refreshToken],
    ['tzcrvs_role', input.role],
    ['tzcrvs_officer_name', input.fullName],
    ['tzcrvs_employee_id', input.employeeId],
  ])
  notifySessionChanged('start')
}

/** Redirect to Login once — does nothing if we are already there. */
export function goToLogin(): void {
  if (!navigationRef.isReady()) return
  if (navigationRef.getCurrentRoute()?.name === 'Login') return
  navigationRef.reset({ index: 0, routes: [{ name: 'Login' }] })
}

let ending: Promise<void> | null = null

export function isEndingSession(): boolean {
  return ending !== null
}

async function revokeOnServer(token: string): Promise<void> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 4000)
  try {
    const base = await resolveBase()
    await fetch(`${base}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      signal: ctrl.signal,
    })
  } catch {
    /* offline / expired token — the local sign-out must still succeed */
  } finally {
    clearTimeout(timer)
  }
}

/** Sign the current officer out. Safe to call repeatedly. Never rejects. */
export function endSession(): Promise<void> {
  if (ending) return ending
  ending = (async () => {
    try {
      const token = await AsyncStorage.getItem('tzcrvs_access_token')
      if (token) await revokeOnServer(token)
    } catch {
      /* ignore */
    }
    try {
      await AsyncStorage.multiRemove(SESSION_KEYS)
    } catch {
      /* ignore */
    }
    notifySessionChanged('end') // theme → default, everything per-user resets
    goToLogin()
  })().finally(() => {
    ending = null
  })
  return ending
}
