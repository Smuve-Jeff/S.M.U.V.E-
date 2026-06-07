import re

def patch_file(path, search_pattern, replace_content):
    with open(path, 'r') as f:
        content = f.read()
    new_content = re.sub(search_pattern, replace_content, content, flags=re.DOTALL)
    with open(path, 'w') as f:
        f.write(new_content)
    print(f"Patched {path}")

# Add DRUM_TRACK_ID constant and ensure it's created
patch_file('src/app/services/music-manager.service.ts',
    r'private static readonly DEFAULT_CLIP_LENGTH_BARS = 4;',
    r'private static readonly DEFAULT_CLIP_LENGTH_BARS = 4;\n  public static readonly DRUM_TRACK_ID = 100;')

patch_file('src/app/services/music-manager.service.ts',
    r'this.createTrack\(\'trap-808-elite\'\);',
    r"this.createTrack('trap-808-elite');\n    this.ensureDrumTrack();")

patch_file('src/app/services/music-manager.service.ts',
    r'ensureTrack\(instrumentId: string\) \{',
    r"""private ensureDrumTrack() {
    const tracks = this.tracks();
    if (!tracks.some(t => t.id === MusicManagerService.DRUM_TRACK_ID)) {
      const id = MusicManagerService.DRUM_TRACK_ID;
      const color = '#ff4d4d'; // Kick red
      const patternSlots = this.createDefaultPatternSlots();
      const newTrack: TrackModel = {
        id,
        name: 'S.M.U.V.E. DRUMS',
        instrumentId: 'trap-808-elite',
        type: 'midi',
        color,
        notes: [],
        clips: [
          this.createDefaultClip(id, 'Drum Pattern', color, patternSlots[0].id)
        ],
        fxSlots: [],
        gain: 1.0,
        pan: 0,
        sendA: 0,
        sendB: 0,
        mute: false,
        solo: false,
        steps: this.createEmptySteps(),
        patternSlots,
        activePatternSlotId: patternSlots[0].id
      };
      this.tracks.update(t => [...t, newTrack]);
    }
  }

  ensureTrack(instrumentId: string) {""")

print("MusicManager dedicated drum track patches applied.")
