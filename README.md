# ADLCS — Automated Digital Live Census System

Tanzania National Bureau of Statistics (NBS) · Dissertation Research Project

> **Scope:** Self-contained model system. All data lives within the project's
> own PostgreSQL database. No external government API calls (NIDA, RITA, MoHCDGEC).

---

## Live Services

| Service  | URL | Status |
|---|---|---|
| Backend API | `https://final-dissertation-s6j8.onrender.com` | [

![Backend](https://img.shields.io/badge/render-live-green)

](https://final-dissertation-s6j8.onrender.com/api/health) |
| Web Frontend | `https://final-dissertation.vercel.app` | [

![Vercel](https://img.shields.io/badge/vercel-live-green)

](https://final-dissertation.vercel.app) |

---

## Architecture
ADLCS/
├── code/
│   ├── backend/          Node.js + Express → Render
│   │   ├── src/
│   │   │   ├── lib/          prisma.js · redis.js · jwt.js
│   │   │   ├── middleware/   security.js · auth.js
│   │   │   ├── routes/       health.js · auth.js
│   │   │   └── services/     auth.service.js
│   │   ├── prisma/           schema.prisma (699 lines, 20+ models)
│   │   ├── tests/            auth.test.js · basic.test.js
│   │   ├── Dockerfile
│   │   └── requirements.txt
│   ├── web/              React 18 + Vite → Vercel
│   └── mobile/           React Native + Expo (EAS builds)
├── .github/workflows/    backend-ci · web-ci · mobile-ci
├── docker-compose.yml
└── render.yml
---

## User Roles

| Role | Table | Dashboard |
|---|---|---|
| `super_admin` | `super_admins` | Web — full system access |
| `district_admin` | `district_admins` | Web — district scope |
| `village_officer` | `village_officers` | Mobile — field registration |
| `hospital_officer` | `hospital_officers` | Mobile — births & deaths |
| `public_user` | `public_users` | Web — read-only citizen lookup |

---

## Auth API

All auth endpoints live under `/api/auth`.

### Login (two-step when MFA is enabled)
Step 1 → POST /api/auth/login
Body: { email, password }
Returns (no MFA): { accessToken, refreshToken, profile }
Returns (MFA on): { mfaRequired: true, tempToken }
Step 2 → POST /api/auth/mfa/verify        (only when mfaRequired: true)
Body: { tempToken, code }
Returns: { accessToken, refreshToken, profile }
### Other endpoints
POST /api/auth/refresh    { refreshToken }  → { accessToken }
POST /api/auth/logout     Bearer    → 200 OK
GET  /api/auth/me         Bearer    → { data: profile }
### Token strategy

| Token | TTL | Storage | Purpose |
|---|---|---|---|
| Access | 15 min | Client memory | Authorise every API call |
| Refresh | 7 days | Redis (hash) | Rotate access token |
| Temp | 5 min | Client memory | MFA step-up only |

---

## Tech Stack

| Layer | Tool | Notes |
|---|---|---|
| Runtime | Node.js 20 LTS | |
| Framework | Express 4 | NOT Express 5 — wildcard routing changed |
| ORM | Prisma **6.19.3** | Pinned — v7 breaks `url` config |
| Database | PostgreSQL 16 + PostGIS | Supabase (West EU, Ireland) |
| Cache | Upstash Redis | Must use `rediss://` (double-s TLS) |
| Auth | JWT + speakeasy TOTP | bcryptjs for password hashing |
| Validation | Zod | All route inputs validated |
| Email | Resend | |
| Media | Cloudinary | |
| CI/CD | GitHub Actions | Tests on `develop`, deploy on merge to `main` |
| Container | Docker (Alpine) | Backend + Web only; Mobile uses EAS |

---

## Environment Variables (Backend)

```env
DATABASE_URL_POOLER=   # Supabase pooler (port 6543) — used by Prisma at runtime
DATABASE_URL=          # Supabase direct (port 5432) — used by migrations only
REDIS_URL=             # Upstash rediss:// URL
JWT_ACCESS_SECRET=     # Min 32 chars
JWT_REFRESH_SECRET=    # Min 32 chars
ENCRYPTION_KEY=        # 64 hex chars (32 bytes)
RESEND_API_KEY=
EMAIL_FROM=
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
WEB_URL=               # Vercel frontend URL (for CORS)
⚠️ If your DATABASE_URL contains @ in the password, encode it as %40.
Development Workflow
# All edits happen in Termux — push to GitHub — CI runs in the cloud

git checkout develop
# ... edit files ...
git add .
git commit -m "feat: your message"
git push origin develop

# When feature is ready:
# Open PR: develop → main → CI must be green → merge → auto-deploy
Implemented Features
[x] Infrastructure: Docker, render.yml, GitHub Actions CI
[x] Health check endpoint (GET /api/health)
[x] Auth backend: login, MFA verify, refresh, logout, me
[ ] Web: Login page
[ ] Mobile: Login screen
[ ] Super Admin dashboard
[ ] District Admin dashboard
[ ] Village Officer screens
[ ] Hospital Officer screens
Key Decisions & Gotchas
Issue
Fix
Prisma v7 breaks url in schema
Pinned to v6.19.3
Render deployment
Use postinstall: prisma generate
Express 5 wildcard routing
Use Express 4, plain middleware 404 handler
Supabase port 5432 blocked on mobile
Run migrations via Supabase SQL Editor
Redis TLS
Must use rediss:// (double-s)
@ in DATABASE_URL password
Encode as %40
React Router on Vercel
Requires vercel.json rewrites
Jest imports index.js
Guard startServer() with require.main === module
Dissertation — Tanzania NBS · GitHub: Kihega/ADLCS

---

## Web Login Page

Live at: `https://final-dissertation.vercel.app/login`

### What is built
- Full two-step login flow (password → optional MFA TOTP)
- Zustand auth store — access token in memory, refresh token in localStorage
- Axios client with automatic silent token refresh on 401
- Protected routes with role-based redirection
- Session restoration on page reload (SilentRefresh on app mount)
- Placeholder dashboards for all 5 roles (real dashboards built next)

### Login flow (web)
User enters email + password
↓
POST /api/auth/login
↓ mfaRequired: false     → tokens issued → redirect to role dashboard
↓ mfaRequired: true      → step 2 shown
User enters 6-digit TOTP
↓
POST /api/auth/mfa/verify
↓
tokens issued → redirect to role dashboard

---

## UI Update — Login, Dashboards & Mobile Login

### Web Login Page (redesigned)
- **Layout:** Horizontal top banner (flag bg + coat of arms + NBS title + logo in one row) with Tanzania flag colour stripe
- **Bottom:** Centred auth card — identical multi-mode logic (login → MFA → token → registration → success)
- **Modes shared** by Super Admin and District Admin

### District Admin Dashboard
- Derived from SuperAdminDashboard — same visual design, same components
- **Scope:** All data, stats, maps filtered to the admin's assigned district
- **Removed** (super admin only): District Admins mgmt, System Performance, Security Alerts, System Log Reports
- **Added:** Facility Management, Manage Officers, District Reports
- **Stats:** District Population · Village Officers · Hospital Officers · Registered Facilities

### Mobile Login Screen (shared: Village Officer + Hospital Officer)
File: `code/mobile/src/screens/auth/LoginScreen.tsx`

**First-open Device Activation flow** (system design §2.4 / §2.5):
1. Modal appears immediately, blocks login form
2. Officer enters one-time token from email (10-min countdown)
3. Background: device fingerprint captured, GPS recorded, geo-fence downloaded
4. AsyncStorage key `adlcs_device_activated = true` persisted
5. Modal dismissed → login form fades in

**Login flow:**
- Step 1: email + password → backend `/api/auth/login`
- Step 2 (if MFA): 6-digit TOTP → `/api/auth/mfa/verify`
- Role routing: `village_officer` → VillageHome, `hospital_officer` → HospitalHome
