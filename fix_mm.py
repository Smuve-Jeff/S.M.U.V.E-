import sys

with open('src/app/services/music-manager.service.ts', 'r') as f:
    content = f.read()

# Define the method once
method_def = \"\"\"  updateSynthParams(trackId: number, params: any) {
    this.tracks.update(tracks => tracks.map(t => {
      if (t.id !== trackId) return t;
      return {
        ...t,
        synthParams: { ...(t.synthParams || {}), ...params }
      };
    }));
  }\"\"\"

# Remove all existing occurrences and re-add it once
import re
pattern = r'  updateSynthParams\(trackId: number, params: any\) \{.*?\}\);.*?\}'
content = re.sub(pattern, '', content, flags=re.DOTALL)

# Add it back before the end of the class
content = content.rstrip()
if content.endswith('}'):
    content = content[:-1] + "\n" + method_def + "\n}"

with open('src/app/services/music-manager.service.ts', 'w') as f:
    f.write(content)
