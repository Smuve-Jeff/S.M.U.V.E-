import os
import re

file_path = 'src/app/services/audio-engine.service.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Fix configureLimiter call in setupMasterChain
content = content.replace('ratio: 20,', 'ratio: 12,')
content = content.replace('attack: 0.001,', 'attack: 0.003,')
content = content.replace('release: 0.1,', 'release: 0.25,')

with open(file_path, 'w') as f:
    f.write(content)
