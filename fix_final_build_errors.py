import sys

# 1. Update ArrangementViewComponent with createGroup and other missing logic
av_path = 'src/app/studio/arrangement-view/arrangement-view.component.ts'
with open(av_path, 'r') as f:
    av_ts = f.read()

group_logic = """
  createGroup() {
    this.musicManager.addTrack("New Group", "none", "bus");
  }
"""

if 'createGroup()' not in av_ts:
    # Inject before end of class
    av_ts = av_ts.rstrip()[:-1] + group_logic + "\n}"
    with open(av_path, 'w') as f:
        f.write(av_ts)

# 2. Update PianoRollComponent with activeChord etc.
pr_path = 'src/app/studio/piano-roll/piano-roll.component.ts'
with open(pr_path, 'r') as f:
    pr_ts = f.read()

piano_roll_logic = """
  activeChord = signal("maj");
  chordTypes = ["maj", "min", "maj7", "min7", "dom7", "sus4"];
  setChord(type: string) { this.activeChord.set(type); }
"""

if 'activeChord' not in pr_ts:
    pr_ts = pr_ts.rstrip()[:-1] + piano_roll_logic + "\n}"
    with open(pr_path, 'w') as f:
        f.write(pr_ts)

# 3. Fix MusicManagerService stepInBar
mm_path = 'src/app/services/music-manager.service.ts'
with open(mm_path, 'r') as f:
    mm_ts = f.read()

# Remove the extra line I likely introduced with my previous messy script
mm_ts = mm_ts.replace('const stepInBar = step % 16;\n    const stepInBar = step % 16;', 'const stepInBar = step % 16;')

with open(mm_path, 'w') as f:
    f.write(mm_ts)

print("Final build error fixes applied.")
