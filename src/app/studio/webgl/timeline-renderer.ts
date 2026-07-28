import { WebGLRenderer, Camera2D, GLColor } from './webgl-renderer';

export interface TimelineClip {
  id: string;
  x: number; // start position in bars (world units)
  y: number; // lane top (world units)
  width: number; // duration in bars
  height: number; // lane height
  color: GLColor;
  label: string;
  selected: boolean;
  isCrosslinked: boolean;
  /** Clip type drives visual treatment */
  type: 'midi' | 'audio' | 'drum';
}

export interface TimelineTrack {
  id: string;
  name: string;
  y: number; // lane top position
  height: number;
  muted: boolean;
  soloed: boolean;
}

const GRID_BAR: GLColor = { r: 0.18, g: 0.22, b: 0.35, a: 0.6 };
const GRID_BEAT: GLColor = { r: 0.12, g: 0.15, b: 0.25, a: 0.35 };
const PLAYHEAD_COLOR: GLColor = { r: 1.0, g: 0.85, b: 0.1, a: 0.95 };
const SELECTION_BORDER: GLColor = { r: 0.68, g: 0.15, b: 0.95, a: 1.0 };
const CROSSLINK_BORDER: GLColor = { r: 0.15, g: 0.85, b: 0.95, a: 1.0 };
const LANE_BG_ODD: GLColor = { r: 0.04, g: 0.06, b: 0.11, a: 1.0 };
const LANE_BG_EVEN: GLColor = { r: 0.05, g: 0.07, b: 0.13, a: 1.0 };
const RULER_BG: GLColor = { r: 0.03, g: 0.05, b: 0.10, a: 1.0 };
const RULER_TEXT_COLOR: GLColor = { r: 0.45, g: 0.50, b: 0.65, a: 1.0 };

export class TimelineRenderer {
  private readonly renderer: WebGLRenderer;

  /** Pixel-per-bar ratio (derived from zoom) */
  private pixelsPerBar = 200;

  constructor(renderer: WebGLRenderer) {
    this.renderer = renderer;
  }

  // ---- Frame ----

  render(
    clips: TimelineClip[],
    tracks: TimelineTrack[],
    playheadBar: number,
    totalBars: number,
    camera: Camera2D,
    rulerHeight: number
  ): void {
    const renderer = this.renderer;
    const bounds = renderer.visibleBounds;

    // Only render visible clips
    const visibleClips = clips.filter(
      (c) =>
        c.x + c.width >= bounds.left &&
        c.x <= bounds.right &&
        c.y + c.height >= bounds.top &&
        c.y <= bounds.bottom
    );

    renderer.beginFrame(camera);

    // -- Track lane backgrounds --
    tracks.forEach((track, i) => {
      if (track.y + track.height < bounds.top || track.y > bounds.bottom)
        return;
      renderer.drawQuad(
        0,
        track.y,
        totalBars * this.pixelsPerBar,
        track.height,
        i % 2 === 0 ? LANE_BG_EVEN : LANE_BG_ODD,
        0
      );
    });

    // -- Ruler background --
    renderer.drawQuad(0, 0, totalBars * this.pixelsPerBar, rulerHeight, RULER_BG, 0);

    // -- Grid lines --
    for (let bar = Math.floor(bounds.left); bar <= Math.ceil(bounds.right); bar++) {
      const x = bar * this.pixelsPerBar;
      // Bar line
      renderer.drawVLine(x, rulerHeight, bounds.bottom, GRID_BAR);
      // Beat subdivisions
      for (let beat = 1; beat < 4; beat++) {
        const bx = x + (beat / 4) * this.pixelsPerBar;
        renderer.drawVLine(bx, rulerHeight, bounds.bottom, GRID_BEAT);
      }
    }

    // -- Ruler grid (top half only) --
    for (let bar = Math.floor(bounds.left); bar <= Math.ceil(bounds.right); bar++) {
      const x = bar * this.pixelsPerBar;
      renderer.drawVLine(x, 0, rulerHeight, GRID_BAR);
    }

    // -- Clips --
    for (const clip of visibleClips) {
      const cx = clip.x * this.pixelsPerBar;
      const cw = clip.width * this.pixelsPerBar;
      const borderRadius = 4;

      // Drop shadow (slight offset dark quad behind)
      renderer.drawQuad(
        cx + 1,
        clip.y + 1,
        cw,
        clip.height,
        { r: 0, g: 0, b: 0, a: 0.35 },
        borderRadius
      );

      // Main clip body
      renderer.drawQuad(cx, clip.y, cw, clip.height, clip.color, borderRadius);

      // Selection / crosslink border
      if (clip.selected) {
        renderer.drawQuad(
          cx,
          clip.y,
          cw,
          clip.height,
          { ...SELECTION_BORDER, a: 0.8 },
          borderRadius
        );
      } else if (clip.isCrosslinked) {
        renderer.drawQuad(
          cx,
          clip.y,
          cw,
          clip.height,
          { ...CROSSLINK_BORDER, a: 0.6 },
          borderRadius
        );
      }

      // Type indicator stripe on left edge
      const typeColor = this.typeIndicatorColor(clip.type);
      renderer.drawQuad(cx, clip.y, 3, clip.height, typeColor, 1);
    }

    // -- Playhead --
    const px = playheadBar * this.pixelsPerBar;
    // Glow
    renderer.drawVLine(
      px,
      rulerHeight,
      bounds.bottom,
      { ...PLAYHEAD_COLOR, a: 0.3 }
    );
    // Core
    renderer.drawVLine(
      px,
      rulerHeight,
      bounds.bottom,
      PLAYHEAD_COLOR
    );
    // Ruler marker
    renderer.drawQuad(px - 4, 4, 8, rulerHeight - 8, PLAYHEAD_COLOR, 3);

    renderer.flush();
  }

  // ---- Coordinate Helpers ----

  setPixelsPerBar(ppb: number): void {
    this.pixelsPerBar = ppb;
  }

  barToPixel(bar: number): number {
    return bar * this.pixelsPerBar;
  }

  pixelToBar(px: number): number {
    return px / this.pixelsPerBar;
  }

  private typeIndicatorColor(type: TimelineClip['type']): GLColor {
    switch (type) {
      case 'midi':
        return { r: 0.3, g: 0.8, b: 0.5, a: 1.0 };
      case 'audio':
        return { r: 0.3, g: 0.5, b: 0.9, a: 1.0 };
      case 'drum':
        return { r: 0.9, g: 0.5, b: 0.3, a: 1.0 };
    }
  }
}

/** Generate a stable clip color from a track or clip ID */
export function clipColorFromId(id: string): GLColor {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = ((hash & 0xffff) / 0xffff) * 360;
  return hslToGL(hue, 0.55, 0.45);
}

function hslToGL(h: number, s: number, l: number): GLColor {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return { r: r + m, g: g + m, b: b + m, a: 1.0 };
}
