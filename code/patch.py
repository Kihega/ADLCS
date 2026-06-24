#!/usr/bin/env python3

from pathlib import Path
import re

ROOT = Path(__file__).parent
MOBILE = ROOT / "mobile"

FILES_TO_REMOVE = [
    MOBILE / "src/screens/village/RegisterBuildingScreen.tsx",
    MOBILE / "src/screens/village/RegisterInfrastructureScreen.tsx",
]

TARGET_NAMES = [
    "RegisterBuildingScreen",
    "RegisterInfrastructureScreen",
]

SKIP_DIRS = {
    "node_modules",
    ".git",
    "android",
    "ios",
    "dist",
    "build",
}


def remove_files():
    for f in FILES_TO_REMOVE:
        if f.exists():
            print(f"Removing {f}")
            f.unlink()


def clean_references():
    for file in MOBILE.rglob("*"):

        if any(part in SKIP_DIRS for part in file.parts):
            continue

        if not file.is_file():
            continue

        if file.suffix not in [".ts", ".tsx", ".js", ".jsx"]:
            continue

        try:
            text = file.read_text()
        except:
            continue

        old = text

        for name in TARGET_NAMES:
            text = re.sub(
                rf'^.*{name}.*\n?',
                '',
                text,
                flags=re.MULTILINE
            )

        if text != old:
            print(f"Cleaning {file}")
            file.write_text(text)


remove_files()
clean_references()

print("Done")
