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

# Insert automation_html inside lane-row
if 'automation-lanes-container' not in content:
    # Append to the end of lane-row's content
    content = content.replace('<div class="clip-waveform">', '<div class="clip-waveform">')
    # Use the end of the clip loop
    content = content.replace('      </div>\n    </div>\n  </div>\n</div>', '          ' + automation_html + '\n      </div>\n    </div>\n  </div>\n</div>')

with open(file_path, 'w') as f:
    f.write(content)
