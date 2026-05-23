import sys

# Fix ArrangementViewComponent
file_path = 'src/app/studio/arrangement-view/arrangement-view.component.ts'
with open(file_path, 'r') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    if 'trackHeaderHeight = computed(() => this.showAutomation() ? 160 : 80);' in line:
        # We only want it once, and not inside onKeyUp
        continue
    if 'isAltPressed = false;' in line:
        new_lines.append(line)
        new_lines.append('  trackHeaderHeight = computed(() => this.showAutomation() ? 160 : 80);\n')
        continue
    new_lines.append(line)

with open(file_path, 'w') as f:
    f.writelines(new_lines)

# Fix PerformerComponent
file_path = 'src/app/studio/performer/performer.component.ts'
with open(file_path, 'r') as f:
    content = f.read()

if 'import { HapticService } from \'../../services/haptic.service\';' not in content:
    content = content.replace("import { LiveEngineService } from '../../services/live-engine.service';",
                              "import { LiveEngineService } from '../../services/live-engine.service';\nimport { HapticService } from '../../services/haptic.service';")

if 'private haptic = inject(HapticService);' not in content:
    content = content.replace('private liveEngine = inject(LiveEngineService);',
                              'private liveEngine = inject(LiveEngineService);\n  private haptic = inject(HapticService);')

with open(file_path, 'w') as f:
    f.write(content)

# Fix DrumMachine HTML
file_path = 'src/app/studio/drum-machine/drum-machine.component.html'
with open(file_path, 'r') as f:
    content = f.read()

# Fix the broken button tag
# Original broken: <button (click)="addAutomation("filter.cutoff")" class="mini-btn tactile-v42 mb-4 w-full">AUTO CUTOFF</button>
# Problem is nested double quotes
content = content.replace('<button (click)="addAutomation("filter.cutoff")"', '<button (click)="addAutomation(\'filter.cutoff\')"')

with open(file_path, 'w') as f:
    f.write(content)
