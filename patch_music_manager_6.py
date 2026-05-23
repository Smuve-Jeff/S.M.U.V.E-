import sys

file_path = 'src/app/services/music-manager.service.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Fix patternSlots initialization in normalizeTrack
if 'patternSlots: track.patternSlots || [],' in content:
    content = content.replace('patternSlots: track.patternSlots || [],',
                              'patternSlots: track.patternSlots || this.initPatternSlots(),')

# Add initPatternSlots method
init_method = """
  private initPatternSlots(): PatternSlot[] {
    return new Array(8).fill(null).map((_, i) => ({
      id: `slot-${i}`,
      name: `Pattern ${i + 1}`,
      versions: [],
      activeVersionId: ''
    }));
  }
"""

if 'private initPatternSlots()' not in content:
    insertion_point = content.find('private normalizeTrack(track: any): TrackModel {')
    if insertion_point != -1:
        content = content[:insertion_point] + init_method + content[insertion_point:]

with open(file_path, 'w') as f:
    f.write(content)
