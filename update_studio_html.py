import sys

file_path = 'src/app/studio/studio.component.html'
with open(file_path, 'r') as f:
    content = f.read()

# Add DJ button to navigation
old_nav_buttons = """         <button (click)="activeView.set('mixer')"
                 [class.bg-emerald-500]="activeView() === 'mixer'"
                 [class.text-black]="activeView() === 'mixer'"
                 class="px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all">Mixer</button>"""

new_nav_buttons = old_nav_buttons + """
         <button (click)="activeView.set('dj')"
                 [class.bg-emerald-500]="activeView() === 'dj'"
                 [class.text-black]="activeView() === 'dj'"
                 class="px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all">DJ Booth</button>"""

content = content.replace(old_nav_buttons, new_nav_buttons)

# Add DJ view to main content
old_waveform_renderer = """    <!-- RECORDING MONITOR -->
    <div class="absolute bottom-12 right-12 z-[300] w-96 shadow-2xl" *ngIf="isRecording()">
       <app-waveform-renderer></app-waveform-renderer>
    </div>"""

new_dj_view = """    <!-- DJ BOOTH VIEW -->
    <div class="dj-view h-full overflow-y-auto" [class.hidden]="activeView() !== 'dj'">
       <app-dj-deck></app-dj-deck>
    </div>

""" + old_waveform_renderer

content = content.replace(old_waveform_renderer, new_dj_view)

with open(file_path, 'w') as f:
    f.write(content)
