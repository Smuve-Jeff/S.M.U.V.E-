import re

def patch_file(path, search_pattern, replace_content):
    with open(path, 'r') as f:
        content = f.read()
    new_content = re.sub(search_pattern, replace_content, content, flags=re.DOTALL)
    with open(path, 'w') as f:
        f.write(new_content)
    print(f"Patched {path}")

# Refine syncToMusicManager to also update the active pattern slot's notes
patch_file('src/app/studio/drum-machine/drum-machine.component.ts',
    r"this.musicManager.tracks.update\(tracks =>.*?tracks.map\(t => t.id === trackId \? \{ \.\.\.t, notes: allNotes \} : t\).*?\);",
    r"""this.musicManager.tracks.update(tracks =>
      tracks.map(t => {
        if (t.id !== trackId) return t;
        const updatedTrack = { ...t, notes: allNotes };
        // Also update the active pattern slot so clips play the new notes
        if (updatedTrack.patternSlots && updatedTrack.activePatternSlotId) {
          updatedTrack.patternSlots = updatedTrack.patternSlots.map(slot => {
            if (slot.id !== updatedTrack.activePatternSlotId) return slot;
            return {
              ...slot,
              versions: slot.versions.map(v => v.id === slot.activeVersionId ? { ...v, notes: [...allNotes] } : v)
            };
          });
        }
        return updatedTrack;
      })
    );""")

print("Drum Machine sync refinement applied.")
