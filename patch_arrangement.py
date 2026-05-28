import sys

with open('src/app/studio/arrangement-view/arrangement-view.component.ts', 'r') as f:
    content = f.read()

# Add signals for transport
new_signals = """
  isLocalPlayback = signal(false);
  isLocalPlaying = signal(false);
  isLocalRecording = signal(false);
"""

# Find a good place to insert signals (after isDragging)
insertion_point = content.find('isDragging = signal(false);')
if insertion_point != -1:
    end_of_line = content.find('\n', insertion_point) + 1
    content = content[:end_of_line] + new_signals + content[end_of_line:]

# Add methods before the last closing brace
new_methods = """
  togglePlay() {
    this.musicManager.togglePlay();
  }

  toggleRecord() {
    this.musicManager.toggleRecord();
  }

  toggleLocalPlay() {
    this.isLocalPlaying.update(v => !v);
    console.log('Local Arrangement Playback:', this.isLocalPlaying());
  }

  toggleLocalRecord() {
    this.isLocalRecording.update(v => !v);
    console.log('Local Arrangement Recording:', this.isLocalRecording());
  }

  localSkip() {
    console.log('Local Arrangement Skip');
  }

  localUpload() {
    console.log('Local Arrangement Upload');
  }
"""

last_brace = content.rfind('}')
content = content[:last_brace] + new_methods + content[last_brace:]

with open('src/app/studio/arrangement-view/arrangement-view.component.ts', 'w') as f:
    f.write(content)
