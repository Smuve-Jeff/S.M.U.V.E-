import os
import re

def fix_tha_spot():
    path = 'src/app/components/tha-spot/tha-spot.component.ts'
    if not os.path.exists(path): return
    with open(path, 'r') as f:
        content = f.read()

    # Remove duplicate featuredGame
    lines = content.splitlines()
    new_lines = []
    seen_featured = False
    for line in lines:
        if 'featuredGame = computed' in line:
            if seen_featured: continue
            seen_featured = True
        new_lines.append(line)
    content = '\n'.join(new_lines)

    # Fix the onGameClick syntax error
    content = content.replace('this.onGameClick(game: Game) {', 'onGameClick(game: any) {')

    # Fix isPlaying and toggleIntel
    content = content.replace('isPlaying() {', 'thisIsPlaying() {')
    content = content.replace('toggleIntel();', 'this.toggleIntel();')

    with open(path, 'w') as f:
        f.write(content)

def fix_fallback():
    path = 'src/app/hub/tha-spot-feed.fallback.ts'
    if not os.path.exists(path): return
    with open(path, 'r') as f:
        fc = f.read()
    fc = fc.replace('"previewVideo":', '// "previewVideo":')
    with open(path, 'w') as f:
        f.write(fc)

fix_tha_spot()
fix_fallback()
