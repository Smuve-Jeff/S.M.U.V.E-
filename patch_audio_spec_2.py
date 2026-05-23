import sys

file_path = 'src/app/services/tests/audio-engine.service.spec.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Fix the oscillator check to handle multiple oscillators (sub-osc)
old_line = "const osc = mockAudioContext.createOscillator.mock.results.at(-1)?.value;"
new_line = "const oscillators = mockAudioContext.createOscillator.mock.results.map((r: any) => r.value);\n    const osc = oscillators.find((o: any) => o.type === 'square') || oscillators.at(-1);"

if old_line in content:
    content = content.replace(old_line, new_line)

with open(file_path, 'w') as f:
    f.write(content)
