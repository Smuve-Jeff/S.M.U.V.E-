import re

def patch_file(path, search_pattern, replace_content):
    with open(path, 'r') as f:
        content = f.read()
    new_content = re.sub(search_pattern, replace_content, content, flags=re.DOTALL)
    with open(path, 'w') as f:
        f.write(new_content)
    print(f"Patched {path}")

# DrumMachineComponent: Stop individual effect that might be racing, and improve playhead step signal
patch_file('src/app/studio/drum-machine/drum-machine.component.ts',
    r"this.evolutionEffect = effect\(\(\) => \{.*?\}\);",
    r"// Logic moved to sequencer tick")

# Replace syncToMusicManager to handle dedicated track and proper timing
# First find the dedicated track ID or create it.
# We'll assume track 100 for now as 'Drum Machine' track if it doesn't exist.

patch_file('src/app/studio/drum-machine/drum-machine.component.ts',
    r"private syncToMusicManager\(\) \{.*?\}",
    r"""private syncToMusicManager() {
    const trackId = this.selectedTrackId();
    if (trackId === null) return;

    const allNotes: TrackNote[] = [];
    this.pads().forEach((pad) => {
      pad.steps.forEach((step, index) => {
        if (!step.active) return;
        allNotes.push({
          id: ,
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
  }""")

print("Drum Machine sync patches applied.")
