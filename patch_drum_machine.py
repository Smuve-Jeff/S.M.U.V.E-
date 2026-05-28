import sys

with open('src/app/studio/drum-machine/drum-machine.component.ts', 'r') as f:
    content = f.read()

# Add signals for transport
new_signals = """
  isLocalPlayback = signal(false);
  isLocalPlaying = signal(false);
  isLocalRecording = signal(false);
"""

# Find a good place to insert signals (after AiService injection)
insertion_point = content.find('aiService = inject(AiService);')
if insertion_point != -1:
    end_of_line = content.find('\n', insertion_point) + 1
    content = content[:end_of_line] + new_signals + content[end_of_line:]

# Add methods before the last closing brace
new_methods = """
  toggleLocalPlay() {
    this.isLocalPlaying.update(v => !v);
    if (this.isLocalPlaying()) {
      console.log('Local Drum Machine Playback Started');
    } else {
      console.log('Local Drum Machine Playback Paused');
    }
  }

  toggleLocalRecord() {
    this.isLocalRecording.update(v => !v);
    console.log('Local Drum Machine Recording:', this.isLocalRecording());
  }

  localSkip() {
    console.log('Local Drum Machine Skip');
  }

  localUpload() {
    console.log('Local Drum Machine Upload');
  }
"""

last_brace = content.rfind('}')
content = content[:last_brace] + new_methods + content[last_brace:]

with open('src/app/studio/drum-machine/drum-machine.component.ts', 'w') as f:
    f.write(content)
