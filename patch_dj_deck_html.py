import os
import re

file_path = 'src/app/studio/dj-deck/dj-deck.component.html'
with open(file_path, 'r') as f:
    content = f.read()

# Add Automix and MIDI sync buttons to mixer center
mixer_center_pattern = r'<div class="mixer-center">([\s\S]*?)<div class="master-section-elite">'
mixer_center_add = """<div class="mixer-center">
          <div class="dj-utility-btns mb-4">
            <button class="btn-sm tactile-v42" [class.active]="deckService.automixEnabled()" (click)="toggleAutomix()">AUTOMIX</button>
            <button class="btn-sm tactile-v42" (click)="syncDeck('A')">SYNC A</button>
            <button class="btn-sm tactile-v42" (click)="syncDeck('B')">SYNC B</button>
          </div>
\1
          <div class="master-section-elite">"""
content = re.sub(mixer_center_pattern, mixer_center_add, content)

# Add FX controls above the performance grid
performance_section_start = r'<div class="performance-section">'
fx_controls = """<div class="performance-section">
    <div class="fx-performance-panel glass-v42 mb-4 p-4">
      <div class="fx-header flex justify-between items-center mb-2">
        <span class="neon-text-xs">ADVANCED PERFORMANCE FX</span>
        <div class="fx-selectors flex gap-2">
          <button class="btn-xs" [class.active]="fxMode() === 'flanger'" (click)="fxMode.set('flanger')">FLANGER</button>
          <button class="btn-xs" [class.active]="fxMode() === 'phaser'" (click)="fxMode.set('phaser')">PHASER</button>
          <button class="btn-xs" [class.active]="fxMode() === 'delay'" (click)="fxMode.set('delay')">DELAY</button>
        </div>
      </div>
      <div class="fx-grid flex gap-8">
        <div class="fx-control-deck">
           <label class="text-[10px] opacity-50">DECK A FX</label>
           <input type="range" min="0" max="1" step="0.01" [value]="deckService.deckA().fxAmount" (input)="setFxAmount('A', $any($event.target).value)">
        </div>
        <div class="fx-control-deck">
           <label class="text-[10px] opacity-50">DECK B FX</label>
           <input type="range" min="0" max="1" step="0.01" [value]="deckService.deckB().fxAmount" (input)="setFxAmount('B', $any($event.target).value)">
        </div>
      </div>
    </div>
"""
content = content.replace(performance_section_start, fx_controls)

# Add Sampler Categories to performance tabs
performance_tabs_pattern = r'<div class="performance-tabs">([\s\S]*?)<\/div>'
sampler_categories = """<div class="performance-tabs">
      <button [class.active]="performanceMode() === 'cue'" (click)="performanceMode.set('cue')">HOT CUES</button>
      <button [class.active]="performanceMode() === 'roll'" (click)="performanceMode.set('roll')">ROLL</button>
      <div class="sampler-tab-group flex items-center">
        <button [class.active]="performanceMode() === 'sampler'" (click)="performanceMode.set('sampler')">SAMPLER</button>
        <select *ngIf="performanceMode() === 'sampler'" class="sampler-cat-select ml-2 bg-transparent border-none text-[10px]" [ngModel]="samplerCategory()" (ngModelChange)="setSamplerCategory($event)">
          <option value="drums">DRUMS</option>
          <option value="fx">FX</option>
          <option value="vocals">VOCALS</option>
        </select>
      </div>
    </div>"""
content = re.sub(performance_tabs_pattern, sampler_categories, content)

# Add CUE buttons next to Play/Cue
deck_buttons_pattern = r'<button\s+class="btn-cue tactile-v42"([\s\S]*?)<\/button>'
# This is tricky because there are two decks. I'll use a more specific replace.
content = content.replace('handlePadPress(\'A\', 0)', "toggleCue('A')")
content = content.replace('handlePadPress(\'B\', 0)', "toggleCue('B')")

with open(file_path, 'w') as f:
    f.write(content)
