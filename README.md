# ADLCS — Automated Digital Live Census System

Tanzania National Bureau of Statistics (NBS) · Dissertation Research Project

> **Scope:** Self-contained model system. All citizen data lives within the project's
> own PostgreSQL (NBS Central Database). No external government API calls (NIDA, RITA, MoHCDGEC).
> The RITA civil registry module is an **internal** NBS service.

---

## Live Services

| Service      | URL                                              | Status |
|---|---|---|
| Backend API  | `https://final-dissertation-s6j8.onrender.com`  | ![Backend](https://img.shields.io/badge/render-live-green) |
| Web Frontend | `https://final-dissertation.vercel.app`          | ![Vercel](https://img.shields.io/badge/vercel-live-green) |

---

## Repository Structure

```
ADLCS/
├── code/
│   ├── backend/           Node.js + Express → Render
│   │   ├── src/
│   │   │   ├── lib/          prisma.js · redis.js · jwt.js
│   │   │   ├── middleware/   security.js · auth.js
│   │   │   ├── routes/       health.js · auth.js
│   │   │   └── services/     auth.service.js
│   │   ├── prisma/           schema.prisma (700+ lines, 20+ models)
│   │   ├── tests/            auth.test.js · basic.test.js
│   │   ├── Dockerfile
│   │   └── requirements.txt
│   ├── web/               React 18 + Vite → Vercel
│   │   └── README.md
│   └── mobile/            React Native + Expo (EAS builds)
│       ├── App.js                         Navigation root (v2.1)
│       └── src/screens/
│           ├── SplashScreen.tsx
│           ├── auth/LoginScreen.tsx
│           ├── village/VillageHomeScreen.tsx
│           └── hospital/
│               ├── HospitalHomeScreen.tsx   ← v2.1 redesign
│               └── RegisterBirthScreen.tsx  ← NEW v2.1
├── System_Archtecture_and_Database_Design/
│   ├── system_design_V2.txt
│   └── CERTIFICATE_AND_ID_FORMATS.txt
├── .github/workflows/     backend-ci · web-ci · mobile-ci
└── render.yml
```

---

## User Roles

| Role             | Table              | Dashboard           |
|---|---|---|
| `super_admin`    | `super_admins`     | Web — full national access |
| `district_admin` | `district_admins`  | Web — district scope |
| `village_officer`| `village_officers` | Mobile — field registration |
| `hospital_officer`| `hospital_officers`| Mobile — births & deaths |
| `public_user`    | `public_users`     | Web — read-only census data |

---

## Auth API

All endpoints: `/api/auth`

### Login (two-step when MFA enabled)

```
POST /api/auth/login          { email, password }
  → no MFA:  { accessToken, refreshToken, profile }
  → MFA on:  { mfaRequired: true, tempToken }

POST /api/auth/mfa/verify     { tempToken, code }
  → { accessToken, refreshToken, profile }

POST /api/auth/refresh        { refreshToken }   → { accessToken }
POST /api/auth/logout         Bearer token       → 200 OK
GET  /api/auth/me             Bearer token       → { data: profile }
```

### Token Strategy

| Token   | TTL    | Storage      | Purpose                     |
|---------|--------|--------------|-----------------------------|
| Access  | 15 min | Client memory| Authorise every API call    |
| Refresh | 7 days | Redis (hash) | Rotate access token         |
| Temp    | 5 min  | Client memory| MFA step-up only            |

---

## Tech Stack

| Layer     | Tool                        | Notes                                 |
|-----------|-----------------------------|---------------------------------------|
| Runtime   | Node.js 20 LTS              |                                       |
| Framework | Express 4                   | NOT Express 5 — wildcard routing changed |
| ORM       | Prisma **6.19.3**           | Pinned — v7 breaks `url` config       |
| Database  | PostgreSQL 16 + PostGIS     | Supabase (West EU, Ireland)           |
| Cache     | Upstash Redis               | Must use `rediss://` (double-s TLS)   |
| Auth      | JWT + speakeasy TOTP        | bcryptjs for password hashing         |
| Validation| Zod                         | All route inputs validated            |
| Email     | Resend                      |                                       |
| Media     | Cloudinary                  |                                       |
| CI/CD     | GitHub Actions              | Tests on `develop`, deploy on `main`  |
| Container | Docker (Alpine)             | Backend + Web only; Mobile uses EAS   |
| Mobile    | React Native + Expo SDK 52  | EAS Build — Android + iOS             |

---

## Environment Variables (Backend)

```env
DATABASE_URL_POOLER=   # Supabase pooler (port 6543) — Prisma runtime
DATABASE_URL=          # Supabase direct (port 5432) — migrations only
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
```

> ⚠️ If DATABASE_URL contains `@` in the password, encode it as `%40`.

---

## Development Workflow

```bash
git checkout develop
# ... edit files ...
git add .
git commit -m "feat: your message"
git push origin develop

# When feature ready:
# Open PR: develop → main → CI green → merge → auto-deploy
```

---

## Implemented Features

### Infrastructure
- [x] Docker, render.yml, GitHub Actions CI
- [x] Health check endpoint `GET /api/health`
- [x] Auth backend: login, MFA verify, refresh, logout, me

### Web
- [x] Login page (two-step: password → optional MFA TOTP)
- [x] Super Admin dashboard (placeholder)
- [x] District Admin dashboard (placeholder)

### Mobile — v2.1 (current)
- [x] Splash screen
- [x] Login screen with device activation flow
- [x] Village Officer home screen
- [x] **Hospital Officer home screen** (redesigned v2.1):
  - Header: NBS logo | NBS-CENSUS title | National Coat of Arms
  - Sub-header: role badge · location | ☀/🌙 toggle · 🔔 bell · avatar ▾
  - Profile dropdown: Settings + Sign Out (animated, icon + label)
  - Tanzania flag background visible (blurRadius reduced to 2)
  - Quick Actions: 6 buttons arranged as 2 rows of 3
  - Today's stats · Facility info · Recent activity · Footer
- [x] **Register Birth screen** (NEW v2.1) — system design §2.7:
  - Step 1: Child details (name, gender, date of birth)
  - Step 2: Father NID lookup → validate in internal DB → confirm card
  - Step 3: Mother NID lookup → validate in internal DB → confirm card
  - Step 4: Review summary + officer declaration
  - Success modal: auto-generated child NID + birth certificate number
  - Test parents pre-loaded (auto-fill buttons for quick testing)

### Pending
- [ ] Village Officer screens (citizen registration, marriage, migration, buildings)
- [ ] Hospital Officer: Record Death screen
- [ ] Hospital Officer: Issue Certificate screen
- [ ] Super Admin & District Admin full dashboards

---

## Key Decisions & Gotchas

| Issue | Fix |
|---|---|
| Prisma v7 breaks `url` in schema | Pinned to v6.19.3 |
| Render deployment | `postinstall: prisma generate` |
| Express 5 wildcard routing | Use Express 4, plain middleware 404 handler |
| Supabase port 5432 blocked on mobile | Run migrations via Supabase SQL Editor |
| Redis TLS | Must use `rediss://` (double-s) |
| `@` in DATABASE_URL password | Encode as `%40` |
| React Router on Vercel | `vercel.json` rewrites required |
| Jest imports index.js | Guard `startServer()` with `require.main === module` |
| App.js kept as `.js` | Expo `registerRootComponent` needs JS entry; all screens are `.tsx` |

---

## Mobile — Test Credentials

Hospital Officer login (development/demo):

```
Email:    hospital.officer@adlcs.tz
Password: Demo@1234
Role:     hospital_officer
Facility: Dodoma Regional Hospital
```

### Test Parents for Birth Registration

| Role   | Name                    | National ID                  | Age |
|--------|-------------------------|------------------------------|-----|
| Father | John Michael Makonde    | `19850315-07031-00001-24`    | 41  |
| Mother | Grace Rose Mwamba       | `19880622-07031-00002-13`    | 37  |

Use the **⚡ Auto-fill test ID** button on the father/mother steps,
or type the NID manually and tap **Search**.

---

*Dissertation — Tanzania NBS · GitHub: Kihega/ADLCS*
