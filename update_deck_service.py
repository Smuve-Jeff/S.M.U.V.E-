import sys

file_path = 'src/app/services/deck.service.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Add methods to DeckService
new_deck_service_methods = """
  setHotCue(deck: 'A' | 'B', slot: number) {
    this.engine.setHotCue(deck, slot);
    const pos = this.engine.getDeckProgress(deck).position;
    if (deck === 'A') {
      this.deckA.update(d => {
        const cues = [...d.hotCues];
        cues[slot] = pos;
        return { ...d, hotCues: cues };
      });
    } else {
      this.deckB.update(d => {
        const cues = [...d.hotCues];
        cues[slot] = pos;
        return { ...d, hotCues: cues };
      });
    }
  }

  jumpToHotCue(deck: 'A' | 'B', slot: number) {
    this.engine.jumpToHotCue(deck, slot);
  }

  setDeckEq(deck: 'A' | 'B', high: number, mid: number, low: number) {
    this.engine.setDeckEq(deck, high, mid, low);
    if (deck === 'A') this.deckA.update(d => ({ ...d, eqHigh: high, eqMid: mid, eqLow: low }));
    else this.deckB.update(d => ({ ...d, eqHigh: high, eqMid: mid, eqLow: low }));
  }

  setDeckFilter(deck: 'A' | 'B', freq: number) {
    this.engine.setDeckFilterFreq(deck, freq);
    if (deck === 'A') this.deckA.update(d => ({ ...d, filterFreq: freq }));
    else this.deckB.update(d => ({ ...d, filterFreq: freq }));
  }

  setDeckGain(deck: 'A' | 'B', gain: number) {
    this.engine.setDeckGain(deck, gain);
    if (deck === 'A') this.deckA.update(d => ({ ...d, gain }));
    else this.deckB.update(d => ({ ...d, gain }));
  }
"""

# Insert before the last closing brace
if content.endswith('}\n'):
    content = content[:-2] + new_deck_service_methods + '}\n'
elif content.endswith('}'):
    content = content[:-1] + new_deck_service_methods + '}\n'

with open(file_path, 'w') as f:
    f.write(content)
