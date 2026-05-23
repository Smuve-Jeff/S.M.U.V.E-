import sys

file_path = 'src/app/studio/arrangement-view/arrangement-view.component.ts'
with open(file_path, 'r') as f:
    lines = f.readlines()

new_lines = []
found = False
for line in lines:
    if 'trackHeaderHeight = computed' in line:
        if not found:
            new_lines.append(line)
            found = True
        continue
    new_lines.append(line)

with open(file_path, 'w') as f:
    f.writelines(new_lines)
