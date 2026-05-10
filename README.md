# ADLC-TZ — Automated Digital Live Census Tanzania

> **Classification: Government Sensitive — Internal Use Only**
> Operated under the authority of the National Bureau of Statistics (NBS), United Republic of Tanzania.

---

## System Overview

ADLC-TZ is a multi-tier government platform for real-time civil registration and population census data collection across Tanzania. The system digitises birth registration, death recording, citizen enumeration, migration tracking, and vital statistics reporting, replacing paper-based processes with audited digital workflows linked to RITA (Registration, Insolvency and Trusteeship Agency) and the National Bureau of Statistics.

**Core function:** Authorised field officers capture vital events on mobile devices within geofenced operational boundaries. All records are cryptographically authenticated, stored in a PostGIS-enabled database, and synchronised to RITA in near-real-time.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT LAYER                            │
│  React Native (Expo)          React 18 + Vite               │
│  Hospital Officer App         District/Admin Web Panel      │
│  Village Officer App          (Vercel)                      │
│  Public Citizen App                                         │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTPS / TLS 1.3
┌────────────────────▼────────────────────────────────────────┐
│                     API LAYER                               │
│  Node.js / Express (Modular Monolith)                       │
│  JWT Auth · Rate Limiting · CORS · Helmet                   │
│  Redis (Upstash) — token store, session cache               │
│  (Render — free tier, single instance)                      │
└────────────────────┬────────────────────────────────────────┘
                     │ Prisma ORM / connection pooler
┌────────────────────▼────────────────────────────────────────┐
│                   DATA LAYER                                │
│  PostgreSQL + PostGIS (Render)                              │
│  Cloudinary — certificate PDFs, biometric assets           │
└─────────────────────────────────────────────────────────────┘
```

**Architecture pattern:** Modular monolith. Microservices are not used; the single-process model is deliberate given the two-person team and free-tier infrastructure constraints.

---

## Core Components

### Mobile Applications (`code/mobile/`)

Three Expo-managed React Native apps share a single codebase via screen-level role routing:

| App | Role | Geofence Radius |
|-----|------|----------------|
| Hospital Officer | Birth/death registration at health facilities | 0.5 km |
| Village Officer  | Citizen enumeration, migration, local births/deaths | 1.0 km |
| Public Citizen   | Self-service document requests (future sprint) | — |

**Key mobile behaviours:**
- Device binding on first activation (OTP → fingerprint → password setup)
- GPS boundary enforcement — officers outside their assigned zone receive a red warning; after 3 continuous hours out of boundary the session is terminated and the officer is redirected to login
- Dark / light theme toggle applies globally to all screens and modals via React Context
- Offline-first: records are queued locally and synced to RITA on reconnection

### Backend API (`code/backend/`)

Express server providing authenticated REST endpoints for all three officer roles:

| Prefix | Purpose |
|--------|---------|
| `/api/auth` | Login, MFA, token refresh, logout |
| `/api/officer` | Dashboard stats, birth/death CRUD, certificates, sync |
| `/api/health` | Liveness and readiness probes |

### Web Admin Panel (`code/web/`)

React + Vite SPA deployed on Vercel. Used by District Administrators and NBS supervisors for officer onboarding, data review, and aggregate reporting.

---

## Security Model

### Authentication
- **JWT access tokens** — 15-minute TTL, signed with RS256
- **Refresh tokens** — 7-day TTL, SHA-256 hashed before Redis storage; raw tokens never persisted
- **MFA** — TOTP (RFC 6238) enforced for District Admin and above
- **Device binding** — each officer device is fingerprinted on first activation; login from an unrecognised device requires re-authorisation via OTP

### Authorisation
- Role-based: `super_admin`, `district_admin`, `village_officer`, `hospital_officer`, `public_user`
- All officer endpoints require a valid JWT via `Authorization: Bearer <token>`
- Officers can only read/write records within their assigned facility or village scope

### Data in Transit
- TLS 1.3 enforced end-to-end (Render HTTPS → Vercel HTTPS → Expo HTTPS)
- CORS restricted to known origins; `OPTIONS` preflight validated by Helmet

### Data at Rest
- Passwords hashed with bcrypt (12 rounds)
- Biometric templates (fingerprint) stored as opaque base64 blobs — not searchable
- Certificate PDFs stored on Cloudinary with signed URLs (1-hour expiry)
- Audit log (`audit_logs` table) captures every write operation with officer ID, timestamp, IP, and action type

### Geofence Enforcement
- Location polled every 30 seconds on-device using `expo-location`
- Haversine distance calculated client-side against facility GPS coordinates returned by the dashboard API
- 3-hour boundary violation → tokens cleared → forced re-login with Alert notification
- GPS coordinates of facilities stored in `health_facilities.gps_lat / gps_lng` (PostGIS)

### API Rate Limiting
- Global: 200 req / 15 min per IP
- Auth endpoints: 10 req / 15 min per IP (brute-force protection)

---

## External Integrations

| System | Status | Scope |
|--------|--------|-------|
| RITA (Registration, Insolvency and Trusteeship Agency) | Mocked v1 — real integration Sprint 4 | Birth/death cert sync |
| NIDA (National ID Authority) | Mocked v1 — real integration Sprint 4 | National ID validation |
| MoHCDGEC (Ministry of Health) | Mocked v1 | Facility data |
| Cloudinary | Live | Certificate PDFs, profile photos |
| Upstash Redis | Live | Token store, session cache |

---

## Repository Structure

```
ADLCS-main/
├── code/
│   ├── mobile/            # Expo React Native apps
│   │   └── src/
│   │       ├── context/   # ThemeContext, GeofenceContext
│   │       ├── navigation/# navigationService (cross-context nav)
│   │       └── screens/
│   │           ├── auth/      # LoginScreen (shared)
│   │           ├── hospital/  # HospitalHome + all sub-screens
│   │           └── village/   # VillageHome
│   ├── backend/           # Node.js/Express API
│   │   └── src/
│   │       ├── routes/    # auth.js, dashboard.js, health.js
│   │       ├── services/  # auth.service.js
│   │       ├── middleware/ # auth.js, security.js
│   │       └── lib/       # prisma, redis, jwt
│   └── web/               # React + Vite admin panel
├── System_Archtecture_and_Database_Design/
├── Project_Planning_Agile_Scrum/
└── .github/workflows/     # CI/CD pipelines
```

---

## Sprint Status

| Sprint | Focus | Status |
|--------|-------|--------|
| 0 | Infrastructure, CI/CD, DevOps | ✅ Complete |
| 1 | Auth, admin onboarding | ✅ Complete |
| 2 | Officer mobile, geofencing | 🔄 In Progress |
| 3 | Citizen registration, Redis, cron | ⏳ Planned |
| 4 | Birth/death/marriage, certificates | ⏳ Planned |
| 5 | Migrations, buildings, infrastructure | ⏳ Planned |
| 6 | Analytics, public app, security hardening | ⏳ Planned |

---

## Development Environment

**Requirements:** Node.js 20+, npm 10+, Expo CLI, Android/iOS device or emulator with Expo Go.

**Dev mode behaviour:** When running via `expo start` (Expo Go), `__DEV__ === true` causes AsyncStorage to be wiped on every app load. This re-triggers the full onboarding flow (OTP → device binding → password setup) on every QR scan, enabling consistent testing without reinstalling the app or manually clearing storage.

```bash
# Backend
cd code/backend
cp .env.example .env   # fill DATABASE_URL, REDIS_URL, JWT_SECRET, etc.
npm install
npm run dev

# Mobile
cd code/mobile
npm install
npx expo start         # scan QR with Expo Go
```

---

## Compliance

- All personal data handling complies with the Electronic and Postal Communications Act (EPOCA) of Tanzania
- Biometric data processing follows NBS data governance policy
- Audit logs are retained for a minimum of 7 years per civil registration law
- Certificate formats comply with RITA specification document CERTIFICATE_AND_ID_FORMATS.txt

---

*National Bureau of Statistics · United Republic of Tanzania · © 2026*
