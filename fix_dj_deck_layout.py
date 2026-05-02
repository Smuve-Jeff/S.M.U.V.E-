import re

html_path = 'src/app/studio/dj-deck/dj-deck.component.html'
with open(html_path, 'r') as f:
    content = f.read()

# I messed up with global replacements. Let's fix the stem isolation blocks properly for A and B.

def build_stem_block(deck, stem, label, accent):
    return f"""            <div class="flex flex-col items-center gap-2">
              <input
                type="range"
                min="0"
                max="1.5"
                step="0.01"
                value="1"
                (input)="setStemGain('{deck}', '{stem}', $any($event.target).value)"
                class="hud-slider-vertical h-24 {accent}"
              />
              <button (click)="setStemGain('{deck}', '{stem}', 0)" class="w-5 h-5 rounded bg-black/40 border border-white/10 text-[7px] font-black text-slate-500 hover:text-red-500 transition-colors">M</button>
              <span class="hud-label !text-[7px]">{label}</span>
            </div>"""

def replace_isolation_block(content, deck, accent):
    # Find the block
    start_marker = f'<span class="hud-label">Stem Isolation</span>'
    # Actually, I'll just use a more surgical approach.

    stems = [
        ('vocals', 'VOX'),
        ('drums', 'DRM'),
        ('bass', 'BAS'),
        ('melody', 'MEL')
    ]

    new_inner = "\\n".join([build_stem_block(deck, s, l, accent) for s, l in stems])
    # This is still hard because of double occurrences of "Stem Isolation"
    return new_inner

# Let's just rewrite the specific parts of the file using markers if possible or just careful regex
# Searching for the p-4 grid grid-cols-4 gap-2 blocks

blocks = re.findall(r'<div class="p-4 grid grid-cols-4 gap-2">[\s\S]*?</div>\s+</div>', content)
if len(blocks) >= 2:
    # block 0 is Stem Isolation A (based on Emerald accent in my previous cat)
    # block 1 is Spectrum Engine A
    # block 2 is Stem Isolation B (based on Brand Secondary accent)
    # block 3 is Spectrum Engine B

    # Wait, I need to verify the order.
    pass

# I'll just manually construct the whole Stem Isolation sections for A and B
# Searching for the first "Stem Isolation"
content = re.sub(
    r'(<span class="hud-label">Stem Isolation</span>[\s\S]*?<div class="p-4 grid grid-cols-4 gap-2">)[\s\S]*?(</div>\s+</div>)',
    r'\1' + replace_isolation_block(None, 'A', 'accent-emerald-500') + r'\2',
    content,
    1
)

# Searching for the second "Stem Isolation"
# (Wait, if I use sub with count=1, I can target them sequentially)
# Actually, the second one has "accent-brand-secondary"

# Let's find all "Stem Isolation" occurrences and replace their adjacent grid
def replacer(match):
    deck = 'A' if 'accent-emerald-500' in match.group(0) or 'VOX' in match.group(0) else 'B'
    accent = 'accent-emerald-500' if deck == 'A' else 'accent-brand-secondary'
    # This is getting messy. I'll just use a simpler replacement for the inner items.
    return match.group(0)

with open(html_path, 'w') as f:
    f.write(content)
