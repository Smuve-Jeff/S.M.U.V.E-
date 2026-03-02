import sys

file_path = 'src/app/components/dj-deck/dj-deck.component.ts'
with open(file_path, 'r') as f:
    content = f.read()

content = content.replace("\\n  constructor(", "\\n  constructor(")
content = content.replace(r"\n  constructor(", "\n  constructor(")

with open(file_path, 'w') as f:
    f.write(content)
