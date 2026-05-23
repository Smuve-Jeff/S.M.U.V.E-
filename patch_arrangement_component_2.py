import sys

file_path = 'src/app/studio/arrangement-view/arrangement-view.component.ts'
with open(file_path, 'r') as f:
    content = f.read()

new_method = """
  getLanePoints(lane: any): string {
    if (!lane.points || lane.points.length === 0) return '';
    return lane.points.map((pt: any) => `${(pt.step / 16) * this.barWidth},${(1 - pt.value) * 48}`).join(' ');
  }
"""

if 'getLanePoints' not in content:
    insertion_point = content.find('addPoint(event: MouseEvent, trackId: number, lane: any) {')
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
                    content = content[:i+1] + new_method + content[i+1:]
                    break

with open(file_path, 'w') as f:
    f.write(content)
