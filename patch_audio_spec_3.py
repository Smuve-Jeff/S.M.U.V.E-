import sys

file_path = 'src/app/services/tests/audio-engine.service.spec.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Fix the VCA check to handle multiple gain nodes (sub-osc)
old_line = "const vca = mockAudioContext.createGain.mock.results.at(-1)?.value;"
new_line = "const gains = mockAudioContext.createGain.mock.results.map((r: any) => r.value);\n    const vca = gains.find((g: any) => g.gain.linearRampToValueAtTime.mock.calls.length > 0) || gains.at(-1);"

if old_line in content:
    content = content.replace(old_line, new_line)

with open(file_path, 'w') as f:
    f.write(content)
