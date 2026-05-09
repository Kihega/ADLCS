# ADLCS — Mobile App

React Native + Expo SDK 52 · EAS Build (Android & iOS)

Used by: **Village Officers** and **Hospital Officers**

---

## Screens

```
src/screens/
├── SplashScreen.tsx                 Animated launch screen
├── auth/
│   └── LoginScreen.tsx             Device activation + login (shared)
├── village/
│   └── VillageHomeScreen.tsx       Village officer dashboard
└── hospital/
    ├── HospitalHomeScreen.tsx      Hospital officer dashboard  ← v2.1 redesign
    └── RegisterBirthScreen.tsx     Birth registration wizard  ← NEW v2.1
```

---

## Navigation (App.js)

```
Splash → Login → VillageHome
                → HospitalHome → RegisterBirth
```

All screens use `NativeStackNavigator` with `headerShown: false`.
`RegisterBirth` uses `animation: 'slide_from_right'`.

---

## Hospital Officer Home — v2.1 Changes

### Header row (flag background, blurRadius = 2)
| Position | Element |
|---|---|
| LEFT   | NBS logo in gold-bordered circle |
| CENTRE | NBS-CENSUS title · gold divider · "Census for Development" |
| RIGHT  | **National Coat of Arms** in circle (replaced old profile avatar + employee ID) |

### Sub-header row (below title)
| Side | Elements |
|---|---|
| LEFT  | Role badge (HEALTH FACILITY OFFICER) · facility location |
| RIGHT | ☀/🌙 dark/light toggle · 🔔 notification bell (with badge) · profile avatar ▾ |

**Profile avatar dropdown** (animated fade + slide):
| Item | Icon | Colour |
|---|---|---|
| Settings | ⚙ Settings | Teal |
| Sign Out | ↩ Sign Out | Red |

### Other changes
- Flag `blurRadius` **5–6 → 2** (Tanzania flag colours now clearly visible)
- Gradient overlay opacity reduced to match
- Employee ID text **removed** entirely
- Quick Actions: **2 rows of 3** (was 1 implicit row of 6, wrapped by flexWrap)

---

## Register Birth Screen — System Design §2.7

4-step wizard. Launched by tapping **Register / Birth** quick action.

### Step 1 — Child Information
Fields: First name · Middle name · Surname · Gender (Male/Female toggle) · Date of Birth

### Step 2 — Father Identification
- Text input for National ID (`YYYYMMDD-LLLLL-SSSSS-CC`)
- **Search** button → mock async lookup (900 ms simulated latency)
- Validates: record exists · vital_status = ALIVE · age ≥ 18 · gender = MALE
- On success: citizen card with full profile (name, DOB, region, district, village, occupation, blood group)
- ⚡ Auto-fill button for quick testing

### Step 3 — Mother Identification
Same as Step 2 but gender = FEMALE.

### Step 4 — Review & Submit
- Child summary (name, gender, DOB, facility)
- Father & mother name + NID
- Officer declaration under Cap 108 R.E. 2002
- **Register Birth** button → 1.4 s simulated submission

### Success Modal (animated spring scale-in)
- Auto-generated child National ID (`YYYYMMDD-07031-SSSSS-CC`)
- Birth certificate number (`XXXXXXXX A`)
- RITA sync note
- Done → navigate back to HospitalHome

---

## Test Data

### Hospital Officer Login
```
Email:    hospital.officer@adlcs.tz
Password: Demo@1234
```

### Test Parents (pre-seeded mock DB in RegisterBirthScreen.tsx)

**Father**
```
Name:       John Michael Makonde
NID:        19850315-07031-00001-24
DOB:        15 March 1985  ·  Age: 41
Gender:     MALE  ·  Status: ALIVE
Occupation: Civil Engineer
Region:     Dar es Salaam  ·  District: Kinondoni
Ward:       Mwananyamala   ·  Village:  Kinondoni
Blood:      O+  ·  Marital: MARRIED
```

**Mother**
```
Name:       Grace Rose Mwamba
NID:        19880622-07031-00002-13
DOB:        22 June 1988  ·  Age: 37
Gender:     FEMALE  ·  Status: ALIVE
Occupation: Registered Nurse
Region:     Dar es Salaam  ·  District: Kinondoni
Ward:       Mwananyamala   ·  Village:  Kinondoni
Blood:      A+  ·  Marital: MARRIED
```

Both parents satisfy all validation rules (alive, 18+, correct gender).
Use **⚡ Auto-fill test ID** to populate and search automatically.

---

## Running Locally

```bash
cd code/mobile
npm install
npx expo start
# Scan QR with Expo Go, or press 'a' (Android) / 'i' (iOS)
```

## EAS Build

```bash
eas build --profile development --platform android
eas build --profile production  --platform all
```

---

## Assets

```
public/assets/
├── flag.jpg           Tanzania flag (header ImageBackground)
├── court_of_arm.png   National Coat of Arms (header right)
├── longo_nbs.png      NBS logo (header left)
├── buildings.jpg      (future use)
└── people.jpg         (future use)
```

---

## Implementation Notes

| Topic | Detail |
|---|---|
| `App.js` kept as `.js` | Expo `registerRootComponent` entry must be JS; all screens are `.tsx` |
| `blurRadius` | Set to `2` on the flag `ImageBackground` for visibility |
| Gradient overlay | Lower opacity (`0.70/0.65`) so flag colours show through |
| Coat of Arms | `require('../../../public/assets/court_of_arm.png')` — 50×50 circle |
| Dropdown | `position: absolute`, `zIndex: 999`, animated with `Animated.parallel` |
| Actions grid | Two separate `<View style={hc.actionsRow}>` (flex row, 3 cards each) |
| NID format | `YYYYMMDD-LLLLL-SSSSS-CC` — regex `/^\d{8}-\d{5}-\d{5}-\d{2}$/` |
| Parent lookup | Async mock with 900 ms delay; real app calls `GET /api/citizens/:nid` |
| Child NID gen | Random seq + CC; real app: system generates from region+DOB+sequence |
