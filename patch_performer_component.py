import sys

file_path = 'src/app/studio/performer/performer.component.ts'
with open(file_path, 'r') as f:
    content = f.read()

new_fields = """
  layout = signal<'keyboard' | 'pads' | 'matrix'>('keyboard');
  scenes = signal<any[]>(new Array(8).fill(null).map((_, i) => ({ id: i, name: `SCENE ${i+1}`, color: '#af25f4' })));
"""

content = content.replace("layout = signal<'keyboard' | 'pads'>('keyboard');", new_fields)

new_methods = """
  setLayout(mode: 'keyboard' | 'pads' | 'matrix') {
    this.layout.set(mode);
  }

  launchPattern(trackId: number, slotId: string) {
    this.musicManager.setActivePatternSlot(trackId, slotId);
    this.haptic.impact('medium');
  }

  launchScene(sceneIndex: number) {
    this.musicManager.tracks().forEach(track => {
      if (track.patternSlots && track.patternSlots[sceneIndex]) {
        this.musicManager.setActivePatternSlot(track.id, track.patternSlots[sceneIndex].id);
      }
    });
    this.haptic.notification('success');
  }
"""

if 'launchScene' not in content:
    content = content.replace("setLayout(mode: 'keyboard' | 'pads') {\n    this.layout.set(mode);\n  }", new_methods)

with open(file_path, 'w') as f:
    f.write(content)
