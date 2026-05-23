import sys

file_path = 'src/app/services/tests/audio-engine.service.spec.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Update createMockNode's Q mock
if 'Q: { value: 0 },' in content:
    content = content.replace('Q: { value: 0 },', 'Q: { value: 0, setValueAtTime: jest.fn() },')

with open(file_path, 'w') as f:
    f.write(content)
