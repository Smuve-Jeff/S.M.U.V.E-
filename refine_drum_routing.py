import re

def patch_file(path, search_pattern, replace_content):
    with open(path, 'r') as f:
        content = f.read()
    new_content = re.sub(search_pattern, replace_content, content, flags=re.DOTALL)
    with open(path, 'w') as f:
        f.write(new_content)
    print(f"Patched {path}")

# DrumMachineComponent: Ensure playPadSound uses dedicated drum track
patch_file('src/app/studio/drum-machine/drum-machine.component.ts',
    r"private playPadSound\(pad: DrumPad, velocity: number = 0.8\) \{.*?const trackId = this.selectedTrackId\(\) \?\? 0;",
    r"private playPadSound(pad: DrumPad, velocity: number = 0.8) {\n    const trackId = MusicManagerService.DRUM_TRACK_ID;")

# Ensure syncToMusicManager always uses the dedicated track if no track is selected
# Actually, the user wants a dedicated track, so maybe it should ALWAYS use DRUM_TRACK_ID
# for drum machine notes, regardless of selection?
# "want the Drum Machine to have its own dedicated Mixer track where its audio is always routed"
patch_file('src/app/studio/drum-machine/drum-machine.component.ts',
    r"const trackId = this.selectedTrackId\(\) \?\? MusicManagerService.DRUM_TRACK_ID;",
    r"const trackId = MusicManagerService.DRUM_TRACK_ID;")

print("Drum Machine routing refined to dedicated track.")
