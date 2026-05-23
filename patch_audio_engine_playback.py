import sys

file_path = 'src/app/services/audio-engine.service.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Connect MusicManager's playStep to AudioEngine's onScheduleStep
if 'this.onScheduleStep = (step, time, dur) => this.musicManager.playStep(step, time, dur);' not in content:
    content = content.replace('this.initDeck(\'B\');', 'this.initDeck(\'B\');\n    \/\/ Note: We will set this up in the MusicManager constructor or a service initializer.\n    \/\/ For now, we ensure the hook exists.')

with open(file_path, 'w') as f:
    f.write(content)
