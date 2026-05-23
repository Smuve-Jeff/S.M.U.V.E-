import sys

file_path = 'src/app/studio/arrangement-view/arrangement-view.component.html'
with open(file_path, 'r') as f:
    content = f.read()

automation_html = """
          <!-- Automation Lanes -->
          <div *ngIf="showAutomation()" class="automation-lanes-container flex flex-col w-full bg-black/20 border-t border-white/5">
            <div *ngFor="let lane of track.automationLanes" class="automation-lane relative h-12 w-full border-b border-white/5 cursor-crosshair"
                 (click)="addPoint($event, track.id, lane)">
              <div class="lane-label absolute left-2 top-1 text-[6px] font-black uppercase opacity-30">{{ lane.parameter }}</div>

              <!-- Automation Line SVG -->
              <svg class="absolute inset-0 w-full h-full pointer-events-none">
                <polyline
                  fill="none"
                  [attr.stroke]="track.color"
                  stroke-width="1"
                  [attr.points]="getLanePoints(lane)"
                />
                <circle *ngFor="let pt of lane.points"
                  [attr.cx]="(pt.step / 16) * barWidth"
                  [attr.cy]="(1 - pt.value) * 48"
                  r="2"
                  [attr.fill]="track.color"
                  class="extreme-glow"
                />
              </svg>
            </div>
            <button (click)="addLane(track.id, 'gain')" class="text-[6px] font-black p-1 opacity-20 hover:opacity-100 transition-opacity">+ ADD GAIN AUTO</button>
          </div>
"""

# Insert automation_html after lane-row's closing div for clips
insertion_mark = '<div\n            *ngFor="let clip of track.clips"\n            class="clip-item'
# Better to find where lane-row content ends.
# I'll look for the end of the clip loop and the parent div.

if 'automation-lanes-container' not in content:
    # Let's use a more targeted replacement
    old_block = """          <div
            *ngFor="let clip of track.clips"
            class="clip-item executive-glass shadow-v42-xl tactile-v42 group"
            draggable="true"
            (dragstart)="onClipDragStart(, track.id, clip)"
            (dragend)="onClipDragEnd()"
            [style.left.px]="clip.start * barWidth"
            [style.width.px]="clip.length * barWidth"
            [style.background-color]="(clip.color || '#af25f4') + '33'"
            [style.border-color]="clip.color || '#af25f4'"
            (click)="selectClip(clip.id, )"
          >
            <div class="clip-header neon-text-xs">
              {{ clip.name | uppercase }}
            </div>

            <!-- Resize Handles -->
            <div class="resize-handle right opacity-0 group-hover:opacity-100 transition-opacity"
                 (mousedown)=".stopPropagation(); resizeClip(track.id, clip.id, 0.5)"></div>

            <div class="clip-waveform">
              <svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
                <path d="M0 50 L 10 20 L 20 80 L 30 10 L 40 90 L 50 50 L 60 20 L 70 80 L 80 10 L 90 90 L 100 50" [attr.stroke]="clip.color || '#af25f4'" stroke-width="1" fill="none" class="extreme-glow" />
              </svg>
            </div>
          </div>"""

    content = content.replace(old_block, old_block + automation_html)

with open(file_path, 'w') as f:
    f.write(content)
