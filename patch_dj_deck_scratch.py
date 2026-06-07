import os
import re

file_path = 'src/app/studio/dj-deck/dj-deck.component.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Update processScratch to use the new scratch method in deckService
process_scratch_pattern = r'private\ processScratch\(deck:\ \'A\'\ \|\ \'B\',\ event:\ MouseEvent\ \|\ TouchEvent\)\ \{([\s\S]*?)let\ delta\ =\ angle\ -\ lastAngle;'
new_process_scratch_start = """private processScratch(deck: 'A' | 'B', event: MouseEvent | TouchEvent) {
    event.preventDefault();
    const angle = this.getAngle(event, deck);
    const lastAngle = deck === 'A' ? this.lastAngleA : this.lastAngleB;
    let delta = angle - lastAngle;

    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;

    // Use the advanced scratch engine
    const scratchDelta = (delta / 360) * 2; // Arbitrary scaling for feel
    this.deckService.scratch(deck, scratchDelta);
"""
content = re.sub(process_scratch_pattern, new_process_scratch_start, content)

with open(file_path, 'w') as f:
    f.write(content)
