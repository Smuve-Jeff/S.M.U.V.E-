import re

def patch_file(path, search_pattern, replace_content):
    with open(path, 'r') as f:
        content = f.read()
    new_content = re.sub(search_pattern, replace_content, content, flags=re.DOTALL)
    with open(path, 'w') as f:
        f.write(new_content)
    print(f"Patched {path}")

# ArrangementViewComponent: Add resizing and multi-track dragging state
patch_file('src/app/studio/arrangement-view/arrangement-view.component.ts',
    r'private draggingClip: \{.*?\} \| null = null;',
    r"""private draggingClip: {
    trackId: number;
    clipId: string;
    startX: number;
    initialStart: number;
    startY: number;
  } | null = null;

  private resizingClip: {
    trackId: number;
    clipId: string;
    startX: number;
    initialLength: number;
  } | null = null;

  selectedClipIds = signal<Set<string>>(new Set());""")

# Update onClipPointerDown for resizing detection
patch_file('src/app/studio/arrangement-view/arrangement-view.component.ts',
    r'onClipPointerDown\(.*?\) \{.*?event\.preventDefault\(\);.*?event\.stopPropagation\(\);.*?this\.draggingClip = \{.*?trackId,.*?clipId: clip\.id,.*?startX: event\.clientX,.*?initialStart: clip\.start,.*?\};.*?\}',
    r"""onClipPointerDown(
    event: PointerEvent,
    trackId: number,
    clip: ArrangementClip
  ) {
    event.preventDefault();
    event.stopPropagation();

    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const isResize = offsetX > rect.width - 20;

    if (isResize) {
      this.resizingClip = {
        trackId,
        clipId: clip.id,
        startX: event.clientX,
        initialLength: clip.length,
      };
    } else {
      this.draggingClip = {
        trackId,
        clipId: clip.id,
        startX: event.clientX,
        startY: event.clientY,
        initialStart: clip.start,
      };

      if (!event.shiftKey) {
        this.selectedClipIds.set(new Set([clip.id]));
      } else {
        this.selectedClipIds.update(s => {
          const next = new Set(s);
          if (next.has(clip.id)) next.delete(clip.id);
          else next.add(clip.id);
          return next;
        });
      }
    }
    this.selectTrack(trackId);
  }""")

# Update onPointerMove for resizing and track switching
patch_file('src/app/studio/arrangement-view/arrangement-view.component.ts',
    r'@HostListener\(\'window:pointermove\', \[\'$event\'\]\)\s+onPointerMove\(event: PointerEvent\) \{.*?if \(!this\.draggingClip\) \{.*?return;.*?\}.*?const deltaBars =.*?this\.musicManager\.updateClip\(.*?\}\)',
    r"""@HostListener('window:pointermove', [''])
  onPointerMove(event: PointerEvent) {
    if (this.resizingClip) {
      const deltaBars = (event.clientX - this.resizingClip.startX) / this.barWidth;
      const nextLength = this.quantizeBar(this.resizingClip.initialLength + deltaBars);
      this.musicManager.updateClip(
        this.resizingClip.trackId,
        this.resizingClip.clipId,
        { length: Math.max(0.25, nextLength) }
      );
      return;
    }

    if (!this.draggingClip) return;

    const deltaBars = (event.clientX - this.draggingClip.startX) / this.barWidth;
    const nextStart = this.quantizeBar(this.draggingClip.initialStart + deltaBars);

    const viewport = this.gridViewport?.nativeElement;
    const rect = viewport.getBoundingClientRect();
    const relativeY = event.clientY - rect.top + viewport.scrollTop - this.rulerHeight;
    const targetTrackIndex = Math.floor(relativeY / this.laneHeight);
    const targetTrack = this.tracks()[targetTrackIndex];

    if (targetTrack && targetTrack.id !== this.draggingClip.trackId) {
      this.musicManager.moveClip(this.draggingClip.trackId, targetTrack.id, this.draggingClip.clipId, {
        start: nextStart
      });
      this.draggingClip.trackId = targetTrack.id;
    } else {
      this.musicManager.updateClip(
        this.draggingClip.trackId,
        this.draggingClip.clipId,
        { start: nextStart }
      );
    }
  }""")

# Update stopDragging
patch_file('src/app/studio/arrangement-view/arrangement-view.component.ts',
    r'stopDragging\(\) \{.*?this\.draggingClip = null;.*?\}',
    r"stopDragging() {\n    this.draggingClip = null;\n    this.resizingClip = null;\n  }")

# Add splitSelectedClips and more features
patch_file('src/app/studio/arrangement-view/arrangement-view.component.ts',
    r'private quantizeBar\(value: number\) \{.*?\}',
    r"""private quantizeBar(value: number) {
    const increment = this.snapEnabled() ? 1 : 0.25;
    const quantized = Math.round(value / increment) * increment;
    const maxStart = Math.max(0, this.getLoopBarCount() - 0.25);
    return Math.max(0, Math.min(maxStart, quantized));
  }

  splitAtPlayhead() {
    const currentBar = this.musicManager.currentStep() / 16;
    this.tracks().forEach(track => {
      const selectedInTrack = track.clips.filter(c => this.selectedClipIds().has(c.id));
      selectedInTrack.forEach(clip => {
        this.musicManager.splitClip(track.id, clip.id, currentBar);
      });
    });
  }

  duplicateSelected() {
    this.tracks().forEach(track => {
      const selected = track.clips.filter(c => this.selectedClipIds().has(c.id));
      selected.forEach(clip => {
        this.musicManager.addClipToTrack(track.id, {
          ...clip,
          id: undefined,
          start: clip.start + clip.length
        });
      });
    });
  }""")

print("Arrangement component features upgraded.")
