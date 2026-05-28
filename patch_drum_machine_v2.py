import sys

with open('src/app/studio/drum-machine/drum-machine.component.ts', 'r') as f:
    content = f.read()

# Add AudioSessionService injection
if 'audioSession = inject(AudioSessionService);' not in content:
    insertion_point = content.find('aiService = inject(AiService);')
    if insertion_point != -1:
        end_of_line = content.find('\n', insertion_point) + 1
        content = content[:end_of_line] + '  audioSession = inject(AudioSessionService);\n' + content[end_of_line:]

# Replace engine.togglePlay with audioSession.togglePlay in HTML
with open('src/app/studio/drum-machine/drum-machine.component.html', 'r') as f:
    html = f.read()

html = html.replace('engine.togglePlay()', 'audioSession.togglePlay()')
html = html.replace('engine.toggleRecord()', 'audioSession.toggleRecord()')
html = html.replace('engine.isPlaying()', 'audioSession.isPlaying()')
html = html.replace('engine.isRecording()', 'audioSession.isRecording()')

with open('src/app/studio/drum-machine/drum-machine.component.html', 'w') as f:
    f.write(html)

with open('src/app/studio/drum-machine/drum-machine.component.ts', 'w') as f:
    f.write(content)
