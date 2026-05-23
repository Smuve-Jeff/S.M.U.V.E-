import sys

file_path = 'src/app/services/music-manager.service.ts'
with open(file_path, 'r') as f:
    content = f.read()

automation_interface = """
export interface AutomationPoint {
  id: string;
  step: number;
  value: number;
  curve?: 'linear' | 'exp' | 'step';
}

export interface AutomationLane {
  id: string;
  parameter: string; // e.g. 'gain', 'pan', 'cutoff'
  points: AutomationPoint[];
  enabled: boolean;
}
"""

if 'AutomationLane' not in content:
    # Insert before TrackModel
    insertion_point = content.find('export interface TrackModel')
    if insertion_point != -1:
        content = content[:insertion_point] + automation_interface + content[insertion_point:]

with open(file_path, 'w') as f:
    f.write(content)
