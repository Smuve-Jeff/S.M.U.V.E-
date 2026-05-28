import sys

with open('src/app/studio/piano-roll/piano-roll.component.html', 'r') as f:
    html = f.read()

html = html.replace('musicManager.isPlaying()', 'audioSession.isPlaying()')
html = html.replace('musicManager.isRecording()', 'audioSession.isRecording()')
html = html.replace('musicManager.toggleRecord()', 'audioSession.toggleRecord()')

with open('src/app/studio/piano-roll/piano-roll.component.html', 'w') as f:
    f.write(html)
