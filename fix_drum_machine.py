import re

with open('src/app/studio/drum-machine/drum-machine.component.ts', 'r') as f:
    content = f.read()

# Ensure standalone and imports
content = re.sub(r'@Component\(\{', '@Component({\n  imports: [CommonModule, FormsModule, KnobComponent],', content)

with open('src/app/studio/drum-machine/drum-machine.component.ts', 'w') as f:
    f.write(content)
