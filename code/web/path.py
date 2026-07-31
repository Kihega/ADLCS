#!/usr/bin/env python3
"""
Attempt to repair:
    Parsing error: 'return' outside of function

Creates:
    src/pages/AdminDashboard.jsx.bak

Run from the project root:
    python3 patch_admin_dashboard_return.py
"""

from pathlib import Path
import sys

FILE = Path("src/pages/AdminDashboard.jsx")

if not FILE.exists():
    print("ERROR: src/pages/AdminDashboard.jsx not found.")
    sys.exit(1)

text = FILE.read_text(encoding="utf-8")

backup = FILE.with_suffix(FILE.suffix + ".bak")
backup.write_text(text, encoding="utf-8")

lines = text.splitlines()

brace_depth = 0
fixed = False

for i, line in enumerate(lines):

    # detect a top-level return
    stripped = line.lstrip()

    if stripped.startswith("return") and brace_depth == 0:

        # walk backwards looking for an unnecessary }
        for j in range(i - 1, -1, -1):

            if lines[j].strip() == "}":
                print(f"Removing suspected extra }} on line {j+1}")
                lines.pop(j)
                fixed = True
                break

        break

    # update brace count (very simple parser)
    in_string = False
    quote = None
    escape = False

    for ch in line:
        if escape:
            escape = False
            continue

        if ch == "\\":
            escape = True
            continue

        if in_string:
            if ch == quote:
                in_string = False
            continue

        if ch in ("'", '"', "`"):
            in_string = True
            quote = ch
            continue

        if ch == "{":
            brace_depth += 1
        elif ch == "}":
            brace_depth -= 1

if not fixed:
    print()
    print("No obvious automatic fix could be applied.")
    print("The file has been backed up as:")
    print("   ", backup)
    print()
    print("This usually means there is either:")
    print("  • a missing '{'")
    print("  • a missing ')'")
    print("  • a missing '}' much earlier in the file")
    sys.exit(1)

FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")

print()
print("✓ Patch applied.")
print("Backup:", backup)
print()
print("Run:")
print("    npm run lint")
