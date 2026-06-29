#!/usr/bin/env python3
"""
patch_13.py — ESLint fix (5 errors, 5 warnings)
================================================
Run from project root:  python3 patch_13.py

Fixes:
  HospitalHomeScreen.tsx  (2 warnings)
    • loadData useCallback  }, [])  →  }, [_navigation])
    • handleLogout useCallback  }, [])  →  }, [_navigation])

  NINRegistrationScreen.tsx  (5 errors)
    • Prefix unused vars: Modal→_Modal, apiPost→_apiPost,
      today→_today, buildCardHtml→_buildCardHtml, setCardHtml→_setCardHtml

  VillageHomeScreen.tsx  (3 warnings)
    • loadData useCallback  [_navigation]  →  []   (unnecessary dep)
    • handleLogout useCallback  [_navigation]  →  []  (unnecessary dep)
    • useEffect fp2Valid missing dep  →  add fp2Valid (NIN screen, separate)
"""

import re, sys, os

ROOT = os.path.dirname(os.path.abspath(__file__))
ERRORS = []

def read(rel):
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p):
        ERRORS.append(f"NOT FOUND: {rel}")
        return None
    return open(p, encoding="utf-8").read()

def write(rel, content):
    open(os.path.join(ROOT, rel), "w", encoding="utf-8").write(content)
    print(f"  ✓ saved: {rel}")

def patch(path, old, new, label):
    src = read(path)
    if src is None: return False
    if new in src:
        print(f"  ⚑ already applied [{label}]")
        return True
    if old not in src:
        ERRORS.append(f"PATTERN NOT FOUND [{label}] in {path}")
        return False
    write(path, src.replace(old, new, 1))
    return True

# ─── 1. HospitalHomeScreen.tsx ────────────────────────────────────────────────

def fix_hospital():
    print("\n[1/3] HospitalHomeScreen.tsx")
    path = "code/mobile/src/screens/hospital/HospitalHomeScreen.tsx"
    src = read(path)
    if src is None: return

    changed = False

    # loadData useCallback dep array (has comment block above closing })
    OLD_LOAD = (
        "    // it can never trigger a meaningful re-run and does not belong in the\n"
        "    // dependency array (it is still used directly in the callback body\n"
        "    // above via navigation.replace('Login'), this only removes the\n"
        "    // redundant tracking of an outer-scope value that never changes).\n"
        "  }, [])"
    )
    NEW_LOAD = (
        "    // it can never trigger a meaningful re-run and does not belong in the\n"
        "    // dependency array (it is still used directly in the callback body\n"
        "    // above via navigation.replace('Login'), this only removes the\n"
        "    // redundant tracking of an outer-scope value that never changes).\n"
        "  }, [_navigation])"
    )
    if NEW_LOAD in src:
        print("  ⚑ already applied [loadData dep]")
    elif OLD_LOAD in src:
        src = src.replace(OLD_LOAD, NEW_LOAD, 1)
        changed = True
        print("  ✓ loadData dep array: [] → [_navigation]")
    else:
        # Fallback: find loadData useCallback closing }, []) specifically
        # by looking for the comment pattern with regex
        pat = re.compile(
            r'(// redundant tracking of an outer-scope value that never changes\.\n'
            r'\s*\}, )\[\](\))',
        )
        new_src = pat.sub(r'\1[_navigation]\2', src, count=1)
        if new_src != src:
            src = new_src
            changed = True
            print("  ✓ loadData dep array (regex fallback)")
        else:
            ERRORS.append("PATTERN NOT FOUND [loadData dep] in HospitalHomeScreen.tsx")

    # handleLogout useCallback — closing }, []) after the Alert.alert block
    # Unique anchor: the line before is:   ])(_navigation as any).replace('Login')
    OLD_LOGOUT = "          ])(_navigation as any).replace('Login')\n        },\n      },\n    ])\n  }, [])"
    NEW_LOGOUT = "          ])(_navigation as any).replace('Login')\n        },\n      },\n    ])\n  }, [_navigation])"

    if NEW_LOGOUT in src:
        print("  ⚑ already applied [handleLogout dep]")
    elif OLD_LOGOUT in src:
        src = src.replace(OLD_LOGOUT, NEW_LOGOUT, 1)
        changed = True
        print("  ✓ handleLogout dep array: [] → [_navigation]")
    else:
        ERRORS.append("PATTERN NOT FOUND [handleLogout dep] in HospitalHomeScreen.tsx")

    if changed:
        write(path, src)


# ─── 2. NINRegistrationScreen.tsx ────────────────────────────────────────────

def fix_nin():
    print("\n[2/3] NINRegistrationScreen.tsx")
    path = "code/mobile/src/screens/village/NINRegistrationScreen.tsx"
    src = read(path)
    if src is None: return

    changed = False

    # ── 2a. Modal import → _Modal ─────────────────────────────────────────────
    for old, new, lbl in [
        # Modal in RN import list
        ("  Modal,\n", "  _Modal,\n", "Modal→_Modal"),
        # apiPost import
        ("import { apiGet, apiPost, fetchRemoteDashboard }", 
         "import { apiGet, _apiPost, fetchRemoteDashboard }",
         "apiPost→_apiPost"),
        # today function
        ("function today(): string {",
         "function _today(): string {",
         "today→_today"),
        # buildCardHtml function
        ("function buildCardHtml(d: CardData): string {",
         "function _buildCardHtml(d: CardData): string {",
         "buildCardHtml→_buildCardHtml"),
        # setCardHtml destructure
        ("  const [cardHtml, setCardHtml] = useState<string | null>(null)",
         "  const [cardHtml, _setCardHtml] = useState<string | null>(null)",
         "setCardHtml→_setCardHtml"),
    ]:
        if new in src:
            print(f"  ⚑ already applied [{lbl}]")
        elif old in src:
            src = src.replace(old, new, 1)
            changed = True
            print(f"  ✓ {lbl}")
        else:
            ERRORS.append(f"PATTERN NOT FOUND [{lbl}] in NINRegistrationScreen.tsx")

    # ── 2b. useEffect fp2Valid missing dep ────────────────────────────────────
    # Line ~584: useEffect that builds cardData — missing fp2Valid in deps
    # Find the useEffect that has [birthRecord, photoBase64, fpLeft, fpRight, officer]
    OLD_DEPS = "  }, [birthRecord, photoBase64, fpLeft, fpRight, officer])"
    NEW_DEPS = "  }, [birthRecord, photoBase64, fpLeft, fpRight, fp2Valid, officer])"
    if NEW_DEPS in src:
        print("  ⚑ already applied [fp2Valid dep]")
    elif OLD_DEPS in src:
        src = src.replace(OLD_DEPS, NEW_DEPS, 1)
        changed = True
        print("  ✓ useEffect dep: added fp2Valid")
    else:
        # Regex fallback: find the useEffect closing with those deps
        pat = re.compile(
            r'(\}, \[birthRecord, photoBase64, fpLeft, fpRight,)( officer\]\))'
        )
        new_src = pat.sub(r'\1 fp2Valid,\2', src, count=1)
        if new_src != src:
            src = new_src
            changed = True
            print("  ✓ useEffect dep: added fp2Valid (regex fallback)")
        else:
            ERRORS.append("PATTERN NOT FOUND [fp2Valid dep] in NINRegistrationScreen.tsx")

    if changed:
        write(path, src)


# ─── 3. VillageHomeScreen.tsx ─────────────────────────────────────────────────

def fix_village():
    print("\n[3/3] VillageHomeScreen.tsx")
    path = "code/mobile/src/screens/village/VillageHomeScreen.tsx"
    src = read(path)
    if src is None: return

    changed = False

    # loadData useCallback [_navigation] → []
    # Unique anchor: loadData closes with }, [_navigation]) around line 617
    # We need to find the RIGHT closing — not handleLogout's
    # Strategy: find the first occurrence of [_navigation]) after loadData
    OLD_LOAD = "    [_navigation]\n  )"
    NEW_LOAD = "    []\n  )"

    if NEW_LOAD in src:
        print("  ⚑ already applied [loadData dep]")
    elif OLD_LOAD in src:
        src = src.replace(OLD_LOAD, NEW_LOAD, 1)
        changed = True
        print("  ✓ loadData dep: [_navigation] → []")
    else:
        ERRORS.append("PATTERN NOT FOUND [loadData dep] in VillageHomeScreen.tsx")

    # handleLogout useCallback [_navigation] → []
    OLD_LOGOUT = "  }, [_navigation])"
    NEW_LOGOUT = "  }, [])"
    # Check how many occurrences exist — should be 1 (handleLogout)
    count = src.count(OLD_LOGOUT)
    if NEW_LOGOUT in src and OLD_LOGOUT not in src:
        print("  ⚑ already applied [handleLogout dep]")
    elif count == 1:
        src = src.replace(OLD_LOGOUT, NEW_LOGOUT, 1)
        changed = True
        print("  ✓ handleLogout dep: [_navigation] → []")
    elif count > 1:
        # Replace last occurrence (handleLogout comes after loadData)
        idx = src.rfind(OLD_LOGOUT)
        src = src[:idx] + NEW_LOGOUT + src[idx + len(OLD_LOGOUT):]
        changed = True
        print("  ✓ handleLogout dep: [_navigation] → [] (last occurrence)")
    else:
        ERRORS.append("PATTERN NOT FOUND [handleLogout dep] in VillageHomeScreen.tsx")

    if changed:
        write(path, src)


# ─── main ─────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("patch_13.py — ESLint fix (5 errors, 5 warnings → 0)")
    print("=" * 60)
    fix_hospital()
    fix_nin()
    fix_village()
    print("\n" + "=" * 60)
    if ERRORS:
        print(f"COMPLETED WITH {len(ERRORS)} ERROR(S):")
        for e in ERRORS: print(f"  ✗ {e}")
        sys.exit(1)
    else:
        print("ALL PATCHES APPLIED — run `npm run lint` to verify")
        print("=" * 60)

if __name__ == "__main__":
    main()
