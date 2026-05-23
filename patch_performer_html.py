import sys

file_path = 'src/app/studio/performer/performer.component.html'
with open(file_path, 'r') as f:
    content = f.read()

# Update layout selector
content = content.replace("DRUM PADS\n      </button>", "DRUM PADS\n      </button>\n      <button\n        [class.active]=\"layout() === 'matrix'\"\n        (click)=\"setLayout('matrix')\"\n        class=\"layout-btn tactile-v42 px-6 py-2 rounded-lg font-black text-[10px] uppercase tracking-wider transition-all\"\n      >\n        <span class=\"material-symbols-outlined text-sm block mb-1\">grid_view</span>\n        CLIP MATRIX\n      </button>")

# Add matrix view
matrix_view = """
    <!-- Clip Matrix Layout (New Professional Feature) -->
    <div *ngIf="layout() === 'matrix'" class="matrix-view h-full flex flex-col p-6 overflow-auto">
      <div class="matrix-grid flex flex-col gap-4">
        <!-- Scene Launchers -->
        <div class="scenes-row flex gap-4 mb-4">
          <div class="w-24"></div>
          <button *ngFor="let scene of scenes(); let i = index"
            (click)="launchScene(i)"
            class="scene-btn glass-v42 px-4 py-2 rounded-lg border border-white/20 font-black text-[10px] uppercase tracking-widest hover:bg-neon-purple/20 transition-all">
            SCENE {{ i + 1 }}
          </button>
        </div>

        <!-- Track Rows -->
        <div *ngFor="let track of musicManager.tracks()" class="track-row flex gap-4 items-center">
          <div class="w-24 font-black text-[10px] uppercase opacity-50 truncate">{{ track.name }}</div>
          <div class="clips-container flex gap-4">
            <button *ngFor="let scene of scenes(); let i = index"
              (click)="launchPattern(track.id, 'slot-' + i)"
              class="clip-btn tactile-v42 w-24 h-16 rounded-xl border border-white/5 flex flex-col items-center justify-center gap-1 group overflow-hidden relative"
              [style.border-left-color]="track.color"
              [style.border-left-width.px]="4"
            >
              <div class="clip-status absolute inset-0 opacity-0 group-hover:opacity-10 bg-white"></div>
              <span class="text-[8px] font-black opacity-40">SLOT {{ i + 1 }}</span>
              <div *ngIf="track.activePatternSlotId === 'slot-' + i" class="active-pulse absolute bottom-2 right-2 w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_#10b981]"></div>
            </button>
          </div>
        </div>
      </div>
    </div>
"""

content = content.replace("<!-- Pads Layout (Performance Optimized) -->", matrix_view + "\n    <!-- Pads Layout (Performance Optimized) -->")

with open(file_path, 'w') as f:
    f.write(content)
