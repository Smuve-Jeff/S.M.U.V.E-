import os
import re

file_path = 'src/app/services/audio-engine.service.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Fix routing to include delay
routing_pattern = r'\.connect\(deck\.phaserNode\)\s+\.connect\(deck\.pan\)'
new_routing = '.connect(deck.phaserNode).connect(deck.pingPongDelay).connect(deck.pan)'
content = re.sub(routing_pattern, new_routing, content)

# Also connect pingPongDelay feedback loop
feedback_routing = r'deck\.pingPongDelay\.delayTime\.value = 0\.375;'
feedback_routing_add = """
    deck.pingPongDelay.delayTime.value = 0.375;
    deck.pingPongDelay.connect(deck.pingPongFeedback);
    deck.pingPongFeedback.connect(deck.pingPongDelay);
    deck.pingPongDelay.connect(deck.pingPongPan);
    deck.pingPongPan.connect(deck.analyser);
"""
# Note: I need to be careful not to create a duplicate connect if I run it twice.
if 'deck.pingPongDelay.connect(deck.pingPongFeedback)' not in content:
    content = content.replace(feedback_routing, feedback_routing_add)

with open(file_path, 'w') as f:
    f.write(content)
