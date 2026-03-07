import sys
import os
import re

# 1. Update DeckService
file_path = 'src/app/services/deck.service.ts'
with open(file_path, 'r') as f:
    content = f.read()

if 'sync(id: DeckId)' not in content:
    content = content.replace('syncProgress() {',
'''sync(id: DeckId) {
    const target = id === 'A' ? this.deckB() : this.deckA();
    if (id === 'A') {
      this.deckA.update(d => ({ ...d, bpm: target.bpm }));
    } else {
      this.deckB.update(d => ({ ...d, bpm: target.bpm }));
    }
  }

  syncProgress() {''')

with open(file_path, 'w') as f:
    f.write(content)

# 2. Update DjDeckComponent (logic and sync method)
file_path = 'src/app/studio/dj-deck/dj-deck.component.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Add sync method to class if not exists
if "sync(deck: 'A' | 'B')" not in content:
    last_brace = content.rfind('}')
    content = content[:last_brace] + '''
  sync(deck: 'A' | 'B') {
    this.deckService.sync(deck);
  }
}
'''

# Update drawDeckWaveform with scrolling logic
# We need to be careful with the regex to match the existing drawDeckWaveform method body correctly
# Let's use a simpler string replacement for the body of the function
new_draw_body = '''private drawDeckWaveform(id: 'A' | 'B', canvas: HTMLCanvasElement) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const deck = id === 'A' ? this.deckService.deckA() : this.deckService.deckB();
    const data = this.engine.getDeckWaveformData(id);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (data.length === 0) {
      ctx.strokeStyle = '#1e293b';
      ctx.beginPath();
      ctx.moveTo(0, canvas.height / 2);
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
      return;
    }

    // Pro Scrolling Waveform Logic
    const sampleRate = this.engine.getContext().sampleRate || 44100;
    const windowSize = 4; // 4 seconds visible
    const samplesInWindow = windowSize * sampleRate;
    const step = samplesInWindow / canvas.width;
    const currentSample = deck.progress * sampleRate;
    const startSample = Math.floor(currentSample - (samplesInWindow / 2));
    const amp = canvas.height / 2;

    ctx.strokeStyle = id === 'A' ? '#10b981' : '#f59e0b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < canvas.width; i++) {
        const idx = Math.floor(startSample + i * step);
        if (idx >= 0 && idx < data.length) {
            const val = data[idx];
            ctx.moveTo(i, amp - val * amp);
            ctx.lineTo(i, amp + val * amp);
        }
    }
    ctx.stroke();

    // Playhead fixed in center
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, 0);
    ctx.lineTo(canvas.width / 2, canvas.height);
    ctx.stroke();
  }'''

pattern = r'private drawDeckWaveform\(id: \'A\' \| \'B\', canvas: HTMLCanvasElement\) \{.*?  \}'
content = re.sub(pattern, new_draw_body, content, flags=re.DOTALL)

with open(file_path, 'w') as f:
    f.write(content)

# 3. Update DjDeckComponent HTML (fixes and sync calls)
file_path = 'src/app/studio/dj-deck/dj-deck.component.html'
with open(file_path, 'r') as f:
    content = f.read()

# Fix un-invoked pitch signals and add labels if missing
content = content.replace('{{ pitchAPercentage }}', 'PITCH: {{ pitchAPercentage() }}')
content = content.replace('{{ pitchBPercentage }}', 'PITCH: {{ pitchBPercentage() }}')

# Add ID to container for verification
if 'id="stackedWaveformContainer"' not in content:
    content = content.replace('<div class="h-40 w-full bg-black border-b border-emerald-500/20 flex flex-col gap-1 p-2 relative">',
                            '<div id="stackedWaveformContainer" class="h-40 w-full bg-black border-b border-emerald-500/20 flex flex-col gap-1 p-2 relative">')

# Ensure sync buttons are connected (already done in previous step but checking)
if '(click)="sync(\'A\')"' not in content:
     content = content.replace('<button class="w-12 h-10 rounded bg-slate-800 border border-white/10 text-[8px] font-black text-emerald-500 uppercase">SYNC</button>',
                            '<button (click)="sync(\'A\')" class="w-12 h-10 rounded bg-slate-800 border border-white/10 text-[8px] font-black text-emerald-500 uppercase">SYNC</button>', 1)
if '(click)="sync(\'B\')"' not in content:
     content = content.replace('<button class="w-12 h-10 rounded bg-slate-800 border border-white/10 text-[8px] font-black text-emerald-500 uppercase">SYNC</button>',
                            '<button (click)="sync(\'B\')" class="w-12 h-10 rounded bg-slate-800 border border-white/10 text-[8px] font-black text-emerald-500 uppercase">SYNC</button>', 1)

with open(file_path, 'w') as f:
    f.write(content)

print("Fixes applied successfully.")
