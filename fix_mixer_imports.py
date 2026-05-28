import sys

with open('src/app/studio/mixer/mixer.component.ts', 'r') as f:
    lines = f.readlines()

new_lines = []
seen_knob = False
for line in lines:
    if "import { KnobComponent }" in line:
        if seen_knob:
            continue
        seen_knob = True
    new_lines.append(line)

with open('src/app/studio/mixer/mixer.component.ts', 'w') as f:
    f.writelines(new_lines)
