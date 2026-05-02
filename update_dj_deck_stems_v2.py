import re

html_path = 'src/app/studio/dj-deck/dj-deck.component.html'
with open(html_path, 'r') as f:
    html = f.read()

# I want to add Mute buttons below the stem sliders
# The stems are: vocals, drums, bass, melody

def add_mute_button(deck, stem):
    pattern = fr"(input\)=\"setStemGain\('{deck}', '{stem}', $any\($event.target\).value\)\""
    # Find the parent div of the input
    # It looks like:
    # <div class="flex flex-col items-center gap-2">
    #   <input ... />
    #   <span ...>...</span>
    # </div>

    # Let's replace the span with span + button
    replacement = fr"\1\n              <button class='w-6 h-6 rounded bg-black/40 border border-white/10 text-[8px] font-black text-slate-500 hover:text-brand-primary' (click)=\"setStemGain('{deck}', '{stem}', 0)\">M</button>"
    # This is a bit complex for regex. I'll just manually target the OTH/MEL spans.

# Manual replacement for Deck A and B
stems = ['vocals', 'drums', 'bass', 'melody']
for deck in ['A', 'B']:
    for stem in stems:
        # Find the div containing the input for this stem
        # I'll look for the input line and then the next span
        target_span = f'<span class="hud-label !text-[7px]">{stem[:3].upper()}</span>'
        if stem == 'melody': target_span = '<span class="hud-label !text-[7px]">MEL</span>'
        if stem == 'vocals': target_span = '<span class="hud-label !text-[7px]">VOX</span>'
        if stem == 'drums': target_span = '<span class="hud-label !text-[7px]">DRM</span>'
        if stem == 'bass': target_span = '<span class="hud-label !text-[7px]">BAS</span>'

        # Insert button before the span
        html = html.replace(target_span, f'<button (click)="setStemGain(\'{deck}\', \'{stem}\', 0)" class="w-5 h-5 rounded bg-black/40 border border-white/10 text-[7px] font-black text-slate-500 hover:text-red-500 transition-colors">M</button>' + target_span)

with open(html_path, 'w') as f:
    f.write(html)
