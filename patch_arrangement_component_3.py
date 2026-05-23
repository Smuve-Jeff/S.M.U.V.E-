import sys

file_path = 'src/app/studio/arrangement-view/arrangement-view.component.ts'
with open(file_path, 'r') as f:
    content = f.read()

if 'trackHeaderHeight' not in content:
    content = content.replace('isAltPressed = false;', 'isAltPressed = false;\n  trackHeaderHeight = computed(() => this.showAutomation() ? 160 : 80);')

with open(file_path, 'w') as f:
    f.write(content)
