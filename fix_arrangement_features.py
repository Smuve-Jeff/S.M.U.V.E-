import re

def patch_file(path, search_pattern, replace_content):
    with open(path, 'r') as f:
        content = f.read()
    new_content = re.sub(search_pattern, replace_content, content, flags=re.DOTALL)
    with open(path, 'w') as f:
        f.write(new_content)
    print(f"Patched {path}")

# MusicManagerService: Add moveClip and splitClip
patch_file('src/app/services/music-manager.service.ts',
    r'updateClip\(trackId: number, clipId: string, patch: Partial<TrackClip>\) \{.*?\}',
    r"""updateClip(trackId: number, clipId: string, patch: Partial<TrackClip>) {
    this.tracks.update((tracks) =>
      tracks.map((track) => {
        if (track.id !== trackId) return track;
        return {
          ...track,
          clips: track.clips.map((clip) =>
            clip.id === clipId ? { ...clip, ...patch } : clip
          ),
        };
      })
    );
  }

  moveClip(fromTrackId: number, toTrackId: number, clipId: string, patch: Partial<TrackClip>) {
    let movingClip: TrackClip | null = null;

    this.tracks.update(tracks => tracks.map(t => {
      if (t.id === fromTrackId) {
        const clip = t.clips.find(c => c.id === clipId);
        if (clip) {
          movingClip = { ...clip, ...patch };
          return { ...t, clips: t.clips.filter(c => c.id !== clipId) };
        }
      }
      return t;
    }));

    if (movingClip) {
      this.tracks.update(tracks => tracks.map(t => {
        if (t.id === toTrackId) {
          return { ...t, clips: [...t.clips, movingClip!] };
        }
        return t;
      }));
    }
  }

  splitClip(trackId: number, clipId: string, splitBar: number) {
    this.tracks.update(tracks => tracks.map(t => {
      if (t.id !== trackId) return t;
      const clipIndex = t.clips.findIndex(c => c.id === clipId);
      if (clipIndex === -1) return t;

      const clip = t.clips[clipIndex];
      if (splitBar <= clip.start || splitBar >= clip.start + clip.length) return t;

      const firstPart = { ...clip, length: splitBar - clip.start };
      const secondPart = {
        ...clip,
        id: `clip-${trackId}-${Date.now()}`,
        start: splitBar,
        length: clip.length - (splitBar - clip.start)
      };

      const nextClips = [...t.clips];
      nextClips.splice(clipIndex, 1, firstPart, secondPart);
      return { ...t, clips: nextClips };
    }));
  }""")

print("Arrangement backend features added.")
