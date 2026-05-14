#!/usr/bin/env python3

from pathlib import Path

# Path to the file
file_path = Path("src/screens/village/VillageReportsScreen.tsx")

# Read file content
content = file_path.read_text(encoding="utf-8")

# Fix invalid JSX prop syntax
old = """{ icon:<Cross   size={20} color:'#dc2626'  />, label:'Deaths',    value:stats!.totalDeaths,   color:'#dc2626'},"""

new = """{ icon:<Cross   size={20} color="#dc2626" />, label:'Deaths',    value:stats!.totalDeaths,   color:'#dc2626'},"""

if old in content:
    content = content.replace(old, new)

    # Write updated content back
    file_path.write_text(content, encoding="utf-8")

    print("✅ Patch applied successfully.")
else:
    print("⚠️ Target code not found. File may already be fixed or formatted differently.")
