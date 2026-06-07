import re

def patch_file(path, search_pattern, replace_content):
    with open(path, 'r') as f:
        content = f.read()
    new_content = re.sub(search_pattern, replace_content, content, flags=re.DOTALL)
    with open(path, 'w') as f:
        f.write(new_content)
    print(f"Patched {path}")

# PerformerComponent: Add mixing controls (selected track)
patch_file('src/app/studio/performer/performer.component.ts',
    r"pitchBend = signal\(0\);",
    r"pitchBend = signal(0);\n  selectedTrack = computed(() => this.musicManager.tracks().find(t => t.id === this.musicManager.selectedTrackId()));")

patch_file('src/app/studio/performer/performer.component.ts',
    r"async setInstrument\(presetId: string\) \{",
    r"""updateTrackVolume(val: number) {
    const trackId = this.musicManager.selectedTrackId();
    if (trackId !== null) {
      this.musicManager.tracks.update(ts => ts.map(t => t.id === trackId ? { ...t, gain: val / 100 } : t));
      this.musicManager.engine.updateTrack(trackId, { gain: val / 100 });
    }
  }

  updateTrackPan(val: number) {
    const trackId = this.musicManager.selectedTrackId();
    if (trackId !== null) {
      this.musicManager.tracks.update(ts => ts.map(t => t.id === trackId ? { ...t, pan: val / 100 } : t));
      this.musicManager.engine.updateTrack(trackId, { pan: val / 100 });
    }
  }

  async setInstrument(presetId: string) {""")

# Update HTML to show mixing dashboard
with open('src/app/studio/performer/performer.component.html', 'r') as f:
    html = f.read()

# Add a mixing/instrument dock at the top or bottom
mixing_html = """
    <div class="performer-dashboard glass-v42 border-b border-white/10 p-4 flex items-center justify-between gap-6">
      <div class="instrument-selector flex items-center gap-3">
        <span class="material-symbols-outlined text-fl-blue text-sm">tune</span>
        <select
          [ngModel]="activeInstrumentId()"
          (ngModelChange)="setInstrument()"
          class="executive-glass text-[10px] px-3 py-1.5 rounded-lg border-white/10"
        >
          <option *ngFor="let inst of availableInstruments()" [value]="inst.id">{{ inst.name }}</option>
        </select>
      </div>

      <div class="mixing-quick-controls flex items-center gap-6" *ngIf="selectedTrack() as track">
        <div class="track-info">
          <div class="text-[7px] text-slate-500 uppercase font-black">Active Track</div>
          <div class="text-[10px] text-white font-bold">{{ track.name }}</div>
        </div>
        <app-knob label="VOL" [min]="0" [max]="150" [value]="track.gain * 100" (valueChange)="updateTrackVolume()"></app-knob>
        <app-knob label="PAN" [min]="-100" [max]="100" [value]="track.pan * 100" (valueChange)="updateTrackPan()"></app-knob>
      </div>

      <div class="performance-toggles flex items-center gap-2">
        <button
          (click)="toggleSmartChords()"
          class="tactile-v42 px-3 py-1.5 text-[8px] font-black uppercase rounded-lg border border-white/10"
          [class.bg-fl-blue]="smartChords()"
          [class.text-black]="smartChords()"
        >
          Smart Chords
        </button>
      </div>
    </div>
"""

# Insert after the header
patch_file('src/app/studio/performer/performer.component.html',
    r'<div class="performer-content.*?>',
    r'<div class="performer-content flex-1 flex flex-col min-h-0">' + mixing_html)

print("Performer mixing and instrument dashboard added.")
