import sys

file_path = 'src/app/services/music-manager.service.ts'
with open(file_path, 'r') as f:
    content = f.read()

new_methods = """
  addAutomationLane(trackId: number, parameter: string) {
    this.tracks.update(ts => ts.map(t => {
      if (t.id !== trackId) return t;
      const lanes = t.automationLanes || [];
      const newLane: AutomationLane = {
        id: `lane-${Date.now()}`,
        parameter,
        points: [],
        enabled: true
      };
      return { ...t, automationLanes: [...lanes, newLane] };
    }));
  }

  addAutomationPoint(trackId: number, laneId: string, step: number, value: number) {
    this.tracks.update(ts => ts.map(t => {
      if (t.id !== trackId) return t;
      return {
        ...t,
        automationLanes: (t.automationLanes || []).map(l => {
          if (l.id !== laneId) return l;
          const newPoint: AutomationPoint = { id: `pt-${Date.now()}-${Math.random()}`, step, value };
          return { ...l, points: [...l.points, newPoint].sort((a, b) => a.step - b.step) };
        })
      };
    }));
  }
"""

if 'addAutomationLane' not in content:
    insertion_point = content.find('setActivePatternSlot(trackId: number, slotId: string) {')
    if insertion_point != -1:
        bracket_count = 0
        started = False
        for i in range(insertion_point, len(content)):
            if content[i] == '{':
                bracket_count += 1
                started = True
            elif content[i] == '}':
                bracket_count -= 1
                if started and bracket_count == 0:
                    content = content[:i+1] + new_methods + content[i+1:]
                    break

with open(file_path, 'w') as f:
    f.write(content)
