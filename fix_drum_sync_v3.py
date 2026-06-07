import re

def patch_file(path, search_pattern, replace_content):
    with open(path, 'r') as f:
        content = f.read()
    new_content = re.sub(search_pattern, replace_content, content, flags=re.DOTALL)
    with open(path, 'w') as f:
        f.write(new_content)
    print(f"Patched {path}")

# DrumMachineComponent: Change sync logic to dedicated drum track
patch_file('src/app/studio/drum-machine/drum-machine.component.ts',
    r"readonly selectedTrackId = this\.musicManager\.selectedTrackId;",
    r"readonly selectedTrackId = this.musicManager.selectedTrackId;\n  readonly drumTrack = computed(() => this.musicManager.tracks().find(t => t.id === MusicManagerService.DRUM_TRACK_ID));")

patch_file('src/app/studio/drum-machine/drum-machine.component.ts',
    r"effect\(\(\) => \{.*?const track = this\.selectedTrack\(\);.*?if \(track\) \{.*?this\.syncFromMusicManager\(track\.notes\);.*?\}.*?\}\);",
    r"""effect(() => {
      const track = this.drumTrack();
      if (track) {
        // Only sync from MM if we are not the one who just updated it (avoid loops)
        // For now, simple sync is fine as syncFromMusicManager recreates steps
        this.syncFromMusicManager(track.notes);
      }
    });""")

# Improve playhead timing by adding a 'smoothStep' signal to AudioEngineService
# and using it in components for visuals.

print("Drum Machine sync focusing on dedicated track.")
