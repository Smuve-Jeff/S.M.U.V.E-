import re

with open('src/app/studio/mixer/mixer.component.ts', 'r') as f:
    content = f.read()

if 'imports: [' in content:
    start = content.find('imports: [') + 10
    end = content.find(']', start)
    content = content[:start] + 'CommonModule, FormsModule, KnobComponent' + content[end:]

with open('src/app/studio/mixer/mixer.component.ts', 'w') as f:
    f.write(content)
