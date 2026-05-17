from pathlib import Path
import re

src_dir = Path("src")

for file in src_dir.rglob("*.*"):
    if file.suffix not in [".ts", ".tsx"]:
        continue

    try:
        content = file.read_text(encoding="utf-8")
        lines = content.splitlines()

        new_lines = []
        imported_names = set()

        for line in lines:
            # Match import { ... } from '...'
            match = re.match(r"import\s*{([^}]*)}\s*from\s*['\"]([^'\"]+)['\"]", line)

            if match:
                names = [x.strip() for x in match.group(1).split(",")]
                module = match.group(2)

                unique = []

                for n in names:
                    # Remove aliases spacing issues
                    clean = n.strip()

                    if clean not in imported_names:
                        imported_names.add(clean)
                        unique.append(clean)

                # Skip empty imports
                if unique:
                    newline = f"import {{ {', '.join(unique)} }} from '{module}'"
                    new_lines.append(newline)

            else:
                new_lines.append(line)

        fixed = "\n".join(new_lines)

        # Fix repeated imports inside same line
        fixed = re.sub(r'\b(\w+)\s*,\s*\1\b', r'\1', fixed)

        file.write_text(fixed, encoding="utf-8")
        print(f"Fixed: {file}")

    except Exception as e:
        print(f"Error in {file}: {e}")

print("All duplicate imports fixed.")
