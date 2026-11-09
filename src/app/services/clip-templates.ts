/**
 * Clip templates — one-tap professional looks: a named bundle of grade,
 * motion, transition, speed ramp and keyframes. The node-canvas version of
 * CapCut/VN's template shelf, applied to the selected clip.
 */

export interface ClipTemplate {
  id: string;
  name: string;
  description: string;
  /** Partial effects patch applied to the clip (merged over its own). */
  patch: Record<string, unknown>;
}

const kenBurnsIn = [
  { id: 'tb0', time: 0, property: 'scale', value: 1, easing: 'ease-in-out' },
  { id: 'tb1', time: 10, property: 'scale', value: 1.18, easing: 'ease-in-out' },
] as const;

export const CLIP_TEMPLATES: ClipTemplate[] = [
  {
    id: 'cinematic-push',
    name: 'Cinematic Push',
    description: 'Slow Ken Burns push with a film fade — the trailer look.',
    patch: {
      filter: 'cinematic',
      transition: 'fade',
      transitionDuration: 0.6,
      motion: 'ken-burns-in',
      keyframes: kenBurnsIn.map((k) => ({ ...k })),
    },
  },
  {
    id: 'neon-pulse',
    name: 'Neon Pulse',
    description: 'Vivid grade, flash transition, beat-ready punch.',
    patch: {
      filter: 'neon-pulse',
      transition: 'flash',
      transitionDuration: 0.25,
      fx: [{ id: 'glow', value: 0.6 }],
      keyframes: [
        { id: 'np0', time: 0, property: 'scale', value: 1.06, easing: 'ease-out' },
        { id: 'np1', time: 0.6, property: 'scale', value: 1, easing: 'ease-in-out' },
        { id: 'np2', time: 10, property: 'scale', value: 1, easing: 'linear' },
      ],
    },
  },
  {
    id: 'vintage-film',
    name: 'Vintage Film',
    description: 'Sepia, letterbox, grain — archival footage.',
    patch: {
      filter: 'sepia',
      transition: 'dissolve',
      transitionDuration: 0.8,
      fx: [
        { id: 'letterbox', value: 0.8 },
        { id: 'film-grain', value: 0.5 },
        { id: 'vignette', value: 0.4 },
      ],
    },
  },
  {
    id: 'sports-punch',
    name: 'Sports Punch',
    description: 'Velocity ramp + slide cut for action edits.',
    patch: {
      filter: 'vivid',
      transition: 'slide-left',
      transitionDuration: 0.3,
      speedCurve: 'velocity', // resolved per-clip duration at apply time
    },
  },
  {
    id: 'music-beat',
    name: 'Music Beat',
    description: 'Zoom-in transition, chroma pop, glow for music videos.',
    patch: {
      filter: 'teal-orange',
      transition: 'zoom-in',
      transitionDuration: 0.4,
      fx: [
        { id: 'chroma-boost', value: 0.5 },
        { id: 'glow', value: 0.35 },
      ],
      keyframes: [
        { id: 'mb0', time: 0, property: 'scale', value: 0.92, easing: 'ease-out' },
        { id: 'mb1', time: 1, property: 'scale', value: 1.05, easing: 'ease-in-out' },
        { id: 'mb2', time: 10, property: 'scale', value: 1.05, easing: 'linear' },
      ],
    },
  },
  {
    id: 'minimal-still',
    name: 'Minimal Still',
    description: 'Clean grade, gentle pan — product and stills.',
    patch: {
      filter: 'none',
      transition: 'dissolve',
      transitionDuration: 0.5,
      motion: 'pan-right',
      fx: [{ id: 'vignette', value: 0.2 }],
    },
  },
];

export function getClipTemplate(id: string): ClipTemplate | undefined {
  return CLIP_TEMPLATES.find((t) => t.id === id);
}

/** Resolve a template patch against a clip (duration-dependent values). */
export function resolveTemplatePatch(
  template: ClipTemplate,
  clipDuration: number,
): Record<string, unknown> {
  const patch: Record<string, unknown> = { ...template.patch };
  if (patch.speedCurve === 'velocity') {
    const d = Math.max(1, clipDuration);
    patch.speedCurve = [
      { time: 0, speed: 1 },
      { time: d * 0.4, speed: 1 },
      { time: d * 0.55, speed: 4 },
      { time: d * 0.7, speed: 1 },
      { time: d, speed: 1 },
    ];
  }
  // Deep-copy arrays so two clips never share a keyframe/FX list.
  if (Array.isArray(patch.keyframes)) {
    patch.keyframes = (patch.keyframes as unknown[]).map((k) => ({ ...(k as object) }));
  }
  if (Array.isArray(patch.fx)) {
    patch.fx = (patch.fx as unknown[]).map((f) => ({ ...(f as object) }));
  }
  return patch;
}
