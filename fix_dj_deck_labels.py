import re

file_path = 'src/app/studio/dj-deck/dj-deck.component.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Update getPadLabel to show category
content = content.replace(
    'return `Shot ${index + 1}`;',
    'return `${this.samplerCategory().substring(0, 3).toUpperCase()} ${index + 1}`;'
)

with open(file_path, 'w') as f:
    f.write(content)
