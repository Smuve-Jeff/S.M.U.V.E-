import sys

file_path = 'src/app/studio/arrangement-view/arrangement-view.component.ts'
with open(file_path, 'r') as f:
    content = f.read()

new_fields = """
  showAutomation = signal(false);

  toggleAutomation() {
    this.showAutomation.update(v => !v);
  }

  addLane(trackId: number, parameter: string) {
    this.musicManager.addAutomationLane(trackId, parameter);
  }

  addPoint(event: MouseEvent, trackId: number, lane: any) {
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const step = (x / this.barWidth) * 16; // 16 steps per bar
    const value = 1 - (y / rect.height);
    this.musicManager.addAutomationPoint(trackId, lane.id, step, value);
  }
"""

if 'showAutomation =' not in content:
    insertion_point = content.find('tracks = this.musicManager.tracks;')
    if insertion_point != -1:
        content = content[:insertion_point] + new_fields + content[insertion_point:]

with open(file_path, 'w') as f:
    f.write(content)
