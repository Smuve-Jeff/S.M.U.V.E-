import os
import re

file_path = 'src/app/studio/dj-deck/dj-deck.component.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Add new imports if missing
if 'inject' not in content:
    content = content.replace('import {', 'import { inject,')

# Add new class properties
class_start = r'export class DJDeckComponent implements OnInit, AfterViewInit \{'
class_props = """
  samplerCategory = signal<'drums' | 'fx' | 'vocals'>('drums');
  fxMode = signal<'flanger' | 'phaser' | 'delay'>('flanger');
"""
content = re.sub(class_start, f'export class DJDeckComponent implements OnInit, AfterViewInit {{\n{class_props}', content)

# Update isSamplerPadActive to handle categories
content = content.replace(
    "isSamplerPadActive(deck: 'A' | 'B', index: number) {",
    "isSamplerPadActive(deck: 'A' | 'B', index: number, category?: 'drums' | 'fx' | 'vocals') {"
)
# Note: I need to be careful with the body of isSamplerPadActive
content = re.sub(
    r'return \(\s+\(deck === \'A\' \? this\.activeSamplerPadA\(\) : this\.activeSamplerPadB\(\)\) ===\s+index\s+\);',
    r"const cat = category || this.samplerCategory();\n    return (deck === 'A' ? this.activeSamplerPadA() : this.activeSamplerPadB()) === index;",
    content
)

# Add new methods
new_methods = """
  setSamplerCategory(cat: 'drums' | 'fx' | 'vocals') {
    this.samplerCategory.set(cat);
  }

  toggleCue(deck: 'A' | 'B') {
    this.deckService.toggleCue(deck);
  }

  setFxAmount(deck: 'A' | 'B', amount: any) {
    const val = parseFloat(amount);
    this.deckService.setFx(deck, this.fxMode(), val);
  }

  toggleAutomix() {
    this.deckService.toggleAutomix();
  }

  syncDeck(deck: 'A' | 'B') {
    this.deckService.autoSync(deck);
  }
"""

# Insert before the last closing brace
content = content.rstrip()
if content.endswith('}'):
    content = content[:-1] + new_methods + '\n}'

with open(file_path, 'w') as f:
    f.write(content)
