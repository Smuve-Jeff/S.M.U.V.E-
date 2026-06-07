import re

def patch_file(path, search_pattern, replace_content):
    with open(path, 'r') as f:
        content = f.read()
    new_content = re.sub(search_pattern, replace_content, content, flags=re.DOTALL)
    with open(path, 'w') as f:
        f.write(new_content)
    print(f"Patched {path}")

# PerformanceGrid: Add Mixer levels/meters to the track headers
patch_file('src/app/studio/performance-grid/performance-grid.component.ts',
    r"private haptic = inject\(HapticService\);",
    r"private haptic = inject(HapticService);\n  private audioSession = inject(AudioSessionService);\n\n  trackLevels = signal<Record<number, number>>({});\n  private analysers = new Map<number, AnalyserNode>();\n  private animationFrame: number | null = null;")

patch_file('src/app/studio/performance-grid/performance-grid.component.ts',
    r"rows = Array\.from\(\{ length: 8 \}, \(_, index\) => index\);",
    r"""rows = Array.from({ length: 8 }, (_, index) => index);

  ngOnInit() {
    this.startMetering();
  }

  ngOnDestroy() {
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
  }

  private startMetering() {
    const update = () => {
      const levels: Record<number, number> = {};
      this.tracks().forEach(track => {
        let analyser = this.analysers.get(track.id);
        if (!analyser) {
          analyser = this.audioSession.engine.ctx.createAnalyser();
          analyser.fftSize = 32;
          this.audioSession.engine.getTrackOutput(track.id).connect(analyser);
          this.analysers.set(track.id, analyser);
        }
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        levels[track.id] = (data.reduce((a,b) => a+b, 0) / data.length) / 255;
      });
      this.trackLevels.set(levels);
      this.animationFrame = requestAnimationFrame(update);
    };
    this.animationFrame = requestAnimationFrame(update);
  }

  getTrackLevel(id: number) { return this.trackLevels()[id] || 0; }""")

patch_file('src/app/studio/performance-grid/performance-grid.component.ts',
    r"import \{ Component, inject \} from '@angular/core';",
    r"import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';\nimport { AudioSessionService } from '../audio-session.service';")

# Update HTML to show levels
patch_file('src/app/studio/performance-grid/performance-grid.component.html',
    r'<div class="w-2 h-2 rounded-full shadow-\[0_0_8px_currentColor\].*?</div>',
    r"""<div class="vu-meter-mini w-12 h-1 bg-black/40 rounded-full relative overflow-hidden">
            <div class="absolute inset-y-0 left-0 bg-fl-blue transition-all duration-75" [style.width.%]="getTrackLevel(track.id) * 100"></div>
          </div>""")

print("Performance mixing integration applied.")
