import sys

file_path = 'src/app/services/audio-engine.service.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Update initDeck
old_init_deck = """    const deck: DeckChannel = {
      pre,
      gain,
      pan,
      filter,
      eqLow,
      eqMid,
      eqHigh,
      sendA,
      sendB,
      buffer: undefined,
      stems: undefined,
      sources: { vocals: null, drums: null, bass: null, melody: null },
      gains: stemGains,
      startTime: 0,
      pauseOffset: 0,
      rate: 1,
      isPlaying: false,
      loopEnabled: false,
      loopStartSec: 0,
      loopEndSec: 0,
    };"""

new_init_deck_logic = """    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 256;
    pre.connect(analyser);

    const deck: DeckChannel = {
      pre,
      gain,
      pan,
      filter,
      eqLow,
      eqMid,
      eqHigh,
      sendA,
      sendB,
      analyser,
      buffer: undefined,
      stems: undefined,
      sources: { vocals: null, drums: null, bass: null, melody: null },
      gains: stemGains,
      startTime: 0,
      pauseOffset: 0,
      rate: 1,
      isPlaying: false,
      loopEnabled: false,
      loopStartSec: 0,
      loopEndSec: 0,
      hotCues: new Array(8).fill(null),
      keyLock: true,
    };"""

content = content.replace(old_init_deck, new_init_deck_logic)

# Add new methods
new_methods = """
  setHotCue(id: DeckId, slot: number) {
    const deck = this.getDeck(id);
    const pos = this.getDeckProgress(id).position;
    deck.hotCues[slot] = pos;
  }

  jumpToHotCue(id: DeckId, slot: number) {
    const deck = this.getDeck(id);
    const pos = deck.hotCues[slot];
    if (pos !== null) {
      this.seekDeck(id, pos);
    }
  }

  clearHotCue(id: DeckId, slot: number) {
    const deck = this.getDeck(id);
    deck.hotCues[slot] = null;
  }

  getDeckLevel(id: DeckId): number {
    const deck = this.getDeck(id);
    const data = new Uint8Array(deck.analyser.frequencyBinCount);
    deck.analyser.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    return sum / data.length / 255;
  }

  getDeckWaveformData(id: DeckId): Float32Array {
    const deck = this.getDeck(id);
    if (!deck.buffer) return new Float32Array(0);
    return deck.buffer.getChannelData(0);
  }

  setKeyLock(id: DeckId, enabled: boolean) {
    const deck = this.getDeck(id);
    deck.keyLock = enabled;
    // Note: Web Audio API standard AudioBufferSourceNode doesn't natively support
    // high-quality pitch shifting without changing speed (keylock)
    // but we'll store the state for future integration with a library or
    // keep it as a UI indicator for now.
  }
"""

# Find where to insert new methods - after setDeckGain perhaps
# I'll just append them before the last closing brace of the class
if content.endswith('}\n'):
    content = content[:-2] + new_methods + '}\n'
elif content.endswith('}'):
    content = content[:-1] + new_methods + '}\n'

with open(file_path, 'w') as f:
    f.write(content)
