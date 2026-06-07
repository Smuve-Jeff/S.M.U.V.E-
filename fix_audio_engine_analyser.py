import os

file_path = 'src/app/services/audio-engine.service.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Change getAnalyser to return the actual analyser from deckA (as a fallback/primary)
# or add a masterAnalyser.
# Looking at HubComponent, it seems to want a master analyser.

# Let's add masterAnalyser to AudioEngineService
if 'public masterAnalyser!: AnalyserNode;' not in content:
    content = content.replace('public masterGain!: GainNode;', 'public masterGain!: GainNode;\n  public masterAnalyser!: AnalyserNode;')

if 'this.masterAnalyser = this.ctx.createAnalyser();' not in content:
    content = content.replace('this.masterGain = this.ctx.createGain();', 'this.masterGain = this.ctx.createGain();\n    this.masterAnalyser = this.ctx.createAnalyser();')

# Connect masterGain to masterAnalyser
content = content.replace('this.masterGain.connect(this.compressor);', 'this.masterGain.connect(this.masterAnalyser);\n    this.masterAnalyser.connect(this.compressor);')

# Update getAnalyser to return masterAnalyser
content = content.replace('getAnalyser() { return this.masterGain; }', 'getAnalyser() { return this.masterAnalyser; }')

with open(file_path, 'w') as f:
    f.write(content)
