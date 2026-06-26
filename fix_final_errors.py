import sys
import re

def replace_in_file(path, old, new):
    """
    Replace all occurrences of one string with another in a file.
    
    Parameters:
    	path: The file to update.
    	old: The text to replace.
    	new: The replacement text.
    """
    with open(path, 'r') as f:
        content = f.read()
    content = content.replace(old, new)
    with open(path, 'w') as f:
        f.write(content)

# 1. Fix MusicManagerService redeclarations
path_mm = 'src/app/services/music-manager.service.ts'
with open(path_mm, 'r') as f:
    mm_content = f.read()
# Find the playStep method and fix redeclarations of stepInBar
# It seems I added swing logic which also declared stepInBar
mm_content = mm_content.replace('const stepInBar = step % 16;\n    const stepInBar = step % 16;', 'const stepInBar = step % 16;')
# Also handle other potential double declarations if my previous sed/scripts were messy
mm_content = re.sub(r'const stepInBar = step % 16;\s+const stepInBar = step % 16;', 'const stepInBar = step % 16;', mm_content)

with open(path_mm, 'w') as f:
    f.write(mm_content)

# 2. Fix ArrangementViewComponent missing createGroup
path_av = 'src/app/studio/arrangement-view/arrangement-view.component.ts'
with open(path_av, 'r') as f:
    av_content = f.read()
if 'createGroup()' not in av_content:
    av_content = av_content.replace('toggleAutomationView() {', 'createGroup() { this.musicManager.addTrack("New Group", "none", "bus"); }\n  toggleAutomationView() {')
with open(path_av, 'w') as f:
    f.write(av_content)

# 3. Fix ChannelRackComponent template errors (.stopPropagation -> $event.stopPropagation)
path_cr_html = 'src/app/studio/channel-rack/channel-rack.component.html'
replace_in_file(path_cr_html, '; .stopPropagation()', '; $event.stopPropagation()')

# 4. Fix PianoRollComponent missing properties
path_pr = 'src/app/studio/piano-roll/piano-roll.component.ts'
with open(path_pr, 'r') as f:
    pr_content = f.read()
if 'activeChord' not in pr_content:
    pr_content = pr_content.replace('toggleFold() {', 'activeChord = signal("maj");\n  chordTypes = ["maj", "min", "maj7", "min7", "dom7", "sus4"];\n  setChord(type: string) { this.activeChord.set(type); }\n  toggleFold() {')
with open(path_pr, 'w') as f:
    f.write(pr_content)

print("Final error fixes applied.")
