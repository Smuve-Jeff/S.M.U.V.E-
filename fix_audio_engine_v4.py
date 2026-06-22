import sys
path = 'src/app/services/audio-engine.service.ts'
with open(path, 'r') as f:
    content = f.read()

# Ensure .ctx is public
content = content.replace('private ctx: AudioContext;', 'public ctx: AudioContext;')
content = content.replace('  ctx: AudioContext;', '  public ctx: AudioContext;')

# Add applyProductionParameter if missing (though it should be there from backup)
if 'applyProductionParameter(' not in content:
    # Add a stub or full impl if needed
    pass

with open(path, 'w') as f:
    f.write(content)
