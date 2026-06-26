import sys

with open('src/app/components/tha-spot/tha-spot.component.ts', 'r') as f:
    for i, line in enumerate(f, 1):
        if 'hubTimeoutId' in line:
            print(f"{i}: {line.strip()}")
