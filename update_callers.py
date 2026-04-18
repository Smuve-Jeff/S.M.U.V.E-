import os
files = ['src/app/services/neural-mixer.service.ts', 'src/app/studio/arrangement-view/arrangement-view.component.ts', 'src/app/studio/channel-rack/channel-rack.component.ts', 'src/app/studio/mixer.service.ts', 'src/app/studio/mixer/mixer.component.ts']
for f in files:
    if os.path.exists(f):
        with open(f, 'r') as file: content = file.read()
        content = content.replace('.tracks.update', '.updateTracks')
        with open(f, 'w') as file: file.write(content)
