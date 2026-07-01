#!/usr/bin/env python3
"""
hotfix_build_errors.py — Fix two Vite/Rolldown build errors introduced by
the previous patch run applying both the original and the corrected version
of the same hunks.

Run from the project root (~/ADLCS):
    python3 hotfix_build_errors.py

Idempotent.

Errors fixed:
  1. LoginPage.jsx:42-43 — duplicate `setAuthUserId` declaration
       Both `const [authUserId, setAuthUserId]` and
       `const [_authUserId, setAuthUserId]` exist; remove the old one.
  2. AdminDashboard.jsx:1078 — illegal JSX comment after />
       `}} />  {/* PATCH-EMAIL-2025 */}` still present; strip the trailing
       comment so the line ends cleanly at `}} />`.
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WEB  = ROOT / "code" / "web" / "src"

CHANGED = []
SKIPPED = []
FAILED  = []


def fix_login_page():
    path = WEB / "pages" / "LoginPage.jsx"
    if not path.exists():
        FAILED.append(f"LoginPage.jsx not found at {path}"); return

    text = path.read_text(encoding="utf-8")

    # ── Case A: both old and new declaration present — keep only the fixed one
    OLD_DUP = (
        "  // eslint-disable-next-line no-unused-vars\n"
        "  const [_authUserId, setAuthUserId] = useState(null) // PATCH-EMAIL-2025: from token validation (userId reserved for profile completion in next sprint)\n"
        "  const [authUserId, setAuthUserId] = useState(null) // PATCH-EMAIL-2025: from token validation\n"
    )
    NEW_DUP = (
        "  // eslint-disable-next-line no-unused-vars\n"
        "  const [_authUserId, setAuthUserId] = useState(null) // PATCH-EMAIL-2025: from token validation (userId reserved for profile completion in next sprint)\n"
    )

    # ── Case B: only old declaration present — replace with fixed one
    OLD_ONLY = (
        "  const [authUserId, setAuthUserId] = useState(null) // PATCH-EMAIL-2025: from token validation\n"
    )
    NEW_ONLY = (
        "  // eslint-disable-next-line no-unused-vars\n"
        "  const [_authUserId, setAuthUserId] = useState(null) // PATCH-EMAIL-2025: from token validation (userId reserved for profile completion in next sprint)\n"
    )

    # Guard: already clean
    MARKER = "const [_authUserId, setAuthUserId]"
    if MARKER in text and OLD_DUP not in text and OLD_ONLY not in text:
        SKIPPED.append("LoginPage.jsx (already clean)"); return

    if OLD_DUP in text:
        text = text.replace(OLD_DUP, NEW_DUP, 1)
        path.write_text(text, encoding="utf-8")
        CHANGED.append("LoginPage.jsx — removed duplicate authUserId declaration")
    elif OLD_ONLY in text:
        text = text.replace(OLD_ONLY, NEW_ONLY, 1)
        path.write_text(text, encoding="utf-8")
        CHANGED.append("LoginPage.jsx — replaced authUserId with _authUserId + eslint-disable")
    else:
        SKIPPED.append("LoginPage.jsx (no matching pattern — check manually if still broken)")


def fix_admin_dashboard():
    path = WEB / "pages" / "AdminDashboard.jsx"
    if not path.exists():
        FAILED.append(f"AdminDashboard.jsx not found at {path}"); return

    text = path.read_text(encoding="utf-8")

    # The illegal form has a JSX comment after the self-closing tag in a switch return.
    # Strip the comment — the preceding /> is the correct end of the statement.
    BAD  = "}} />  {/* PATCH-EMAIL-2025 */}"
    GOOD = "}} />"

    if BAD not in text:
        SKIPPED.append("AdminDashboard.jsx — ManageUsersSection case already clean"); return

    text = text.replace(BAD, GOOD)
    path.write_text(text, encoding="utf-8")
    CHANGED.append("AdminDashboard.jsx — removed illegal JSX comment after /> in switch return")


def main():
    if not WEB.exists():
        print(f"ERROR: run from the ADLCS project root — code/web/src not found under {ROOT}")
        sys.exit(1)

    fix_login_page()
    fix_admin_dashboard()

    print("\n" + "=" * 60)
    print(f"FIXED  ({len(CHANGED)}):")
    for c in CHANGED:  print(f"  ✓ {c}")
    print(f"\nSKIPPED ({len(SKIPPED)}):")
    for s in SKIPPED: print(f"  · {s}")
    if FAILED:
        print(f"\nFAILED ({len(FAILED)}):")
        for f in FAILED: print(f"  ✗ {f}")
        print("=" * 60); sys.exit(1)
    print("=" * 60)
    print("\nRun `npm run build` inside code/web to confirm the build passes.")


if __name__ == "__main__":
    main()
