# fix_duplicate_village_enum.py
# Run from backend root:
# python3 fix_duplicate_village_enum.py

from pathlib import Path
import re

schema_path = Path("prisma/schema.prisma")

if not schema_path.exists():
    print("ERROR: prisma/schema.prisma not found")
    exit(1)

content = schema_path.read_text(encoding="utf-8")

# Match full enum block
pattern = re.compile(
    r'enum\s+VillageType\s*\{[^}]*\}',
    re.DOTALL
)

matches = list(pattern.finditer(content))

if len(matches) <= 1:
    print("✅ No duplicate VillageType enums found")
    exit(0)

# Keep first enum only
first_enum = matches[0].group(0)

# Remove all VillageType enums
content_without = pattern.sub("", content)

# Insert first enum near top of schema
insert_point = content_without.find("model ")

if insert_point == -1:
    print("ERROR: Could not locate model definitions")
    exit(1)

fixed_content = (
    content_without[:insert_point]
    + first_enum
    + "\n\n"
    + content_without[insert_point:]
)

# Clean excessive blank lines
fixed_content = re.sub(r'\n{3,}', '\n\n', fixed_content)

schema_path.write_text(fixed_content, encoding="utf-8")

print(f"✅ Removed {len(matches)-1} duplicate VillageType enums")
print("✅ schema.prisma fixed successfully")
print("\nNow run:")
print("npx prisma format")
print("npx prisma generate")
