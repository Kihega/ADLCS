from pathlib import Path

root = Path(".")

removed = 0

for file in root.rglob("*.bak"):
    try:
        file.unlink()
        print("Removed:", file)
        removed += 1
    except Exception as e:
        print("Failed:", file, e)

print(f"\nDone. Removed {removed} .bak files.")
