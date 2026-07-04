#!/usr/bin/env python3
"""
apply_eas_project_fix.py
===========================

Fixes:
    "Experience with id '...' does not exist" when running
    `npx eas build --platform android --profile preview`

ROOT CAUSE
----------
code/mobile/app.json had a hardcoded `owner` field and `extra.eas.projectId`
pointing at an Expo project belonging to whoever originally scaffolded this
codebase (a template author, tutorial, or previous developer's account).
Once you log into EAS with your OWN Expo account, that project ID doesn't
exist under your account, so every build request fails immediately with a
GraphQL "Experience does not exist" error — this has nothing to do with
your code, it's purely an account/ownership mismatch.

Also silences the (currently non-fatal, soon-to-be-required) EAS CLI
warning about `cli.appVersionSource` not being set in eas.json.

FIX
---
1. Removes the stale `owner` field from app.json's `expo` block, so EAS
   doesn't try to attribute the new project to an account you don't
   control. (Leave this unset unless you specifically manage multiple
   Expo accounts/orgs and know which one you want.)
2. Sets `cli.appVersionSource: "local"` in eas.json.

AFTER RUNNING THIS SCRIPT, you still need to run:

    cd code/mobile
    npx eas init

This creates a brand-new EAS project under YOUR logged-in account and
writes the new projectId into app.json automatically — this script does
not (and cannot) create that project for you, since it requires being
authenticated with `npx eas login` first.

Safe to re-run (idempotent).

USAGE
-----
    python3 apply_eas_project_fix.py [--root /path/to/project]
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def find_project_root(explicit):
    candidates = []
    if explicit:
        candidates.append(Path(explicit).expanduser().resolve())
    candidates += [
        Path.cwd(),
        Path.cwd() / "ADLCS-main",
        Path.home() / "ADLCS",
        Path.home() / "ADLCS-main",
    ]
    for c in candidates:
        if (c / "code" / "mobile" / "package.json").exists():
            return c
    for p in Path.cwd().rglob("package.json"):
        if p.parent.name == "mobile" and (p.parent.parent / "web").exists():
            return p.parent.parent.parent
    raise SystemExit(
        "Could not locate the project root (expected <root>/code/mobile/package.json).\n"
        "Re-run with --root /path/to/your/project."
    )


def fix_app_json(mobile_dir: Path) -> None:
    path = mobile_dir / "app.json"
    print(f"\n[1] Checking {path.name} for a stale owner/projectId")
    data = json.loads(path.read_text(encoding="utf-8"))
    expo = data.get("expo", {})

    removed_owner = False
    if "owner" in expo:
        print(f"  Removing stale owner field: \"{expo['owner']}\"")
        del expo["owner"]
        removed_owner = True

    stale_project_id = expo.get("extra", {}).get("eas", {}).get("projectId")
    if stale_project_id:
        print(f"  Found existing projectId: {stale_project_id}")
        print(
            "  NOTE: this script does not remove projectId automatically, since\n"
            "  `npx eas init` (run after this script) will detect and replace an\n"
            "  invalid one safely. If `eas init` still complains, delete\n"
            "  expo.extra.eas.projectId from app.json by hand and re-run `eas init`."
        )

    if removed_owner:
        data["expo"] = expo
        path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
        print("  [OK] removed owner field from app.json")
    else:
        print("  [skip] no owner field present")


def fix_eas_json(mobile_dir: Path) -> None:
    path = mobile_dir / "eas.json"
    print(f"\n[2] Checking {path.name} for cli.appVersionSource")
    data = json.loads(path.read_text(encoding="utf-8"))
    cli = data.setdefault("cli", {})
    if cli.get("appVersionSource") == "local":
        print("  [skip] appVersionSource already set")
        return
    cli["appVersionSource"] = "local"
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print("  [OK] set cli.appVersionSource = \"local\" in eas.json")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--root", help="Path to the project root.")
    args = ap.parse_args()

    root = find_project_root(args.root)
    mobile_dir = root / "code" / "mobile"
    print(f"Project root: {root}")

    fix_app_json(mobile_dir)
    fix_eas_json(mobile_dir)

    print(
        "\nDone. Next steps:\n"
        "  1. cd code/mobile\n"
        "  2. npx eas login          (if not already logged in)\n"
        "  3. npx eas init           (creates a fresh project under YOUR account,\n"
        "                             writes the new projectId into app.json)\n"
        "  4. npx eas build --platform android --profile preview\n"
    )


if __name__ == "__main__":
    main()
