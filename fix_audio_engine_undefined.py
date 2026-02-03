content = open('src/app/services/audio-engine.service.ts').read()

# Replace this.autoTuneWet.gain with this.autoTuneWet?.gain etc.
content = content.replace('this.autoTuneWet.gain', 'this.autoTuneWet?.gain')
content = content.replace('this.autoTuneDelay.delayTime', 'this.autoTuneDelay?.delayTime')
content = content.replace('this.autoTuneFilter.frequency', 'this.autoTuneFilter?.frequency')
content = content.replace('this.recordingDestination', 'this.recordingDestination!') # since we check it before

with open('src/app/services/audio-engine.service.ts', 'w') as f:
    f.write(content)
