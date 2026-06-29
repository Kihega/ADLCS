from pathlib import Path

f = Path("src/screens/village/NINRegistrationScreen.tsx")

text = f.read_text()

text = text.rstrip()

if text.endswith(")"):
    text += "\n}\n"
    f.write_text(text)
    print("Added missing component closing }")
else:
    print("End does not match expected pattern")
