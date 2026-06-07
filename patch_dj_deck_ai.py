import os
import re

file_path = 'src/app/studio/dj-deck/dj-deck.component.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Add AiService import
if 'AiService' not in content:
    content = content.replace("import {", "import { AiService,")

# Add aiService to properties
class_props_pattern = r'private\ deckService\ =\ inject\(DeckService\);'
class_props_add = "  private aiService = inject(AiService);\n  private deckService = inject(DeckService);"
content = content.replace(class_props_pattern, class_props_add)

# Add AI commentary logic to handlePadPress or similar
ai_commentary = """
    if (Math.random() > 0.7) {
      const commentary = [
        "Your transitions are as weak as your morning coffee.",
        "That scratch sounded like a cat in a blender. Try harder.",
        "Sync is for amateurs. Use your ears, if you have any.",
        "Elite artists don't miss beats. You just did.",
        "I've processed better sets on a calculator."
      ];
      this.sessionNotice.set(commentary[Math.floor(Math.random() * commentary.length)]);
    }
"""

# Insert commentary into togglePlay
toggle_play_pattern = r'togglePlay\(deck:\ DeckId\)\ \{'
content = re.sub(toggle_play_pattern, f'togglePlay(deck: DeckId) {{\n{ai_commentary}', content)

with open(file_path, 'w') as f:
    f.write(content)
