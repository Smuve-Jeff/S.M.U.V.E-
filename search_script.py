import sys

with open('src/app/services/audio-engine.service.ts', 'r') as f:
    lines = f.readlines()
    for i, line in enumerate(lines):
        if 'send ===' in line:
            print(f"{i+1}: {line.strip()}")
