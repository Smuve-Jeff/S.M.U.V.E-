import sys

with open('src/app/studio/performer/performer.component.ts', 'r') as f:
    content = f.read()

if 'audioSession = inject(AudioSessionService);' not in content:
    insertion_point = content.find('musicManager = inject(MusicManagerService);')
    if insertion_point != -1:
        end_of_line = content.find('\n', insertion_point) + 1
        content = content[:end_of_line] + '  public audioSession = inject(AudioSessionService);\n' + content[end_of_line:]

with open('src/app/studio/performer/performer.component.html', 'r') as f:
    html = f.read()

html = html.replace('musicManager.isPlaying()', 'audioSession.isPlaying()')
html = html.replace('musicManager.isRecording()', 'audioSession.isRecording()')
html = html.replace('musicManager.togglePlay()', 'audioSession.togglePlay()')
html = html.replace('musicManager.toggleRecord()', 'audioSession.toggleRecord()')

with open('src/app/studio/performer/performer.component.html', 'w') as f:
    f.write(html)

with open('src/app/studio/performer/performer.component.ts', 'w') as f:
    f.write(content)
