import os
import re

path = 'src/app/components/tha-spot/tha-spot.component.ts'
if os.path.exists(path):
    with open(path, 'r') as f:
        content = f.read()

    # 1. Fix duplicate featuredGame
    lines = content.splitlines()
    new_lines = []
    seen_featured = False
    for line in lines:
        if 'featuredGame = computed' in line:
            if seen_featured: continue
            seen_featured = True
        new_lines.append(line)
    content = '\n'.join(new_lines)

    # 2. Fix the onGameClick syntax error
    # It looked like: onGameClick(game: any) { this.launchGame(game); } but was inside some other block?
    # Actually, the error showed it was missing 'this.' or had bad braces.
    # Let's just make sure it's a proper method of the class.
    content = content.replace('onGameClick(game: any) {', '  onGameClick(game: any) {')
    content = content.replace('thisIsPlaying() {', '  thisIsPlaying() {')

    # Fix the stray this.toggleIntel();
    content = content.replace('  this.toggleIntel();', '  toggleIntelMethod() { this.toggleIntel(); }')

    with open(path, 'w') as f:
        f.write(content)

# Fix the fallback
fallback_path = 'src/app/hub/tha-spot-feed.fallback.ts'
if os.path.exists(fallback_path):
    with open(fallback_path, 'r') as f:
        fc = f.read()
    fc = fc.replace('"previewVideo":', '// "previewVideo":')
    fc = fc.replace('"bannerImage":', '// "bannerImage":')
    with open(fallback_path, 'w') as f:
        f.write(fc)
