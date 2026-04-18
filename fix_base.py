import os
path = 'src/app/components/tha-spot/tha-spot.component.ts'
if os.path.exists(path):
    with open(path, 'r') as f: content = f.read()
    lines = content.splitlines(); new_lines = []; seen = False
    for l in lines:
        if 'featuredGame = computed' in l:
            if seen: continue
            seen = True
        new_lines.append(l)
    content = '\n'.join(new_lines)
    content = content.replace('this.onGameClick(game: Game) {', 'onGameClick(game: any) {')
    content = content.replace('isPlaying() {', 'thisIsPlaying() {')
    content = content.replace('toggleIntel();', 'this.toggleIntel();')
    with open(path, 'w') as f: f.write(content)
with open('src/app/hub/tha-spot-feed.fallback.ts', 'r') as f: fc = f.read()
fc = fc.replace('"previewVideo":', '// "previewVideo":').replace('"bannerImage":', '// "bannerImage":')
with open('src/app/hub/tha-spot-feed.fallback.ts', 'w') as f: f.write(fc)
