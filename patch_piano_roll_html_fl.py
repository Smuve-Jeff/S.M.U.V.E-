import sys

file_path = 'src/app/studio/piano-roll/piano-roll.component.html'
with open(file_path, 'r') as f:
    content = f.read()

ghost_html = """
        <!-- Ghost Notes (FL Studio Style) -->
        <div
          *ngFor="let note of ghostNotes()"
          class="ghost-note absolute opacity-20 pointer-events-none"
          [style.left.px]="note.step * cellWidth()"
          [style.top.px]="(127 - note.midi) * rowHeight()"
          [style.width.px]="note.length * cellWidth()"
          [style.height.px]="rowHeight()"
          [style.background-color]="note.trackColor"
          [style.border]="'1px solid ' + note.trackColor"
        ></div>
"""

if 'ghost-note' not in content:
    content = content.replace('<!-- Notes -->', ghost_html + '\n        <!-- Notes -->')

# Add scale highlighting to grid rows
content = content.replace('[class.black-row]="isBlackKey(midi)"', '[class.black-row]="isBlackKey(midi)" [class.scale-highlight]="isInScale(midi)"')

with open(file_path, 'w') as f:
    f.write(content)
