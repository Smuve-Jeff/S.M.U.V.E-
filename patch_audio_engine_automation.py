import sys

file_path = 'src/app/services/audio-engine.service.ts'
with open(file_path, 'r') as f:
    content = f.read()

new_methods = """
  processAutomation(step: number, time: number) {
    this.tracks.forEach((track, id) => {
      if (track.automationLanes) {
        track.automationLanes.forEach((lane: any) => {
          if (!lane.enabled) return;
          const point = lane.points.find((p: any) => Math.floor(p.step) === step);
          if (point) {
            this.applyProductionParameter(id.toString(), lane.parameter, point.value, 0.05);
          }
        });
      }
    });
  }
"""

if 'processAutomation' not in content:
    insertion_point = content.find('  onScheduleStep?: (step: number, time: number, duration: number) => void;')
    if insertion_point != -1:
        content = content[:insertion_point] + new_methods + content[insertion_point:]

# Call processAutomation in scheduler
if 'this.processAutomation(stepIndex, this.nextNoteTime);' not in content:
    content = content.replace('this.onScheduleStep?.(stepIndex, this.nextNoteTime, stepDur);',
                              'this.processAutomation(stepIndex, this.nextNoteTime);\n      this.onScheduleStep?.(stepIndex, this.nextNoteTime, stepDur);')

with open(file_path, 'w') as f:
    f.write(content)
