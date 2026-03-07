import sys

with open('src/app/studio/dj-deck/dj-deck.component.ts', 'r') as f:
    lines = f.readlines()

# We need to find the FIRST occurrence of drawDeckWaveform and the end of the class
# and remove the duplicate blocks between 143 and 205 (approx)

new_lines = []
skip = False
for i, line in enumerate(lines):
    # Line 143 is where the first mess starts
    if i + 1 == 143:
        skip = True

    if i + 1 == 206:
        skip = False

    if not skip:
        new_lines.append(line)

with open('src/app/studio/dj-deck/dj-deck.component.ts', 'w') as f:
    f.writelines(new_lines)
