/**
 * AI special effects for the Cinema Engine.
 *
 * The model does not paint pixels: it writes a *recipe* — a small, validated
 * set of passes with palettes and intensities — and this module renders that
 * recipe onto the program layer every frame. Two consequences matter:
 *
 *  - the preview, the recorded take and the exported master all run the same
 *    pass list, so what the artist sees is what ships;
 *  - a recipe is data, so it saves with the project, survives a reload, and
 *    can be authored offline from the preset shelf when the provider is out.
 *
 * Passes are resolved in frame space (1080p-relative units), so a 4K export
 * gets the same look as the preview rather than a crop of it.
 */

import type { TransientHit } from './audio-transients';

/**
 * Onsets detected in the music bed, plus the bed's loop length when it
 * repeats. The renderer looks up the most recent hit instead of guessing a
 * beat from the tempo, so a burst lands on the actual kick or stab.
 */
export interface AiVfxTransientTrack {
  hits: readonly TransientHit[];
  /** Wrap hit lookups by this many seconds when the bed loops. */
  loopDuration?: number;
}

export interface TransientEnvelope {
  active: boolean;
  /** Seconds since the onset; Infinity when no hit is in range. */
  age: number;
  /** 0..1 strength of the onset that opened the envelope. */
  strength: number;
}

/** The five production families the effect shelf is organised around. */
export type AiVfxStyle =
  | 'cartoon'
  | 'animation'
  | 'avatar'
  | 'action'
  | 'music-video';

/** One renderable overlay pass. */
export type AiVfxPassId =
  | 'speed-lines'
  | 'impact-sparks'
  | 'shockwave'
  | 'energy-aura'
  | 'halftone'
  | 'comic-burst'
  | 'neon-orbit'
  | 'rain'
  | 'snow'
  | 'embers'
  | 'light-leak'
  | 'chromatic-split'
  | 'afterimage'
  | 'lens-flare'
  | 'scan-glitch'
  | 'stardust';

export interface AiVfxPass {
  id: AiVfxPassId;
  /** 0..1 — how strongly this pass reads inside the recipe. */
  intensity: number;
  /** Two hex colours; the pass falls back to its own palette when unset. */
  palette?: [string, string];
}

/** A model-authored (or preset) effect recipe. Pure data, safe to persist. */
export interface AiVfxRecipe {
  style: AiVfxStyle;
  name: string;
  description: string;
  /** Suggested base grade from the clip filter shelf, when the model named one. */
  grade?: string;
  /** Beat the pulses lock to; defaults to the preset's tempo. */
  pulseBpm: number;
  passes: AiVfxPass[];
  /** Whether this came from a model answer or from the local preset shelf. */
  origin: 'ai' | 'preset';
}

/** What a clip stores: the recipe plus the operator's master dial. */
export interface AiVfxSettings {
  enabled: boolean;
  /** 0..1 master intensity multiplied into every pass. */
  intensity: number;
  recipe: AiVfxRecipe;
}

export interface AiVfxStyleInfo {
  id: AiVfxStyle;
  label: string;
  hint: string;
  /** What this family is for, shown in the picker. */
  useCase: string;
}

export const AI_VFX_STYLES: AiVfxStyleInfo[] = [
  {
    id: 'cartoon',
    label: 'Cartoon',
    hint: 'Cel inks, halftone and comic impact',
    useCase: 'Toon shorts, skits and illustrated storytelling',
  },
  {
    id: 'animation',
    label: 'Animation',
    hint: 'Anime auras, motion echoes and sparkle',
    useCase: 'Animated sequences and stylised performance cuts',
  },
  {
    id: 'avatar',
    label: 'Avatar',
    hint: 'Holograms, signal ghosts and neon orbits',
    useCase: 'Virtual performers, digital doubles and VTuber frames',
  },
  {
    id: 'action',
    label: 'Action',
    hint: 'Sparks, shockwaves, speed storms and flares',
    useCase: 'Chases, hits, explosions and trailer beats',
  },
  {
    id: 'music-video',
    label: 'Music Video',
    hint: 'Neon pulses, light leaks and VHS glitch',
    useCase: 'Performance visuals cut to the track',
  },
];

interface AiVfxPassInfo {
  id: AiVfxPassId;
  label: string;
  hint: string;
  palette: [string, string];
}

/** Every pass the renderer knows, with the palette it defaults to. */
export const AI_VFX_PASSES: AiVfxPassInfo[] = [
  { id: 'speed-lines', label: 'Speed Lines', hint: 'Radial velocity streaks', palette: ['#ffffff', '#7dd3fc'] },
  { id: 'impact-sparks', label: 'Impact Sparks', hint: 'Bursts of hot debris on the beat', palette: ['#fde68a', '#fb923c'] },
  { id: 'shockwave', label: 'Shockwave', hint: 'Expanding pressure rings', palette: ['#f8fafc', '#38bdf8'] },
  { id: 'energy-aura', label: 'Energy Aura', hint: 'Pulsing body glow', palette: ['#a78bfa', '#22d3ee'] },
  { id: 'halftone', label: 'Halftone', hint: 'Comic dot screen', palette: ['#f8fafc', '#f8fafc'] },
  { id: 'comic-burst', label: 'Comic Burst', hint: 'Radiating ink wedges', palette: ['#fef08a', '#f472b6'] },
  { id: 'neon-orbit', label: 'Neon Orbit', hint: 'Orbiting light motes', palette: ['#22d3ee', '#e879f9'] },
  { id: 'rain', label: 'Rain', hint: 'Driving streaks of weather', palette: ['#bae6fd', '#e0f2fe'] },
  { id: 'snow', label: 'Snow', hint: 'Drifting flakes', palette: ['#ffffff', '#e0f2fe'] },
  { id: 'embers', label: 'Embers', hint: 'Rising hot flecks', palette: ['#fbbf24', '#f97316'] },
  { id: 'light-leak', label: 'Light Leak', hint: 'Warm moving film leak', palette: ['#fb923c', '#f43f5e'] },
  { id: 'chromatic-split', label: 'Chromatic Split', hint: 'RGB fringe on the frame', palette: ['#f87171', '#22d3ee'] },
  { id: 'afterimage', label: 'Afterimage', hint: 'Motion echo of the picture', palette: ['#a5b4fc', '#f8fafc'] },
  { id: 'lens-flare', label: 'Lens Flare', hint: 'Anamorphic streak and core', palette: ['#fef3c7', '#38bdf8'] },
  { id: 'scan-glitch', label: 'Scan Glitch', hint: 'Sliced signal displacement', palette: ['#f0abfc', '#22d3ee'] },
  { id: 'stardust', label: 'Stardust', hint: 'Twinkling floating specks', palette: ['#fef9c3', '#c4b5fd'] },
];

const PASS_BY_ID = new Map<string, AiVfxPassInfo>(
  AI_VFX_PASSES.map((pass) => [pass.id, pass]),
);

export interface AiVfxPreset {
  id: string;
  style: AiVfxStyle;
  name: string;
  description: string;
  /** Example brief the preset was tuned for; also feeds the model prompt. */
  brief: string;
  /** Words that pick this preset from a free-text brief when offline. */
  keywords: string[];
  recipe: AiVfxRecipe;
}

const recipe = (
  style: AiVfxStyle,
  name: string,
  description: string,
  grade: string,
  pulseBpm: number,
  passes: AiVfxPass[],
): AiVfxRecipe => ({
  style,
  name,
  description,
  grade,
  pulseBpm,
  passes,
  origin: 'preset',
});

/**
 * The shelf. Every family ships four looks so the operator can work without a
 * network call, and so a model answer has a same-family fallback that is still
 * a real effect rather than "none".
 */
export const AI_VFX_PRESETS: AiVfxPreset[] = [
  {
    id: 'cel-pop',
    style: 'cartoon',
    name: 'Cel Pop',
    description: 'Ink dot screen, comic wedges and a warm pop aura on the beat.',
    brief: 'bright cartoon cel-shaded look with comic dots and a punchy impact aura',
    keywords: ['cel', 'comic', 'ink', 'dot', 'bright', 'toon'],
    recipe: recipe('cartoon', 'Cel Pop', 'Halftone ink and a comic burst on every other beat.', 'vivid', 104, [
      { id: 'halftone', intensity: 0.55 },
      { id: 'comic-burst', intensity: 0.5 },
      { id: 'energy-aura', intensity: 0.45, palette: ['#facc15', '#f472b6'] },
    ]),
  },
  {
    id: 'comic-impact',
    style: 'cartoon',
    name: 'Comic Impact',
    description: 'Sparks, radial speed and a starburst for the hit frame.',
    brief: 'comic-book impact frame with sparks, speed lines and a starburst',
    keywords: ['impact', 'hit', 'punch', 'spark', 'burst', 'pow'],
    recipe: recipe('cartoon', 'Comic Impact', 'A POW frame: sparks, speed lines and radiating ink.', 'vivid', 96, [
      { id: 'impact-sparks', intensity: 0.8 },
      { id: 'speed-lines', intensity: 0.6 },
      { id: 'comic-burst', intensity: 0.7 },
    ]),
  },
  {
    id: 'toon-speed',
    style: 'cartoon',
    name: 'Toon Speed',
    description: 'Velocity streaks and motion echo for a chase gag.',
    brief: 'cartoon chase with exaggerated speed lines and a motion echo',
    keywords: ['chase', 'run', 'speed', 'fast', 'zoom'],
    recipe: recipe('cartoon', 'Toon Speed', 'Smear-frame streaks and a trailing echo.', 'vivid', 120, [
      { id: 'speed-lines', intensity: 0.85 },
      { id: 'afterimage', intensity: 0.4 },
      { id: 'halftone', intensity: 0.35 },
    ]),
  },
  {
    id: 'bubblegum-drift',
    style: 'cartoon',
    name: 'Bubblegum Drift',
    description: 'Soft candy aura, sparkles and a pastel leak.',
    brief: 'sweet pastel cartoon with floating sparkles and a soft light leak',
    keywords: ['pastel', 'cute', 'sweet', 'sparkle', 'pink'],
    recipe: recipe('cartoon', 'Bubblegum Drift', 'Candy palette aura with drifting sparkles.', 'dream', 88, [
      { id: 'energy-aura', intensity: 0.5, palette: ['#f9a8d4', '#c4b5fd'] },
      { id: 'stardust', intensity: 0.6 },
      { id: 'light-leak', intensity: 0.35, palette: ['#f9a8d4', '#fde68a'] },
    ]),
  },
  {
    id: 'anime-aura',
    style: 'animation',
    name: 'Anime Aura',
    description: 'Charged body glow with rising speed lines.',
    brief: 'anime power-up aura with vertical energy and speed lines',
    keywords: ['anime', 'aura', 'power', 'charge', 'energy'],
    recipe: recipe('animation', 'Anime Aura', 'A charged glow with streaks climbing the frame.', 'vivid', 128, [
      { id: 'energy-aura', intensity: 0.7, palette: ['#a78bfa', '#22d3ee'] },
      { id: 'speed-lines', intensity: 0.5 },
      { id: 'stardust', intensity: 0.35 },
    ]),
  },
  {
    id: 'sparkle-drift',
    style: 'animation',
    name: 'Sparkle Drift',
    description: 'Floating dust, snow and a gentle glow.',
    brief: 'dreamy animated scene with floating sparkles and soft snowfall',
    keywords: ['dream', 'magic', 'snow', 'float', 'sparkle'],
    recipe: recipe('animation', 'Sparkle Drift', 'Slow dust and snow with a pastel aura.', 'dream', 76, [
      { id: 'stardust', intensity: 0.7 },
      { id: 'snow', intensity: 0.45 },
      { id: 'energy-aura', intensity: 0.3, palette: ['#c4b5fd', '#a5f3fc'] },
    ]),
  },
  {
    id: 'storybook-glow',
    style: 'animation',
    name: 'Storybook Glow',
    description: 'Warm leak and ink dots for a hand-drawn feel.',
    brief: 'storybook animation with warm light and printed texture',
    keywords: ['storybook', 'warm', 'hand-drawn', 'print', 'soft'],
    recipe: recipe('animation', 'Storybook Glow', 'A warm leak over a printed dot texture.', 'golden-hour', 72, [
      { id: 'light-leak', intensity: 0.5 },
      { id: 'halftone', intensity: 0.3 },
      { id: 'stardust', intensity: 0.3 },
    ]),
  },
  {
    id: 'motion-echo',
    style: 'animation',
    name: 'Motion Echo',
    description: 'Frame echo with a chromatic fringe for fast animation.',
    brief: 'fast animated action with motion echo and rgb fringing',
    keywords: ['echo', 'motion', 'smear', 'fast', 'rgb'],
    recipe: recipe('animation', 'Motion Echo', 'Trailing frames with a colour fringe.', 'cinematic', 112, [
      { id: 'afterimage', intensity: 0.6 },
      { id: 'chromatic-split', intensity: 0.45 },
      { id: 'speed-lines', intensity: 0.35 },
    ]),
  },
  {
    id: 'holo-avatar',
    style: 'avatar',
    name: 'Holo Avatar',
    description: 'Hologram scan, aura and orbiting motes.',
    brief: 'holographic virtual performer with scanlines, aura and orbiting lights',
    keywords: ['hologram', 'holo', 'virtual', 'scan', 'digital'],
    recipe: recipe('avatar', 'Holo Avatar', 'A scanning hologram with an orbital halo.', 'cold-steel', 100, [
      { id: 'scan-glitch', intensity: 0.55 },
      { id: 'energy-aura', intensity: 0.55, palette: ['#22d3ee', '#a78bfa'] },
      { id: 'neon-orbit', intensity: 0.5 },
    ]),
  },
  {
    id: 'neon-orbit',
    style: 'avatar',
    name: 'Neon Orbit',
    description: 'Rings of light circling the performer.',
    brief: 'avatar ringed by neon lights with stardust and a club glow',
    keywords: ['neon', 'orbit', 'ring', 'club', 'light'],
    recipe: recipe('avatar', 'Neon Orbit', 'Three rings of light around the subject.', 'neon-pulse', 118, [
      { id: 'neon-orbit', intensity: 0.75 },
      { id: 'stardust', intensity: 0.4 },
      { id: 'light-leak', intensity: 0.3, palette: ['#22d3ee', '#e879f9'] },
    ]),
  },
  {
    id: 'digital-aura',
    style: 'avatar',
    name: 'Digital Aura',
    description: 'Signal fringe and a cool synthetic glow.',
    brief: 'digital double with rgb split and a cool synthetic aura',
    keywords: ['digital', 'synthetic', 'double', 'glitch', 'cool'],
    recipe: recipe('avatar', 'Digital Aura', 'RGB split around a cool synthetic glow.', 'cold-steel', 108, [
      { id: 'chromatic-split', intensity: 0.6 },
      { id: 'energy-aura', intensity: 0.45, palette: ['#38bdf8', '#a78bfa'] },
      { id: 'scan-glitch', intensity: 0.3 },
    ]),
  },
  {
    id: 'signal-ghost',
    style: 'avatar',
    name: 'Signal Ghost',
    description: 'A fading transmission echo of the avatar.',
    brief: 'ghosted avatar transmission with echo and broken signal slices',
    keywords: ['ghost', 'transmission', 'echo', 'fade', 'signal'],
    recipe: recipe('avatar', 'Signal Ghost', 'A fading echo with broken signal slices.', 'mono', 90, [
      { id: 'afterimage', intensity: 0.55 },
      { id: 'scan-glitch', intensity: 0.45 },
      { id: 'stardust', intensity: 0.25 },
    ]),
  },
  {
    id: 'blockbuster-impact',
    style: 'action',
    name: 'Blockbuster Impact',
    description: 'Sparks, pressure wave and anamorphic flare.',
    brief: 'blockbuster action hit with sparks, a shockwave and a lens flare',
    keywords: ['blockbuster', 'hit', 'explosion', 'flare', 'impact'],
    recipe: recipe('action', 'Blockbuster Impact', 'A trailer-grade hit: sparks, wave and flare.', 'teal-orange', 110, [
      { id: 'impact-sparks', intensity: 0.9 },
      { id: 'shockwave', intensity: 0.7 },
      { id: 'lens-flare', intensity: 0.5 },
    ]),
  },
  {
    id: 'speed-storm',
    style: 'action',
    name: 'Speed Storm',
    description: 'Driving rain, streak lines and a motion echo.',
    brief: 'action chase in heavy rain with speed lines and motion echo',
    keywords: ['chase', 'rain', 'storm', 'speed', 'car'],
    recipe: recipe('action', 'Speed Storm', 'Rain streaks and speed lines through a chase.', 'cold-steel', 126, [
      { id: 'rain', intensity: 0.8 },
      { id: 'speed-lines', intensity: 0.65 },
      { id: 'afterimage', intensity: 0.3 },
    ]),
  },
  {
    id: 'muzzle-flash',
    style: 'action',
    name: 'Muzzle Flash',
    description: 'Hard flare, embers and a pressure ring.',
    brief: 'action gunshot muzzle flash with embers and a shock ring',
    keywords: ['muzzle', 'gun', 'flash', 'shot', 'fire'],
    recipe: recipe('action', 'Muzzle Flash', 'A hard flare with embers and a ring.', 'bleach-bypass', 132, [
      { id: 'lens-flare', intensity: 0.8 },
      { id: 'shockwave', intensity: 0.5 },
      { id: 'embers', intensity: 0.6 },
    ]),
  },
  {
    id: 'explosion-shockwave',
    style: 'action',
    name: 'Explosion Shockwave',
    description: 'Rolling rings, embers and debris sparks.',
    brief: 'explosion with expanding shockwaves, embers and flying sparks',
    keywords: ['explosion', 'blast', 'shockwave', 'debris', 'fire'],
    recipe: recipe('action', 'Explosion Shockwave', 'Expanding rings with hot debris.', 'vivid', 100, [
      { id: 'shockwave', intensity: 0.9 },
      { id: 'embers', intensity: 0.8 },
      { id: 'impact-sparks', intensity: 0.6 },
    ]),
  },
  {
    id: 'neon-pulse',
    style: 'music-video',
    name: 'Neon Pulse',
    description: 'Beat-locked aura, orbit lights and a leak.',
    brief: 'neon music video performance with beat-locked glow and orbiting lights',
    keywords: ['neon', 'pulse', 'beat', 'club', 'performance'],
    recipe: recipe('music-video', 'Neon Pulse', 'Beat-locked glow with orbital light.', 'neon-pulse', 124, [
      { id: 'energy-aura', intensity: 0.6, palette: ['#22d3ee', '#e879f9'] },
      { id: 'neon-orbit', intensity: 0.5 },
      { id: 'light-leak', intensity: 0.35 },
    ]),
  },
  {
    id: 'chrome-leak',
    style: 'music-video',
    name: 'Chrome Leak',
    description: 'Anamorphic leak and a chrome flare across the frame.',
    brief: 'chrome music video with light leaks and anamorphic flares',
    keywords: ['chrome', 'leak', 'flare', 'film', 'warm'],
    recipe: recipe('music-video', 'Chrome Leak', 'Moving leaks and anamorphic streaks.', 'teal-orange', 96, [
      { id: 'light-leak', intensity: 0.7 },
      { id: 'lens-flare', intensity: 0.5 },
      { id: 'chromatic-split', intensity: 0.25 },
    ]),
  },
  {
    id: 'strobe-burst',
    style: 'music-video',
    name: 'Strobe Burst',
    description: 'Hard strobe bursts and poster-frame echo.',
    brief: 'strobe-lit music video with impact bursts and frame echo',
    keywords: ['strobe', 'flash', 'burst', 'hard', 'edit'],
    recipe: recipe('music-video', 'Strobe Burst', 'Strobe impacts over an echoing frame.', 'vivid', 140, [
      { id: 'impact-sparks', intensity: 0.65 },
      { id: 'comic-burst', intensity: 0.55 },
      { id: 'afterimage', intensity: 0.35 },
    ]),
  },
  {
    id: 'vhs-glitch',
    style: 'music-video',
    name: 'VHS Glitch',
    description: 'Sliced signal, RGB fringe and tape rain.',
    brief: 'vhs music video with tape glitch, rgb split and tracking noise',
    keywords: ['vhs', 'tape', 'glitch', 'retro', 'tracking'],
    recipe: recipe('music-video', 'VHS Glitch', 'Tape slices and an RGB fringe.', 'mono', 104, [
      { id: 'scan-glitch', intensity: 0.7 },
      { id: 'chromatic-split', intensity: 0.55 },
      { id: 'rain', intensity: 0.2 },
    ]),
  },
];

const STYLE_IDS = new Set<string>(AI_VFX_STYLES.map((style) => style.id));

export function isAiVfxStyle(value: unknown): value is AiVfxStyle {
  return typeof value === 'string' && STYLE_IDS.has(value);
}

export function isAiVfxPassId(value: unknown): value is AiVfxPassId {
  return typeof value === 'string' && PASS_BY_ID.has(value);
}

function clamp01(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function sanitizePalette(value: unknown): [string, string] | undefined {
  if (!Array.isArray(value) || value.length < 2) return undefined;
  const [a, b] = value;
  if (typeof a !== 'string' || typeof b !== 'string') return undefined;
  if (!HEX.test(a) || !HEX.test(b)) return undefined;
  return [a, b];
}

function sanitizePass(raw: unknown): AiVfxPass | null {
  if (!raw || typeof raw !== 'object') return null;
  const entry = raw as Partial<AiVfxPass>;
  if (!isAiVfxPassId(entry.id)) return null;
  const intensity = clamp01(entry.intensity, 0.5);
  if (intensity <= 0) return null;
  const palette = sanitizePalette(entry.palette);
  return palette ? { id: entry.id, intensity, palette } : { id: entry.id, intensity };
}

/** Coerce a stored/model recipe into something the renderer can trust. */
export function sanitizeAiVfxRecipe(value: unknown): AiVfxRecipe | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<AiVfxRecipe>;
  if (!isAiVfxStyle(raw.style)) return null;
  if (!Array.isArray(raw.passes)) return null;
  const passes = raw.passes
    .map(sanitizePass)
    .filter((pass): pass is AiVfxPass => pass !== null)
    .slice(0, 8);
  if (!passes.length) return null;
  const name =
    typeof raw.name === 'string' && raw.name.trim()
      ? raw.name.trim().slice(0, 60)
      : 'AI Effect';
  const description =
    typeof raw.description === 'string' ? raw.description.trim().slice(0, 180) : '';
  const grade =
    typeof raw.grade === 'string' && raw.grade.trim()
      ? raw.grade.trim().slice(0, 32)
      : undefined;
  return {
    style: raw.style,
    name,
    description,
    grade,
    pulseBpm: Math.round(clampNumber(raw.pulseBpm, 40, 200, 100)),
    passes,
    origin: raw.origin === 'ai' ? 'ai' : 'preset',
  };
}

/** Coerce stored settings; legacy/unknown records simply carry no effect. */
export function sanitizeAiVfx(value: unknown): AiVfxSettings | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<AiVfxSettings>;
  const sanitized = sanitizeAiVfxRecipe(raw.recipe);
  if (!sanitized) return null;
  return {
    enabled: raw.enabled !== false,
    intensity: clamp01(raw.intensity, 0.75),
    recipe: sanitized,
  };
}

/**
 * Validate a saved section plan before it reaches the console. A project can
 * outlive the build that wrote it, so every section, recipe and range is
 * rebuilt from checked fields — one unusable entry is dropped, not the cut.
 */
export function sanitizeAiVfxSectionPlan(value: unknown): AiVfxSectionPlan | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<AiVfxSectionPlan>;
  if (!isAiVfxStyle(raw.style)) return null;
  if (!Array.isArray(raw.sections) || raw.sections.length === 0) return null;

  const sections: AiVfxSectionAssignment[] = [];
  raw.sections.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return;
    const section = entry as Partial<AiVfxSectionAssignment>;
    const recipe = sanitizeAiVfxRecipe(section.recipe);
    // A plan is one family by construction; a mixed record is a hand-edit or
    // a corrupted write, and must not smuggle in another look.
    if (!recipe || recipe.style !== raw.style) return;
    const start = Number(section.startTime);
    const end = Number(section.endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return;
    const startTime = Math.max(0, start);
    sections.push({
      section:
        typeof section.section === 'string' && section.section.trim()
          ? section.section.trim().slice(0, 80)
          : `Section ${index + 1}`,
      startTime,
      endTime: Math.max(startTime + 0.01, end),
      recipe,
      intensity: clamp01(section.intensity, 0.7),
    });
  });
  if (!sections.length) return null;
  sections.sort((a, b) => a.startTime - b.startTime);

  const label =
    AI_VFX_STYLES.find((entry) => entry.id === raw.style)?.label ?? raw.style;
  return {
    title:
      typeof raw.title === 'string' && raw.title.trim()
        ? raw.title.trim().slice(0, 60)
        : `${label} Section FX`,
    brief: typeof raw.brief === 'string' ? raw.brief.slice(0, 400) : '',
    style: raw.style,
    sections,
    origin: raw.origin === 'ai' ? 'ai' : 'preset',
  };
}

/** Deep copy so two clips never share one recipe's pass array. */
export function copyAiVfxSettings(settings: AiVfxSettings): AiVfxSettings {
  return {
    enabled: settings.enabled,
    intensity: settings.intensity,
    recipe: {
      ...settings.recipe,
      passes: settings.recipe.passes.map((pass) => ({
        ...pass,
        palette: pass.palette ? [...pass.palette] : undefined,
      })),
    },
  };
}

/** Pick the preset whose keywords best match a free-text brief. */
export function presetRecipe(style: AiVfxStyle, brief = ''): AiVfxRecipe {
  const family = AI_VFX_PRESETS.filter((preset) => preset.style === style);
  const words = brief.toLowerCase();
  let best = family[0];
  let bestScore = -1;
  for (const preset of family) {
    const score = preset.keywords.reduce(
      (total, keyword) => total + (words.includes(keyword) ? 1 : 0),
      0,
    );
    if (score > bestScore) {
      bestScore = score;
      best = preset;
    }
  }
  return {
    ...best.recipe,
    passes: best.recipe.passes.map((pass) => ({
      ...pass,
      palette: pass.palette ? [...pass.palette] : undefined,
    })),
    origin: 'preset',
  };
}

export function presetById(id: string): AiVfxPreset | undefined {
  return AI_VFX_PRESETS.find((preset) => preset.id === id);
}

/* ── Section plans: one recipe per part of the piece ───────────────── */

export interface AiVfxSectionRange {
  section: string;
  startTime: number;
  endTime: number;
}

export interface AiVfxSectionAssignment extends AiVfxSectionRange {
  recipe: AiVfxRecipe;
  /** 0..1 master dial for this section. */
  intensity: number;
}

export interface AiVfxSectionPlan {
  title: string;
  brief: string;
  style: AiVfxStyle;
  sections: AiVfxSectionAssignment[];
  origin: 'ai' | 'preset';
}

/** Words in a track brief that name a production family. */
const STYLE_KEYWORDS: Record<AiVfxStyle, string[]> = {
  cartoon: ['cartoon', 'toon', 'comic', 'cel', 'sketch', 'kids', 'illustrated'],
  animation: ['anime', 'animation', 'animated', 'manga', 'storybook', 'motion'],
  avatar: ['avatar', 'hologram', 'holo', 'virtual', 'vtuber', 'digital double', 'character'],
  action: ['action', 'chase', 'fight', 'explosion', 'blockbuster', 'stunt', 'combat', 'gun'],
  'music-video': ['music video', 'performance', 'neon', 'club', 'concert', 'visualizer'],
};

/**
 * Read the family the track brief is asking for. The artist's selected family
 * wins only when the brief says nothing more specific, so "a cartoon skit"
 * cannot quietly ship an action look.
 */
export function inferAiVfxStyle(
  brief: string,
  fallback: AiVfxStyle = 'music-video',
): AiVfxStyle {
  const words = (brief || '').toLowerCase();
  let best = fallback;
  let bestScore = 0;
  for (const style of AI_VFX_STYLES) {
    const score = STYLE_KEYWORDS[style.id].reduce(
      (total, keyword) => total + (words.includes(keyword) ? 1 : 0),
      0,
    );
    if (score > bestScore) {
      bestScore = score;
      best = style.id;
    }
  }
  return best;
}

/** Section-name rules that pick a same-family shelf look. */
const SECTION_PRESET_RULES: Record<AiVfxStyle, { pattern: RegExp; presetId: string }[]> = {
  cartoon: [
    { pattern: /final|climax|chorus|hook|drop/, presetId: 'comic-impact' },
    { pattern: /bridge|break|solo/, presetId: 'toon-speed' },
    { pattern: /intro|outro|open|end|credits/, presetId: 'bubblegum-drift' },
    { pattern: /verse|act|scene|segment/, presetId: 'cel-pop' },
  ],
  animation: [
    { pattern: /final|climax|chorus|hook|drop/, presetId: 'anime-aura' },
    { pattern: /bridge|break|solo/, presetId: 'motion-echo' },
    { pattern: /intro|outro|open|end|credits/, presetId: 'storybook-glow' },
    { pattern: /verse|act|scene|segment/, presetId: 'sparkle-drift' },
  ],
  avatar: [
    { pattern: /final|climax|chorus|hook|drop/, presetId: 'holo-avatar' },
    { pattern: /bridge|break|solo/, presetId: 'neon-orbit' },
    { pattern: /intro|outro|open|end|credits/, presetId: 'signal-ghost' },
    { pattern: /verse|act|scene|segment/, presetId: 'digital-aura' },
  ],
  action: [
    { pattern: /final|climax|chorus|hook|drop/, presetId: 'explosion-shockwave' },
    { pattern: /bridge|break|solo|chase/, presetId: 'muzzle-flash' },
    { pattern: /intro|outro|open|end|credits/, presetId: 'speed-storm' },
    { pattern: /verse|act|scene|segment/, presetId: 'blockbuster-impact' },
  ],
  'music-video': [
    { pattern: /final|climax|chorus|hook|drop/, presetId: 'neon-pulse' },
    { pattern: /bridge|break|solo|interlude/, presetId: 'vhs-glitch' },
    { pattern: /intro|outro|open|end|credits/, presetId: 'chrome-leak' },
    { pattern: /verse|act|scene|segment/, presetId: 'strobe-burst' },
  ],
};

function cloneRecipe(recipe: AiVfxRecipe, origin: 'ai' | 'preset'): AiVfxRecipe {
  return {
    ...recipe,
    passes: recipe.passes.map((pass) => ({
      ...pass,
      palette: pass.palette ? [...pass.palette] : undefined,
    })),
    origin,
  };
}

function normaliseSectionLabel(label: string): string {
  return String(label || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function normalizeSectionRanges(
  sections: readonly AiVfxSectionRange[],
): AiVfxSectionRange[] {
  return sections
    .filter((section) => section && typeof section.section === 'string')
    .map((section, index) => {
      const startTime = Math.max(0, Number(section.startTime) || 0);
      const rawEnd = Number(section.endTime);
      const endTime = Math.max(
        startTime + 0.01,
        Number.isFinite(rawEnd) ? rawEnd : startTime + 0.01,
      );
      return {
        section: section.section.trim() || `Section ${index + 1}`,
        startTime,
        endTime,
      };
    })
    .sort((a, b) => a.startTime - b.startTime);
}

function sectionIntensity(label: string): number {
  const words = label.toLowerCase();
  if (/final|climax|drop/.test(words)) return 0.95;
  if (/chorus|hook/.test(words)) return 0.9;
  if (/pre-?chorus|build/.test(words)) return 0.8;
  if (/bridge|break|solo|interlude/.test(words)) return 0.72;
  if (/verse/.test(words)) return 0.65;
  if (/intro|outro|credits|end/.test(words)) return 0.5;
  return 0.7;
}

function pickSectionRecipe(
  style: AiVfxStyle,
  label: string,
  brief: string,
): AiVfxRecipe {
  const family = AI_VFX_PRESETS.filter((preset) => preset.style === style);
  const haystack = `${label} ${brief}`.toLowerCase();
  for (const rule of SECTION_PRESET_RULES[style] ?? []) {
    if (!rule.pattern.test(haystack)) continue;
    const preset = family.find((candidate) => candidate.id === rule.presetId);
    if (preset) return preset.recipe;
  }
  return presetRecipe(style, haystack);
}

/**
 * The local plan: section name decides the look, the brief only breaks ties.
 * It ships when the model is out of reach, and it is the skeleton a directed
 * answer fills in.
 */
export function buildLocalSectionVfxPlan(
  brief: string,
  style: AiVfxStyle,
  sections: readonly AiVfxSectionRange[],
): AiVfxSectionPlan {
  const safeStyle = isAiVfxStyle(style) ? style : 'music-video';
  const ranges = normalizeSectionRanges(sections);
  const label = AI_VFX_STYLES.find((entry) => entry.id === safeStyle)?.label ?? safeStyle;
  return {
    title: brief.trim()
      ? `${brief.trim().slice(0, 48)} — Section FX`
      : `${label} Section FX`,
    brief,
    style: safeStyle,
    sections: ranges.map((range) => ({
      ...range,
      recipe: cloneRecipe(pickSectionRecipe(safeStyle, range.section, brief), 'preset'),
      intensity: sectionIntensity(range.section),
    })),
    origin: 'preset',
  };
}

/** Ask for a per-section assignment, bounded to one family. */
export function buildAiVfxSectionPrompt(
  brief: string,
  style: AiVfxStyle,
  sections: readonly AiVfxSectionRange[],
  mode: string,
  bpm: number,
): string {
  const safeStyle = isAiVfxStyle(style) ? style : 'music-video';
  const label = AI_VFX_STYLES.find((entry) => entry.id === safeStyle)?.label ?? safeStyle;
  const shelf = AI_VFX_PRESETS.filter((preset) => preset.style === safeStyle)
    .map((preset) => `- ${preset.id}: ${preset.name} — ${preset.description}`)
    .join('\n');
  const sectionList = normalizeSectionRanges(sections)
    .map(
      (section, index) =>
        `${index + 1}. "${section.section}" (${section.startTime.toFixed(1)}-${section.endTime.toFixed(1)}s)`,
    )
    .join('\n');

  return [
    'You are the special-effects supervisor inside S.M.U.V.E Cinema Engine.',
    `Production: ${mode}. Visual family: ${label} (${safeStyle}). Tempo: ${bpm} BPM.`,
    'Assign one special-effects look to each section of this cut.',
    'These effects fire on transients detected in the music bed, so stronger looks belong on choruses, drops and finales; intros and outros stay restrained.',
    '',
    'Sections, in timeline order:',
    sectionList || '1. "Full Cut" (the whole piece)',
    '',
    `Choose one preset id per section from this ${label} shelf and nothing else:`,
    shelf,
    '',
    'Answer with ONLY JSON, no prose, markdown or code fences:',
    '{"title":"<=60 chars","sections":[{"section":"exact section label","preset":"preset-id","intensity":0.0-1.0}]}',
    'Cover every section exactly once. Keep intensities between 0.2 and 0.95.',
    `ARTIST BRIEF: ${brief.trim() || 'a signature look for this track'}`,
  ].join('\n');
}

/**
 * Read a directed section plan. A skipped section keeps the local look, an
 * out-of-family preset is rejected, and a prose answer falls back wholesale —
 * the timeline always gets one valid recipe per section.
 */
export function parseAiVfxSectionPlan(
  answer: string,
  brief: string,
  style: AiVfxStyle,
  sections: readonly AiVfxSectionRange[],
): AiVfxSectionPlan {
  const safeStyle = isAiVfxStyle(style) ? style : inferAiVfxStyle(brief, 'music-video');
  const fallback = buildLocalSectionVfxPlan(brief, safeStyle, sections);
  if (!fallback.sections.length) return fallback;

  const cleaned = (answer || '').replace(/```(?:json)?/gi, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return fallback;

  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    if (!parsed || typeof parsed !== 'object') return fallback;
    payload = parsed as Record<string, unknown>;
  } catch {
    return fallback;
  }

  const rawSections = Array.isArray(payload['sections']) ? payload['sections'] : [];
  if (!rawSections.length) return fallback;

  const byLabel = new Map<string, Record<string, unknown>>();
  rawSections.forEach((raw) => {
    if (!raw || typeof raw !== 'object') return;
    const entry = raw as Record<string, unknown>;
    const label =
      typeof entry['section'] === 'string' ? normaliseSectionLabel(entry['section']) : '';
    if (label) byLabel.set(label, entry);
  });

  let directed = 0;
  const assignments = fallback.sections.map((section, index) => {
    const byIndex =
      rawSections.length === fallback.sections.length &&
      rawSections[index] &&
      typeof rawSections[index] === 'object'
        ? (rawSections[index] as Record<string, unknown>)
        : undefined;
    const entry = byLabel.get(normaliseSectionLabel(section.section)) ?? byIndex;
    const preset =
      entry && typeof entry['preset'] === 'string' ? presetById(entry['preset']) : undefined;
    if (!preset || preset.style !== safeStyle) return section;
    const rawIntensity = Number(entry?.['intensity']);
    const intensity = Number.isFinite(rawIntensity)
      ? Math.max(0.2, Math.min(1, rawIntensity))
      : section.intensity;
    directed += 1;
    return {
      ...section,
      recipe: cloneRecipe(preset.recipe, 'ai'),
      intensity,
    };
  });
  if (!directed) return fallback;

  const title =
    typeof payload['title'] === 'string' && payload['title'].trim()
      ? payload['title'].trim().slice(0, 60)
      : fallback.title;
  return {
    title,
    brief,
    style: safeStyle,
    sections: assignments,
    origin: 'ai',
  };
}


/** The prompt the director sends: strict JSON, catalogue-bounded pass ids. */
export function buildAiVfxPrompt(
  brief: string,
  style: AiVfxStyle,
  mode: string,
  bpm = 120,
): string {
  const label = AI_VFX_STYLES.find((entry) => entry.id === style)?.label ?? style;
  const passList = AI_VFX_PASSES.map((pass) => `${pass.id} (${pass.hint})`).join(', ');
  return [
    'You are the special-effects supervisor inside S.M.U.V.E. Cinema Engine.',
    `Production: ${mode}. Visual family: ${label} (${style}). Track tempo: ${bpm} BPM.`,
    `Artist brief: ${brief.trim() || 'a signature look for this cut'}`,
    '',
    'Design a special-effects recipe that composites over live footage.',
    'Choose 2 to 5 passes from this exact catalogue, and nothing else:',
    passList,
    '',
    'Answer with ONE JSON object and no prose, markdown or code fences:',
    '{"name":"<=40 chars","description":"one sentence","grade":"cinematic|vivid|neon-pulse|teal-orange|cold-steel|mono|dream|golden-hour|bleach-bypass|none","pulseBpm":40-200,"passes":[{"id":"pass-id","intensity":0.0-1.0,"palette":["#rrggbb","#rrggbb"]}]}',
    'Palettes are optional; keep intensities between 0.2 and 0.9 so the footage stays readable.',
  ].join('\n');
}

/**
 * Read a model answer into a recipe.
 *
 * A prose-wrapped answer, a code fence, a string pass list or an out-of-range
 * intensity must not lose the whole effect, so the first JSON object is
 * extracted and every field is sanitised. When nothing usable came back the
 * same-family preset is returned — the artist still gets a real effect.
 */
export function parseAiVfxRecipe(
  answer: string,
  style: AiVfxStyle,
  brief = '',
): AiVfxRecipe {
  const fallback = presetRecipe(style, brief);
  if (typeof answer !== 'string' || !answer.trim()) return fallback;

  const cleaned = answer.replace(/```(?:json)?/gi, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return fallback;

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return fallback;
  }
  if (!parsed || typeof parsed !== 'object') return fallback;

  const raw = parsed as Record<string, unknown>;
  const rawPasses = Array.isArray(raw['passes']) ? raw['passes'] : [];
  const passes = rawPasses
    .map((entry) => {
      if (typeof entry === 'string') {
        return sanitizePass({ id: entry, intensity: 0.6 });
      }
      return sanitizePass(entry);
    })
    .filter((pass): pass is AiVfxPass => pass !== null)
    .slice(0, 6);

  if (!passes.length) return fallback;

  return {
    style,
    name:
      typeof raw['name'] === 'string' && raw['name'].trim()
        ? raw['name'].trim().slice(0, 60)
        : fallback.name,
    description:
      typeof raw['description'] === 'string' && raw['description'].trim()
        ? raw['description'].trim().slice(0, 180)
        : fallback.description,
    grade:
      typeof raw['grade'] === 'string' && raw['grade'].trim()
        ? raw['grade'].trim().slice(0, 32)
        : fallback.grade,
    pulseBpm: Math.round(clampNumber(raw['pulseBpm'], 40, 200, fallback.pulseBpm)),
    passes,
    origin: 'ai',
  };
}

/** One-line summary for the panel and for a Director report. */
export function describeAiVfx(settings: AiVfxSettings): string {
  const names = settings.recipe.passes
    .map((pass) => PASS_BY_ID.get(pass.id)?.label ?? pass.id)
    .join(', ');
  return `${settings.recipe.name} — ${names} at ${Math.round(
    settings.intensity * 100,
  )}%`;
}

/* ── Renderer ─────────────────────────────────────────────────────────── */

const TAU = Math.PI * 2;

/** Deterministic 0..1 from an index — a frame must not reseed randomly. */
function hash(index: number): number {
  const value = Math.sin(index * 127.1 + 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

function hexToRgba(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((char) => char + char)
          .join('')
      : value.padEnd(6, '0').slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
}

function paletteFor(pass: AiVfxPass): [string, string] {
  if (pass.palette) return pass.palette;
  return PASS_BY_ID.get(pass.id)?.palette ?? ['#ffffff', '#38bdf8'];
}

function beatPulse(time: number, bpm: number): number {
  const rate = Math.max(0.1, bpm / 60);
  return 0.5 + 0.5 * Math.sin(time * TAU * rate);
}

/**
 * The most recent onset at or before `timeSeconds`, with its age.
 *
 * Without a transient track this reports inactive and the caller keeps its
 * tempo pulse. With one, a burst outside `holdSeconds` stays inactive rather
 * than firing on an arbitrary clock tick: silence between hits is the point.
 */
export function transientEnvelope(
  track: AiVfxTransientTrack | null | undefined,
  timeSeconds: number,
  holdSeconds: number,
): TransientEnvelope {
  const inactive: TransientEnvelope = {
    active: false,
    age: Number.POSITIVE_INFINITY,
    strength: 0,
  };
  if (!track || !track.hits.length || !Number.isFinite(timeSeconds)) return inactive;

  const loop =
    Number.isFinite(track.loopDuration) && (track.loopDuration as number) > 0
      ? (track.loopDuration as number)
      : 0;
  const time = loop ? ((timeSeconds % loop) + loop) % loop : timeSeconds;

  let low = 0;
  let high = track.hits.length - 1;
  let index = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (track.hits[middle].time <= time) {
      index = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  let hit: TransientHit | undefined;
  if (index >= 0) {
    hit = track.hits[index];
  } else if (loop) {
    // Before the first hit of this pass: the previous pass's last hit is the
    // onset the frame is still inside when the bed wraps.
    const last = track.hits[track.hits.length - 1];
    hit = { time: last.time - loop, strength: last.strength };
  }
  if (!hit) return inactive;

  const age = time - hit.time;
  if (age < 0 || age > Math.max(0, holdSeconds)) return inactive;
  return {
    active: true,
    age,
    strength: Math.max(0, Math.min(1, hit.strength)),
  };
}

/**
 * Draw one recipe over the graded clip layer.
 *
 * Every pass saves/restores the context, uses only `globalAlpha`,
 * `globalCompositeOperation` and styles of its own, and scales its geometry
 * from `min(width, height)` so the same recipe reads identically on a phone
 * preview and a 4K master. `layer` is the already-graded picture; only the
 * echo, fringe and glitch passes sample it.
 */
export function renderAiVfx(
  ctx: CanvasRenderingContext2D,
  layer: CanvasImageSource,
  settings: AiVfxSettings | null | undefined,
  timeSeconds: number,
  width: number,
  height: number,
  transients?: AiVfxTransientTrack | null,
): void {
  if (!settings || !settings.enabled) return;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return;
  }
  // Recipes are validated when they are applied and again on restore, so the
  // per-frame path only takes the cheap guards it needs. Re-sanitising the
  // recipe on every frame would spend regexes and array copies inside the
  // render loop for data that is already known-good.
  const recipe = settings.recipe;
  if (!recipe || !Array.isArray(recipe.passes) || !recipe.passes.length) return;
  const master = clamp01(settings.intensity);
  if (master <= 0) return;
  const bpm = Number.isFinite(recipe.pulseBpm) ? recipe.pulseBpm : 100;

  const time = Number.isFinite(timeSeconds) ? Math.max(0, timeSeconds) : 0;
  const min = Math.min(width, height);
  const max = Math.max(width, height);
  const unit = min / 1080;
  const cx = width / 2;
  const cy = height / 2;
  const pulse = beatPulse(time, bpm);

  for (const pass of recipe.passes) {
    if (!pass || !isAiVfxPassId(pass.id)) continue;
    const strength = pass.intensity * master;
    if (strength <= 0.01) continue;
    const palette = paletteFor(pass);

    ctx.save();
    try {
      switch (pass.id) {
        case 'speed-lines': {
          ctx.globalCompositeOperation = 'lighter';
          ctx.lineCap = 'round';
          const count = 26;
          for (let i = 0; i < count; i += 1) {
            const angle = hash(i) * TAU + time * 0.08;
            const outer = max * (0.45 + hash(i + 9) * 0.3);
            const length = outer * (0.18 + hash(i + 17) * 0.3) * (0.7 + pulse * 0.5);
            const start = outer - length;
            const alpha = strength * (0.12 + hash(i + 3) * 0.22);
            ctx.strokeStyle = hexToRgba(i % 3 === 0 ? palette[1] : palette[0], alpha);
            ctx.lineWidth = Math.max(0.5, (0.8 + hash(i + 5) * 2.4) * unit);
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(angle) * start, cy + Math.sin(angle) * start);
            ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
            ctx.stroke();
          }
          break;
        }
        case 'impact-sparks': {
          ctx.globalCompositeOperation = 'lighter';
          const hold = 0.65;
          const hit = transientEnvelope(transients, time, hold);
          // With a bed the burst fires on the detected onset; without one it
          // falls back to a tempo pulse so the look still reads.
          if (transients && !hit.active) break;
          const period = Math.max(0.35, (60 / bpm) * 2);
          const phase = transients ? hit.age / hold : (time % period) / period;
          const fade = transients
            ? Math.pow(1 - phase, 2) * (0.35 + 0.65 * hit.strength)
            : (1 - phase) * (1 - phase);
          const sparks = 34;
          for (let i = 0; i < sparks; i += 1) {
            const angle = hash(i) * TAU;
            const reach = max * (0.05 + hash(i + 7) * 0.4) * Math.pow(phase, 0.7);
            const spread = (hash(i + 11) - 0.5) * max * 0.05 * phase;
            const x = cx + Math.cos(angle) * reach + Math.cos(angle + Math.PI / 2) * spread;
            const y = cy + Math.sin(angle) * reach + Math.sin(angle + Math.PI / 2) * spread;
            const radius = Math.max(0.6, (1 + hash(i + 13) * 3) * unit * (1 - phase * 0.5));
            ctx.fillStyle = hexToRgba(i % 4 === 0 ? palette[1] : palette[0], strength * fade * 0.9);
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, TAU);
            ctx.fill();
          }
          break;
        }
        case 'shockwave': {
          ctx.globalCompositeOperation = 'lighter';
          const hold = 0.95;
          const hit = transientEnvelope(transients, time, hold);
          if (transients && !hit.active) break;
          const period = Math.max(0.5, (60 / bpm) * 4);
          const phase = transients ? hit.age / hold : (time % period) / period;
          const energy = transients ? 0.45 + 0.55 * hit.strength : 1;
          const radius = max * 0.15 + max * 0.45 * phase;
          ctx.strokeStyle = hexToRgba(palette[0], strength * energy * (1 - phase) * 0.55);
          ctx.lineWidth = Math.max(1, (8 * (1 - phase) + 1) * unit);
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, TAU);
          ctx.stroke();
          ctx.strokeStyle = hexToRgba(palette[1], strength * energy * (1 - phase) * 0.3);
          ctx.lineWidth = Math.max(0.6, 2 * unit);
          ctx.beginPath();
          ctx.arc(cx, cy, radius * 0.82, 0, TAU);
          ctx.stroke();
          break;
        }
        case 'energy-aura': {
          const auraHit = transientEnvelope(transients, time, 0.5);
          const auraPulse = transients
            ? auraHit.active
              ? auraHit.strength * (1 - auraHit.age / 0.5)
              : 0
            : pulse;
          const radius = min * (0.3 + auraPulse * 0.08);
          const gradient = ctx.createRadialGradient(cx, cy, min * 0.06, cx, cy, radius);
          gradient.addColorStop(0, hexToRgba(palette[1], strength * 0.32));
          gradient.addColorStop(0.55, hexToRgba(palette[0], strength * 0.18));
          gradient.addColorStop(1, hexToRgba(palette[0], 0));
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, width, height);
          break;
        }
        case 'halftone': {
          const spacing = Math.max(5, Math.round(min / 90));
          const radius = spacing * 0.24 * (0.7 + pulse * 0.3);
          ctx.globalCompositeOperation = 'overlay';
          ctx.fillStyle = hexToRgba(palette[0], strength * 0.3);
          const drift = (time * 6) % spacing;
          for (let y = -spacing; y < height + spacing; y += spacing) {
            for (let x = -spacing; x < width + spacing; x += spacing) {
              const offset = Math.round(y / spacing) % 2 === 0 ? spacing / 2 : 0;
              ctx.beginPath();
              ctx.arc(x + offset + drift, y, radius, 0, TAU);
              ctx.fill();
            }
          }
          break;
        }
        case 'comic-burst': {
          ctx.globalCompositeOperation = 'lighter';
          const burstHit = transientEnvelope(transients, time, 0.55);
          const burstPulse = transients
            ? burstHit.active
              ? burstHit.strength * (1 - burstHit.age / 0.55)
              : 0
            : pulse;
          const wedges = 26;
          const reach = max * (0.5 + burstPulse * 0.08);
          for (let i = 0; i < wedges; i += 1) {
            if (i % 2) continue;
            const start = (i / wedges) * TAU + time * 0.03;
            const end = ((i + 0.65) / wedges) * TAU + time * 0.03;
            ctx.fillStyle = hexToRgba(
              i % 4 === 0 ? palette[1] : palette[0],
              strength * 0.1 * (0.25 + burstPulse * 0.75),
            );
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, reach, start, end);
            ctx.closePath();
            ctx.fill();
          }
          break;
        }
        case 'neon-orbit': {
          ctx.globalCompositeOperation = 'lighter';
          const orbits = 3;
          for (let orbit = 0; orbit < orbits; orbit += 1) {
            const radius = min * (0.16 + orbit * 0.07);
            const speed = (0.5 + orbit * 0.22) * (orbit % 2 ? -1 : 1);
            const dots = 3 + orbit;
            for (let i = 0; i < dots; i += 1) {
              const angle = time * speed + (i / dots) * TAU + hash(orbit + i) * 0.8;
              const x = cx + Math.cos(angle) * radius;
              const y = cy + Math.sin(angle) * radius * 0.82;
              const halo = ctx.createRadialGradient(x, y, 0, x, y, 18 * unit);
              halo.addColorStop(0, hexToRgba(palette[i % 2], strength * 0.85));
              halo.addColorStop(1, hexToRgba(palette[i % 2], 0));
              ctx.fillStyle = halo;
              ctx.beginPath();
              ctx.arc(x, y, 18 * unit, 0, TAU);
              ctx.fill();
              ctx.fillStyle = hexToRgba('#ffffff', strength * 0.8);
              ctx.beginPath();
              ctx.arc(x, y, Math.max(1, 2.4 * unit), 0, TAU);
              ctx.fill();
            }
            ctx.strokeStyle = hexToRgba(palette[orbit % 2], strength * 0.12);
            ctx.lineWidth = Math.max(0.5, 1.2 * unit);
            ctx.beginPath();
            ctx.ellipse(cx, cy, radius, radius * 0.82, 0, 0, TAU);
            ctx.stroke();
          }
          break;
        }
        case 'rain': {
          ctx.globalCompositeOperation = 'screen';
          ctx.lineCap = 'round';
          const drops = 90;
          for (let i = 0; i < drops; i += 1) {
            const x = hash(i) * width;
            const speed = 0.9 + hash(i + 4) * 1.2;
            const y = ((hash(i + 8) * height + time * height * speed * 0.8) % (height * 1.1)) - height * 0.05;
            const length = height * (0.03 + hash(i + 12) * 0.05);
            ctx.strokeStyle = hexToRgba(i % 5 === 0 ? palette[1] : palette[0], strength * 0.35);
            ctx.lineWidth = Math.max(0.5, (0.8 + hash(i + 16) * 1.6) * unit);
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + length * 0.18, y + length);
            ctx.stroke();
          }
          break;
        }
        case 'snow': {
          ctx.globalCompositeOperation = 'lighter';
          const flakes = 70;
          for (let i = 0; i < flakes; i += 1) {
            const speed = 0.12 + hash(i + 3) * 0.22;
            const x =
              hash(i) * width +
              Math.sin(time * 0.7 + hash(i + 9) * TAU) * width * 0.02;
            const y = ((hash(i + 6) * height + time * height * speed) % (height * 1.05)) - height * 0.02;
            const radius = Math.max(0.8, (1 + hash(i + 13) * 2.6) * unit);
            ctx.fillStyle = hexToRgba(i % 6 === 0 ? palette[1] : palette[0], strength * 0.5);
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, TAU);
            ctx.fill();
          }
          break;
        }
        case 'embers': {
          ctx.globalCompositeOperation = 'lighter';
          const flecks = 64;
          for (let i = 0; i < flecks; i += 1) {
            const speed = 0.16 + hash(i + 2) * 0.3;
            const x =
              hash(i) * width +
              Math.sin(time * 1.3 + hash(i + 7) * TAU) * width * 0.035;
            const y = height * 1.02 - ((hash(i + 5) * height + time * height * speed) % (height * 1.1));
            const flicker = 0.45 + 0.55 * Math.abs(Math.sin(time * 5 + hash(i + 11) * TAU));
            const radius = Math.max(0.6, (1 + hash(i + 15) * 2.2) * unit);
            ctx.fillStyle = hexToRgba(i % 3 === 0 ? palette[1] : palette[0], strength * flicker * 0.75);
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, TAU);
            ctx.fill();
          }
          break;
        }
        case 'light-leak': {
          const travel = (Math.sin(time * 0.35) + 1) / 2;
          const x0 = -width * 0.2 + travel * width * 1.1;
          const gradient = ctx.createLinearGradient(x0, 0, x0 + width * 0.55, height);
          gradient.addColorStop(0, hexToRgba(palette[0], 0));
          gradient.addColorStop(0.45, hexToRgba(palette[0], strength * 0.3));
          gradient.addColorStop(0.7, hexToRgba(palette[1], strength * 0.2));
          gradient.addColorStop(1, hexToRgba(palette[1], 0));
          ctx.globalCompositeOperation = 'screen';
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, width, height);
          break;
        }
        case 'chromatic-split': {
          const offset = Math.max(1, (2 + pulse * 6) * unit);
          ctx.globalCompositeOperation = 'screen';
          ctx.globalAlpha = strength * 0.28;
          ctx.drawImage(layer, -offset, 0, width, height);
          ctx.drawImage(layer, offset, 0, width, height);
          ctx.globalAlpha = 1;
          break;
        }
        case 'afterimage': {
          const scale = 1.02 + pulse * 0.015;
          const w = width * scale;
          const h = height * scale;
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = strength * 0.22;
          ctx.drawImage(layer, cx - w / 2, cy - h / 2, w, h);
          ctx.globalAlpha = 1;
          break;
        }
        case 'lens-flare': {
          ctx.globalCompositeOperation = 'lighter';
          const y = height * 0.4;
          const streak = ctx.createLinearGradient(0, y, width, y);
          streak.addColorStop(0, hexToRgba(palette[1], 0));
          streak.addColorStop(0.35, hexToRgba(palette[1], strength * 0.22));
          streak.addColorStop(0.5, hexToRgba(palette[0], strength * 0.55));
          streak.addColorStop(0.65, hexToRgba(palette[1], strength * 0.22));
          streak.addColorStop(1, hexToRgba(palette[1], 0));
          ctx.fillStyle = streak;
          ctx.fillRect(0, y - 3 * unit, width, 6 * unit);

          const x = width * (0.3 + 0.4 * ((Math.sin(time * 0.4) + 1) / 2));
          const core = ctx.createRadialGradient(x, y, 0, x, y, min * 0.22);
          core.addColorStop(0, hexToRgba('#ffffff', strength * 0.6));
          core.addColorStop(0.25, hexToRgba(palette[0], strength * 0.35));
          core.addColorStop(1, hexToRgba(palette[1], 0));
          ctx.fillStyle = core;
          ctx.fillRect(0, 0, width, height);
          break;
        }
        case 'scan-glitch': {
          const slices = 7;
          ctx.globalAlpha = strength * 0.9;
          for (let i = 0; i < slices; i += 1) {
            const seed = i + Math.floor(time * 12);
            const y = hash(seed) * height;
            const sliceHeight = Math.max(2, hash(seed + 3) * height * 0.05);
            const dx = (hash(seed + 7) - 0.5) * width * 0.05;
            ctx.drawImage(layer, 0, y, width, sliceHeight, dx, y, width, sliceHeight);
          }
          ctx.globalAlpha = 1;
          break;
        }
        case 'stardust': {
          ctx.globalCompositeOperation = 'lighter';
          const motes = 80;
          for (let i = 0; i < motes; i += 1) {
            const x = hash(i) * width;
            const y = hash(i + 5) * height;
            const twinkle = 0.35 + 0.65 * Math.abs(Math.sin(time * 1.8 + hash(i + 9) * TAU));
            const radius = Math.max(0.5, (0.8 + hash(i + 13) * 1.8) * unit);
            ctx.fillStyle = hexToRgba(i % 4 === 0 ? palette[1] : palette[0], strength * twinkle * 0.6);
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, TAU);
            ctx.fill();
          }
          break;
        }
      }
    } finally {
      ctx.restore();
    }
  }
}
