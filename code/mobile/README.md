# ADLC-TZ Mobile  —  Hospital & Village Officer Apps

> **Government internal use only** · NBS Tanzania · Expo SDK 51 · React Native

---

## Purpose

Three role-specific screens share this Expo codebase and connect to the ADLCS backend API. The apps are the primary data-capture interface for civil registration events (births, deaths, migrations, citizen enumeration) across Tanzania's health facilities and village administrative units.

---

## Screen Map

```
Splash
  └─ Login (OTP → device-bind → password-setup → login form → MFA)
       ├─ HospitalHome
       │    ├─ RegisterBirth   (multi-step form)
       │    ├─ RecordDeath     (citizen lookup → death details → cert)
       │    ├─ IssueCertificate(birth/death cert generation)
       │    ├─ ViewRecords     (paginated list, search, filter)
       │    ├─ PendingCases    (unresolved / unsynced records)
       │    └─ SyncData        (RITA sync status + manual trigger)
       └─ VillageHome
            ├─ RegisterCitizen (Sprint 3)
            ├─ RecordBirth     (Sprint 3)
            ├─ RecordDeath     (Sprint 3)
            ├─ RecordMigration (Sprint 5)
            └─ Reports         (Sprint 6)
```

---

## Security Behaviours

### Authentication Flow

1. **New device:** OTP sent to registered email → officer enters OTP → app captures device fingerprint + GPS → officer sets password → backend binds fingerprint to account
2. **Returning device:** email + password → (optional) TOTP MFA → JWT pair issued
3. **Token storage:** access token and refresh token stored in `AsyncStorage` under `adlcs_*` keys — never in-memory only
4. **Token lifecycle:** access token 15 min; refresh token 7 days; refresh token hash stored in Redis (SHA-256); raw token never leaves the device unencrypted in transit (TLS 1.3)

### Geofence Enforcement

| Role | Boundary | Poll Interval | Timeout |
|------|----------|---------------|---------|
| Hospital Officer | 0.5 km from facility GPS | 30 s | 3 hours |
| Village Officer  | 1.0 km from village centroid | 30 s | 3 hours |

- **In zone:** green badge, `✓ In Zone · X.XX km`
- **Out of zone:** red badge + ⚠ icon, `✗ Out of Zone · X.XX km`
- **3 hours out:** all tokens and activation keys cleared → forced navigate to Login with Alert popup warning

### Development Mode

When `__DEV__ === true` (Expo Go), `AsyncStorage` is wiped on every app mount. This forces the full onboarding flow on every QR scan, allowing the complete auth + device-binding flow to be tested on any device without reinstalling.

The boundary timeout is also shortened to **5 minutes** in `__DEV__` mode to allow geofence-logout testing.

---

## Global State

| Context | Provides | Consumed by |
|---------|----------|-------------|
| `ThemeContext` | `isDark`, `theme`, `toggleTheme` | All screens, all modals |
| `GeofenceContext` | `inZone`, `distanceKm`, `outSince`, `setGeofenceConfig` | HospitalHome, VillageHome |

The theme toggle in either dashboard changes the colour scheme for **all** screens and modals globally. No per-screen `isDark` state exists.

---

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `expo-location` | GPS polling for geofence |
| `expo-device` | Device fingerprint on activation |
| `@react-native-async-storage/async-storage` | Token / session persistence |
| `expo-linear-gradient` | Header gradient overlays |
| `lucide-react-native` | Icon system |
| `@react-navigation/native-stack` | Screen navigation |
| `react-native-safe-area-context` | Edge insets |

---

## Environment Variables

Create `code/mobile/.env` (not committed):

```
EXPO_PUBLIC_API_URL=https://adlcs-backend.onrender.com/api
```

For local development:

```
EXPO_PUBLIC_API_URL=http://<your-local-ip>:5000/api
```

---

## Running Locally

```bash
cd code/mobile
npm install
npx expo start          # Expo Go — scan QR on Android/iOS
```

Tested on: Kali Linux (Termux/Android), Expo Go 2.31+.

---

*NBS Tanzania · ADLC-TZ Mobile v3.0 · © 2026*
