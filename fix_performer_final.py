import re

ts_path = 'src/app/studio/performer/performer.component.ts'
with open(ts_path, 'r') as f:
    ts_content = f.read()

# Fix TS imports
if 'computed' not in ts_content:
    ts_content = ts_content.replace('Component, inject, signal', 'Component, inject, signal, computed')
with open(ts_path, 'w') as f:
    f.write(ts_content)

html_path = 'src/app/studio/performer/performer.component.html'
with open(html_path, 'r') as f:
    html_content = f.read()

# Fix HTML method calls
html_content = html_content.replace('setInstrument()', 'setInstrument($event)')
html_content = html_content.replace('updateTrackVolume()', 'updateTrackVolume($event)')
html_content = html_content.replace('updateTrackPan()', 'updateTrackPan($event)')

with open(html_path, 'w') as f:
    f.write(html_content)

print("Performer component fixed.")
