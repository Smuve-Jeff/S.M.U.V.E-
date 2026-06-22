import sys

file_path = 'src/app/services/audio-engine.service.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Make ctx explicitly public
content = content.replace('private ctx: AudioContext;', 'public ctx: AudioContext;')
# Backup might have had it without public/private
content = content.replace('  ctx: AudioContext;', '  public ctx: AudioContext;')

# Fix the ApplyProductionParameter if it's missing the name the compiler wants
if 'applyProductionParameter(' in content and 'public applyProductionParameter' not in content:
    content = content.replace('applyProductionParameter(', 'public applyProductionParameter(')

# Fix duplicate imports and injectors
import re
content = re.sub(r"(private injector = inject\(Injector\);(\n\s+)?){2,}", "private injector = inject(Injector);", content)

with open(file_path, 'w') as f:
    f.write(content)

# DrumMachineComponent - Remove duplicates
path_dm = 'src/app/studio/drum-machine/drum-machine.component.ts'
with open(path_dm, 'r') as f:
    lines = f.readlines()

new_lines = []
seen_methods = set()
for line in lines:
    m = re.match(r"^\s+(selectPad|getPadStep|isStepPlaying|isGlobalStep|evolveRhythm|generateGenre|randomizeAll)\(", line)
    if m:
        name = m.group(1)
        if name in seen_methods:
            continue
        seen_methods.add(name)
    new_lines.append(line)

with open(path_dm, 'w') as f:
    f.writelines(new_lines)

print("Polished AudioEngine and DrumMachine components")
