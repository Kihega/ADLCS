# ADLCS — Tanzania Civil Registration & Vital Statistics (TzCRVS)

A digital Civil Registration and Vital Statistics (CRVS) platform for the
National Bureau of Statistics (NBS), Tanzania. It replaces paper-based birth,
death, marriage, and internal-migration registration with a role-based
mobile app for field officers and a web dashboard for administrators —
built around a single, privacy-safe **Birth ID (BID)** as the canonical
identifier for every citizen.

## Video demonstration

A recorded walkthrough of the mobile app is attached to this repository's
**Issues** tab (not embedded here, since GitHub doesn't host video in
Markdown reliably at any size). Open the Issues tab and look for the pinned
demo issue.

## Architecture

```
code/
├── backend/    Node.js + Express API, PostgreSQL via Prisma ORM
├── web/        React + Vite admin dashboard (Super Admin / District Admin)
├── mobile/     React Native (Expo) app — Village Officer & Hospital Officer
└── public_mobile/   (removed — was a stub for an unbuilt public-facing app)
```

### Backend

- **Runtime:** Node.js, Express
- **Database:** PostgreSQL, accessed through Prisma ORM
- **Auth:** email + password, bcrypt-hashed, JWT access/refresh tokens, optional
  TOTP-based MFA for admin accounts
- **Email:** [Resend](https://resend.com) — used only for a one-way welcome
  notice on account creation (role + default password); never required to
  complete registration or log in
- Route modules live under `code/backend/src/routes/`:
  - `auth.js` — login, MFA verification, token refresh
  - `admin.js` — Super Admin / District Admin dashboards, admin & officer
    account management, RITA/NIDA/migration analytics
  - `dashboard.js` — Hospital/Village Officer dashboards, national citizen
    lookup (by Birth ID)
  - `village.js` — birth/death/marriage/migration/NIN-issuance workflows,
    village-scoped citizen lookup
  - `geo.js` — region/district/ward/village reference data
  - `syncRoutes.js` — offline-first sync endpoints for the mobile app

### Web admin dashboard

React + Vite, Tailwind utility classes, Recharts for the trend cards. Two
roles: **Super Admin** (national scope — manages District Admins, views
national RITA/NIDA/migration trends and audit logs) and **District Admin**
(manages Village/Health Officers within their own district).

### Mobile app

Expo/React Native, offline-first (local SQLite cache + background sync).
Two roles:

- **Village Officer** — citizen registration, NIN issuance, death
  registration, marriage registration, migration (outgoing requests +
  incoming confirmation by Birth ID + token)
- **Hospital Officer** — birth registration, death registration, birth
  certificate issuance

## Identity model: Birth ID (BID) as the single source of truth

Every citizen is issued a **Birth ID (BID)** — an opaque, high-entropy
identifier (e.g. `BID-7F3K9QXTZ2`) that encodes **no personal information**,
unlike the National ID (NIN, format `NIDA-XXXXXXXXXXXX-CC`), which a citizen
only ever receives *after* already having a BID. Because of that ordering,
**BID alone is sufficient** to look up an existing citizen anywhere in the
system — there is no need to also collect or re-enter their NIN:

- Father/mother lookup during birth registration
- Spouse lookup during marriage registration
- Citizen lookup during death registration
- Citizen lookup during migration (outgoing issue + incoming confirmation)
- Identity confirmation when registering a new admin/officer account (their
  own BID search auto-fills their name from the citizen registry and links
  the new account to that citizen record via a real foreign key)

Neither ID format is derived from date of birth or any other personal
attribute — both are randomly generated and enforced unique at the database
level, satisfying data-protection requirements while still guaranteeing
uniqueness.

## Admin & officer account provisioning

Registering a National Admin, District Admin, Village Officer, or Hospital
Officer is a single BID-driven flow:

1. Search the person's Birth ID — their name, gender, and NIN are pulled
   from the citizen registry and shown for confirmation.
2. Fill in email, phone, employee ID, and role-specific fields (Region/
   District for a District Admin; Region/District/Ward/Village for a
   Village Officer; a facility name for a Hospital Officer, which is
   found-or-created automatically).
3. Submit. The account is created **active immediately** with a default
   password (pre-filled `Admin@1234`, editable) — no email verification
   step, no one-time token, no separate activation flow on either mobile or
   web. The password is shown once for the admin to relay directly, and a
   short welcome email is sent as a courtesy notice (role + password +
   a reminder to change it within 3 days).

Deleting an admin/officer account that has created other accounts or
handled live registrations is intentionally blocked with a clear error —
the system will never silently cascade-delete real civil-registration data.
Deleting officer/admin accounts is restricted to national-scope (Super
Admin) accounts.

## Getting started

### Prerequisites

- Node.js 18+
- PostgreSQL (or a Supabase project)
- npm

### Backend

```bash
cd code/backend
npm install
cp .env.example .env   # fill in DATABASE_URL, JWT secrets, RESEND_API_KEY, etc.
npx prisma generate
node prisma/seed.js     # optional — creates test National/District Admins,
                        # a Village/Hospital Officer, and two test citizens,
                        # all at Iringa / Mufindi District Council
npm run dev
```

> This project applies schema changes via the hand-written SQL files in
> `code/backend/prisma/manual_sql/` (run against your Postgres instance,
> then `npx prisma generate`) rather than `prisma migrate`. Apply them in
> filename order.

### Web admin dashboard

```bash
cd code/web
npm install
npm run dev
```

### Mobile app

```bash
cd code/mobile
npm install
npx expo start
```

## Default test accounts (after seeding)

All test accounts use the default password `Admin@1234`.

| Role            | Name                  | Email                     | Scope                            |
|-----------------|-----------------------|----------------------------|-----------------------------------|
| National Admin  | Sina Ngusa Kishosha   | sinakishosha@gmail.com     | National                          |
| District Admin  | Kishosha Sina Ngusa   | kuhega2025@gmail.com       | Iringa / Mufindi District Council |
| Village Officer | Village Officer Test  | village@adlcs.tz           | Ikanga village, Mdabulo ward      |
| Hospital Officer| Hospital Officer Test | hospital@adlcs.tz          | Mufindi District Council          |

## Key workflows

- **Birth registration** (Hospital Officer) → generates a Birth ID (BID),
  father/mother looked up by BID.
- **NIN issuance** (Village Officer, at citizen's 18th birthday) → looks up
  the birth record by BID, issues a National ID (NIN) and links it to the
  same citizen record.
- **Migration** — Outgoing: source Village Officer issues a migration token
  valid for **one week**. Incoming: destination Village Officer confirms
  using the citizen's BID + token; expired tokens must be reissued from the
  source village.
- **Marriage / Death registration** — spouse/citizen looked up by BID.

## License

Internal project for the National Bureau of Statistics, Tanzania. Not
licensed for external redistribution.
