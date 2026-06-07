import re

file_path = 'src/app/studio/dj-deck/dj-deck.component.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Remove the duplicated/messy DjMidiService imports
content = re.sub(r'import\s+{\s+DjMidiService,\s+', 'import { ', content)
# Ensure DjMidiService is imported correctly once
if 'import { DjMidiService }' not in content:
    content = "import { DjMidiService } from '../../services/dj-midi.service';\n" + content

with open(file_path, 'w') as f:
    f.write(content)
