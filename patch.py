#!/usr/bin/env python3
"""
hotfix_loginpage_eslint.py — Remove the spurious eslint-disable-next-line
directive from LoginPage.jsx (the _authUserId declaration already satisfies
the varsIgnorePattern so the directive triggers an 'unused directive' warning).

Run from project root (~/ADLCS). Idempotent.
"""
import sys
from pathlib import Path

path = Path(__file__).resolve().parent / "code" / "web" / "src" / "pages" / "LoginPage.jsx"

if not path.exists():
    print(f"ERROR: {path} not found"); sys.exit(1)

text = path.read_text(encoding="utf-8")

# Already clean — either our marker is there or the disable line is gone
if "HLPE-1" in text or "// eslint-disable-next-line no-unused-vars\n  const [_authUserId" not in text:
    print("SKIPPED — already clean"); sys.exit(0)

# Strip only the disable-next-line comment line; keep the declaration intact
old = "  // eslint-disable-next-line no-unused-vars\n  const [_authUserId, setAuthUserId] = useState(null)"
new = "  const [_authUserId, setAuthUserId] = useState(null) // HLPE-1"

if old not in text:
    # Try variant with longer trailing comment (from our test env hotfix run)
    old2 = ("  // eslint-disable-next-line no-unused-vars\n"
            "  const [_authUserId, setAuthUserId] = useState(null) // PATCH-EMAIL-2025")
    if old2 not in text:
        print("FAILED — could not find the anchor. "
              "Manually remove the '// eslint-disable-next-line no-unused-vars' "
              "line immediately above the _authUserId declaration in LoginPage.jsx")
        sys.exit(1)
    old = old2

path.write_text(text.replace(old, new, 1), encoding="utf-8")
print("✓ LoginPage.jsx — eslint-disable directive removed (HLPE-1)")
