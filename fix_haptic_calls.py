import sys

file_path = 'src/app/studio/performer/performer.component.ts'
with open(file_path, 'r') as f:
    content = f.read()

content = content.replace("this.haptic.impact('medium');", "this.haptic.medium();")
content = content.replace("this.haptic.notification('success');", "this.haptic.success();")

with open(file_path, 'w') as f:
    f.write(content)
