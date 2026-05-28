import re

with open('src/app/studio/piano-roll/piano-roll.component.ts', 'r') as f:
    content = f.read()

if 'imports:' not in content:
    content = content.replace('standalone: true,', 'standalone: true,\n  imports: [CommonModule, FormsModule, KnobComponent],')

with open('src/app/studio/piano-roll/piano-roll.component.ts', 'w') as f:
    f.write(content)
