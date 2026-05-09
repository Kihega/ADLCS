# ADLCS — Web Frontend

React 18 + Vite + TypeScript → Deployed on Vercel

Live: `https://final-dissertation.vercel.app`

---

## Tech Stack

| Tool       | Version | Notes                              |
|------------|---------|------------------------------------|
| React      | 18      | Hooks, context, Suspense           |
| Vite       | 5       | HMR, optimized builds              |
| TypeScript | 5       | Strict mode                        |
| Zustand    | latest  | Auth store (access token in memory)|
| Axios      | latest  | Auto silent token refresh on 401   |

---

## Pages

| Route             | Role             | Status        |
|-------------------|------------------|---------------|
| `/login`          | All roles        | ✅ Built       |
| `/super-admin`    | Super Admin      | ✅ Placeholder |
| `/district-admin` | District Admin   | ✅ Placeholder |

---

## Auth Flow (Web)

```
User → email + password → POST /api/auth/login
         ↓ mfaRequired: false → tokens → role dashboard
         ↓ mfaRequired: true  → 6-digit TOTP step
                                POST /api/auth/mfa/verify
                                → tokens → role dashboard
```

---

## Dev

```bash
cd code/web
npm install
npm run dev
```

---

## Build

```bash
npm run build
```

Output: `dist/` — deployed automatically by Vercel on merge to `main`.

---

## ESLint

```bash
npm run lint
```

For production TypeScript projects, enable type-aware lint rules:
see [typescript-eslint](https://typescript-eslint.io).
