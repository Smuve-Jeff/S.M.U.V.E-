import os
import re

file_path = 'src/app/services/deck.service.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Fix the samplerPad update logic in target.update functions
# First for setSamplerPad
content = re.sub(
    r'samplerPads\[category\] = \[\.\.\.samplerPads\[category\]\];',
    'samplerPads[category] = [...(d.samplerPads as any)[category]];',
    content
)

# Fix the return object in setSamplerPad target.update
content = re.sub(
    r'return \{ \.\.\.d, samplerPads \};',
    'return { ...d, samplerPads: samplerPads as any };',
    content
)

with open(file_path, 'w') as f:
    f.write(content)
