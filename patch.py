#!/usr/bin/env python3
"""
fix_remaining_tsc_errors.py — Pre-existing TypeScript error cleanup
=========================================================================
Run from the project ROOT (the folder that contains the "code" directory):

    python3 fix_remaining_tsc_errors.py

Re-runnable / idempotent, like the other scripts in this set.

────────────────────────────────────────────────────────────────────────────
WHAT THIS FIXES
────────────────────────────────────────────────────────────────────────────

All five of these are PRE-EXISTING bugs — confirmed by diffing against the
original, unmodified project zip before writing this script. None were
introduced by fix_mobile_bugs.py, fix_hardcoded_urls_and_rebrand.py, or
fix_lint_followups.py.

1) LocalBirth missing `nationalId` (IssueCertificateScreen.tsx ×1,
   certificateService.ts ×2 — 3 errors total)
   The certificate detail view and the printable certificate HTML both
   want to show a "NIN" row with a `|| 'Pending'` / `|| 'PENDING —
   ASSIGNED AT AGE 18'` fallback — but `LocalBirth` (in services/
   localDb.ts) never declared a `nationalId` field at all, only `birthId`
   (with a comment noting the NIN doesn't exist until age 18, via the
   separate NIN-issuance flow). Added `nationalId?: string` as an
   OPTIONAL field. Nothing needs to populate it for this to work — the
   existing `|| 'Pending'` fallback already handles the undefined case
   correctly; this only fixes the type-checker complaining about a field
   that was always meant to be there but never declared.

2) IssueCertificateScreen.tsx:375 — wrong comparison target in a tab
   indicator
   `style={[s.tab === t && {...}]}` compares the STYLESHEET OBJECT `s.tab`
   (always an object, never equal to a string) against `t` — a real
   typo/copy-paste bug, not just a typing nuisance. The line directly
   below it correctly does `tab === t` (the component's `tab` STATE
   variable). Because of the typo, the active-tab underline indicator
   never actually renders. Fixed to compare `tab === t`, matching the
   correct line right next to it.

3) PendingCasesScreen.tsx:44 — `Record<string>` → `Record<string, string>`
   `Record` always needs both a key type and a value type; this was
   missing the second argument. Both keys and values in REASON_LABELS are
   strings, so `Record<string, string>` is the correct, intended type.

4) RecordDeathScreen.tsx — `RefObject<TextInput | null>` vs
   `RefObject<TextInput>` (2 errors)
   This is a real typing-strictness change in modern @types/react:
   `useRef<TextInput>(null)` now infers `RefObject<TextInput | null>`
   (because the initial value is `null`), but the shared `FieldProps`
   type still declared `inputRef?: React.RefObject<TextInput>` (without
   `| null`) from before that change. The `useRef` calls themselves
   (causeRef, informantRef) are correct, idiomatic React — widened the
   shared `inputRef` prop type to match what `useRef` actually produces.

5) NINRegistrationScreen.tsx:595 — `fp2Valid` used before its declaration
   A useEffect's dependency array references `fp2Valid`, but the `const
   fp2Valid = fpLeft === 'done' && fpRight === 'done'` line is declared
   further down the same component. This was functionally harmless at
   runtime (the effect only runs after render, once fp2Valid already has
   a value via closures), but tsc's strict mode correctly flags the
   lexical ordering as unsafe. Moved the one-line `fp2Valid` declaration
   up to right after `fpLeft`/`fpRight` are declared (its only two
   dependencies, both already in scope at that point) — nothing else
   needed to move, since `canProceedStep2` (which also reads `fp2Valid`)
   stays exactly where it was and still works correctly once `fp2Valid`
   is defined earlier in the file.
"""

import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
ERRORS = []
APPLIED = []
SKIPPED = []


def _resolve(rel):
    candidates = [
        os.path.join(ROOT, rel),
        os.path.join(ROOT, "ADLCS-main", rel),
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return candidates[0]


def read(rel):
    p = _resolve(rel)
    if not os.path.exists(p):
        ERRORS.append(f"NOT FOUND: {rel}  (looked at: {p})")
        return None, None
    return open(p, encoding="utf-8").read(), p


def write(path, content):
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def patch(rel, old, new, label, count=1):
    src, path = read(rel)
    if src is None:
        return
    if old not in src:
        if new in src:
            print(f"  ⚑ already applied [{label}]")
            SKIPPED.append(label)
        else:
            ERRORS.append(f"PATTERN NOT FOUND [{label}] in {rel}")
        return
    src = src.replace(old, new, count)
    write(path, src)
    print(f"  ✓ {label}")
    APPLIED.append(label)


def fix_local_birth_national_id():
    print("\n[1/5] services/localDb.ts — add optional nationalId to LocalBirth")
    rel = "code/mobile/src/services/localDb.ts"
    patch(
        rel,
        "  registeredAt: string // ISO\n"
        "  synced: number // 0 | 1\n"
        "  certPdfPath: string\n"
        "  rawJson: string\n"
        "}\n\n"
        "export interface LocalDeath {",
        "  registeredAt: string // ISO\n"
        "  synced: number // 0 | 1\n"
        "  certPdfPath: string\n"
        "  rawJson: string\n"
        "  nationalId?: string // NIN — undefined/empty until issued at age 18\n"
        "}\n\n"
        "export interface LocalDeath {",
        "LocalBirth: add optional nationalId field",
    )


def fix_issue_certificate_tab_comparison():
    print("\n[2/5] IssueCertificateScreen.tsx — fix tab-indicator comparison bug")
    rel = "code/mobile/src/screens/hospital/IssueCertificateScreen.tsx"
    patch(
        rel,
        "            style={[s.tab === t && { borderBottomWidth: 2, borderBottomColor: T.primary }]}",
        "            style={[tab === t && { borderBottomWidth: 2, borderBottomColor: T.primary }]}",
        "fix tab indicator: s.tab === t → tab === t",
    )


def fix_pending_cases_record_type():
    print("\n[3/5] PendingCasesScreen.tsx — Record<string> → Record<string, string>")
    rel = "code/mobile/src/screens/hospital/PendingCasesScreen.tsx"
    patch(
        rel,
        "const REASON_LABELS: Record<string> = {",
        "const REASON_LABELS: Record<string, string> = {",
        "REASON_LABELS: add missing Record value type",
    )


def fix_record_death_input_ref_type():
    print("\n[4/5] RecordDeathScreen.tsx — widen FieldProps.inputRef to allow null")
    rel = "code/mobile/src/screens/hospital/RecordDeathScreen.tsx"
    patch(
        rel,
        "  inputRef?: React.RefObject<TextInput>",
        "  inputRef?: React.RefObject<TextInput | null>",
        "FieldProps.inputRef: allow RefObject<TextInput | null>",
    )


def fix_nin_registration_declaration_order():
    print("\n[5/5] NINRegistrationScreen.tsx — move fp2Valid declaration before its useEffect")
    rel = "code/mobile/src/screens/village/NINRegistrationScreen.tsx"
    src, path = read(rel)
    if src is None:
        return

    already_moved = (
        "const [fpRight, setFpRight] = useState<'idle' | 'scanning' | 'done'>('idle')\n"
        "  const fp2Valid = fpLeft === 'done' && fpRight === 'done'\n"
    )
    if already_moved in src:
        print("  ⚑ already applied [move fp2Valid declaration]")
        SKIPPED.append("move fp2Valid declaration")
        return

    old_decl_site = "\n  const fp2Valid = fpLeft === 'done' && fpRight === 'done'\n  const canProceedStep2 = !!photoUri && fp2Valid\n"
    old_fpright_line = "  const [fpRight, setFpRight] = useState<'idle' | 'scanning' | 'done'>('idle')\n"

    if old_decl_site not in src or old_fpright_line not in src:
        ERRORS.append("PATTERN NOT FOUND [move fp2Valid declaration] in " + rel)
        return

    # Remove fp2Valid from its old spot, leaving canProceedStep2 in place.
    src = src.replace(
        old_decl_site,
        "\n  const canProceedStep2 = !!photoUri && fp2Valid\n",
        1,
    )
    # Re-insert fp2Valid right after fpLeft/fpRight are declared.
    src = src.replace(
        old_fpright_line,
        old_fpright_line + "  const fp2Valid = fpLeft === 'done' && fpRight === 'done'\n",
        1,
    )
    write(path, src)
    print("  ✓ moved fp2Valid declaration above the useEffect that references it")
    APPLIED.append("move fp2Valid declaration")


def main():
    print("=" * 70)
    print("fix_remaining_tsc_errors.py — pre-existing TypeScript error cleanup")
    print("=" * 70)

    fix_local_birth_national_id()
    fix_issue_certificate_tab_comparison()
    fix_pending_cases_record_type()
    fix_record_death_input_ref_type()
    fix_nin_registration_declaration_order()

    print("\n" + "=" * 70)
    print(f"DONE — {len(APPLIED)} change(s) applied, {len(SKIPPED)} already in place")

    if ERRORS:
        print(f"⚠ COMPLETED WITH {len(ERRORS)} ISSUE(S) NEEDING ATTENTION:")
        for e in ERRORS:
            print(f"  ✗ {e}")
        sys.exit(1)
    else:
        print("All patches applied cleanly.")
        print("Next: npx tsc --noEmit && npm run lint")
        print("=" * 70)


if __name__ == "__main__":
    main()
