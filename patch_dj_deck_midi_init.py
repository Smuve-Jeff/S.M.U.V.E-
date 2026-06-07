import os
import re

file_path = 'src/app/studio/dj-deck/dj-deck.component.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Add DjMidiService import
if 'DjMidiService' not in content:
    content = content.replace("import {", "import { DjMidiService,")

# Add djMidiService to properties
class_props_pattern = r'private\ aiService\ =\ inject\(AiService\);'
class_props_add = "  private djMidiService = inject(DjMidiService);\n  private aiService = inject(AiService);"
content = content.replace(class_props_pattern, class_props_add)

# Call initMidi in ngOnInit
ng_on_init_pattern = r'ngOnInit\(\)\ \{'
ng_on_init_add = "ngOnInit() {\n    this.djMidiService.initMidi();"
content = content.replace(ng_on_init_pattern, ng_on_init_add)

with open(file_path, 'w') as f:
    f.write(content)
