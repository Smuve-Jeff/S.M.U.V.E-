import re

file_path = 'src/app/studio/dj-deck/dj-deck.component.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Add missing properties to DjDeckComponent
if 'samplerCategory = signal' not in content:
    content = re.sub(
        r'export class DjDeckComponent implements OnInit, OnDestroy, AfterViewInit {',
        'export class DjDeckComponent implements OnInit, OnDestroy, AfterViewInit {\n  samplerCategory = signal<"drums" | "fx" | "vocals">("drums");\n  fxMode = signal<"flanger" | "phaser" | "delay">("flanger");\n  private djMidiService = inject(DjMidiService);\n  private aiService = inject(AiService);',
        content
    )

# Add initMidi to ngOnInit
if 'this.djMidiService.initMidi()' not in content:
    content = re.sub(
        r'ngOnInit\(\) \{',
        'ngOnInit() {\n    this.djMidiService.initMidi();',
        content
    )

with open(file_path, 'w') as f:
    f.write(content)
