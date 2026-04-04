# Automated Digital Live Census for Tanzania
**National Bureau of Statistics (NBS) — Research Model**

## Project Structure
Final_Dissertation/
├── code/
│   ├── backend/     # Node.js + Express API
│   ├── web/         # React + Vite (Admin Dashboards)
│   └── mobile/      # React Native + Expo (Officer + Citizen Apps)
├── Project_Planning_Agile_Scrum/
├── Project_Proposal/
└── System_Architecture_and_Database_Design/
## Tech Stack
| Layer | Technology | Hosting |
|-------|-----------|---------|
| Web Admin | React 18 + Vite + TailwindCSS | Vercel |
| Mobile Apps | React Native + Expo | Expo EAS |
| Backend API | Node.js 20 + Express.js | Render |
| Database | PostgreSQL 16 + PostGIS | Render |
| Cache | Redis 7 | Upstash |
| Storage | Cloudinary | Cloudinary |

## Quick Start

### Prerequisites
- Node.js v20+
- Git
- Expo Go (on Android device for mobile testing)

### Backend Setup
```bash
cd code/backend
npm install
cp .env.example .env
# Fill in .env values
npx prisma migrate dev
npm run dev
Web Setup
cd code/web
npm install
cp .env.example .env
npm run dev
Mobile Setup
cd code/mobile
npm install
cp .env.example .env
npx expo start --tunnel
Sprint Progress
[x] Sprint 0 — Infrastructure & DevOps Setup
[ ] Sprint 1 — Authentication & Admin Onboarding
[ ] Sprint 2 — Officer Mobile Onboarding & Geo-Fence
[ ] Sprint 3 — Citizen Registration
[ ] Sprint 4 — Births, Deaths & Marriages
[ ] Sprint 5 — Migrations, Buildings & Infrastructure
[ ] Sprint 6 — Analytics Dashboard & Final QA
Developer
Kihega — National Bureau of Statistics Research Project
