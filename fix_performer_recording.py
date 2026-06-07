import re

def patch_file(path, search_pattern, replace_content):
    with open(path, 'r') as f:
        content = f.read()
    new_content = re.sub(search_pattern, replace_content, content, flags=re.DOTALL)
    with open(path, 'w') as f:
        f.write(new_content)
    print(f"Patched {path}")

# MusicManagerService: Ensure recordLiveNote handles length 1 properly (will be updated on release)
patch_file('src/app/services/music-manager.service.ts',
    r'return this\.addNoteToTrack\(selectedId, \{.*?midi,.*?step: currentStepValue,.*?length: 1,.*?velocity,.*?\}\);',
    r"""const noteId = `note-${Date.now()}-${Math.random()}`;
    this.addNoteToTrack(selectedId, {
      id: noteId,
      midi,
      step: currentStepValue,
      length: 0.1, // Initial short length, to be extended by key release
      velocity,
    });
    return noteId;""")

# PerformerComponent: Correct length calculation to Bars (MM expects bars/steps)
# In MM, lengths are usually in steps or bars depending on playback logic.
# Looking at mm.playStep: note.length * duration. duration is stepDuration.
# So note.length is in STEPS.

patch_file('src/app/studio/performer/performer.component.ts',
    r'let length = \(currentStep - recNote\.startStep \+ this\.PATTERN_STEPS\) % this\.PATTERN_STEPS;.*?if \(length === 0\) length = this\.PATTERN_STEPS;',
    r"""let length = (currentStep - recNote.startStep + 1024) % 1024;
        if (length <= 0) length = 1;
        // Convert steps to the MM format (which seems to be treated as 1.0 = 1 step in some places, or 1.0 = 1 bar in others)
        // Given playStep: note.length * duration, it's definitely step-based.
        this.musicManager.setNoteParam(selectedId, recNote.id, 'length', length);""")

print("Performer recording logic fixed.")
