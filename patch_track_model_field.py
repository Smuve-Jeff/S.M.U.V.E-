import sys

file_path = 'src/app/services/music-manager.service.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Add automationLanes to TrackModel interface
if 'automationLanes?: AutomationLane[];' not in content:
    content = content.replace('activePatternSlotId?: string | null;', 'activePatternSlotId?: string | null;\n  automationLanes?: AutomationLane[];')

with open(file_path, 'w') as f:
    f.write(content)
