import re

def patch_file(path, search_pattern, replace_content):
    with open(path, 'r') as f:
        content = f.read()
    new_content = re.sub(search_pattern, replace_content, content, flags=re.DOTALL)
    with open(path, 'w') as f:
        f.write(new_content)
    print(f"Patched {path}")

# Fix the broken syncToMusicManager and remove duplication
with open('src/app/studio/drum-machine/drum-machine.component.ts', 'r') as f:
    content = f.read()

# Find the first syncToMusicManager and its duplicate
# We'll just replace the whole section from where it starts to the end of the class.

start_marker = "  private syncToMusicManager() {"
end_marker = "}\n}"

parts = content.split(start_marker)
if len(parts) > 1:
    # Keep everything before the first occurrence
    base_content = parts[0]

    new_sync_logic = """  private syncToMusicManager() {
    const trackId = this.selectedTrackId() ?? MusicManagerService.DRUM_TRACK_ID;

    const allNotes: TrackNote[] = [];
    this.pads().forEach((pad) => {
      pad.steps.forEach((step, index) => {
        if (!step.active) return;
        allNotes.push({
          id: `drum-${pad.id}-${index}`,
          midi: pad.midi,
          step: index,
          length: 1,
          velocity: step.velocity,
          probability: step.probability,
          offset: step.nudge,
          pan: pad.params.pan,
          cutoff: pad.params.cutoff
        });
      });
    });

    this.musicManager.tracks.update(tracks =>
      tracks.map(t => t.id === trackId ? { ...t, notes: allNotes } : t)
    );
  }

  private syncFromMusicManager(notes: TrackNote[]) {
    this.pads.update((pads) =>
      pads.map((pad) => {
        const newSteps = this.initSteps();
        notes.forEach((note) => {
          const stepIndex = this.normalizeStep(Math.round(note.step));
          if (note.midi === pad.midi) {
            newSteps[stepIndex] = {
              active: true,
              velocity: note.velocity,
              probability: note.probability ?? 1,
              nudge: note.offset ?? 0,
            };
          }
        });
        return { ...pad, steps: newSteps };
      })
    );
  }
}"""
    with open('src/app/studio/drum-machine/drum-machine.component.ts', 'w') as f:
        f.write(base_content + new_sync_logic)
    print("Fixed sync duplication and logic in DrumMachineComponent")
