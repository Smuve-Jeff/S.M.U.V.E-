import re

def patch_file(path, search_pattern, replace_content):
    with open(path, 'r') as f:
        content = f.read()
    new_content = re.sub(search_pattern, replace_content, content, flags=re.DOTALL)
    with open(path, 'w') as f:
        f.write(new_content)
    print(f"Patched {path}")

# Add updateSynthParams to MusicManagerService
patch_file('src/app/services/music-manager.service.ts',
    r'midiToFreq\(midi: number\): number \{.*?\}',
    r"""midiToFreq(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  updateSynthParams(trackId: number, params: any) {
    this.tracks.update(tracks => tracks.map(t => {
      if (t.id !== trackId) return t;
      return {
        ...t,
        synthParams: { ...(t.synthParams || {}), ...params }
      };
    }));
  }""")

print("MusicManager updateSynthParams added.")
