/**
 * Creative brief parsing for the Composition Core.
 *
 * A brief steers a pass without breaking the genre lock: it can ask for
 * darkness, energy, complexity, tempo, key, length and reference direction.
 * It can never change the genre — that comes from the committed artist profile.
 *
 * Parsing is deterministic and offline, so the same brief always produces the
 * same steering values and the generation seed still owns the notes.
 */

export interface CompositionBrief {
  raw: string;
  /** Explicit tempo ask, clamped to the engine's supported range. */
  bpm?: number;
  /** Explicit key ask, e.g. "F# minor". */
  keyLabel?: string;
  /** Bars for a step or loop pass. */
  bars?: number;
  energy?: number;
  complexity?: number;
  darkness?: number;
  /** Human-readable mood words the brief actually used. */
  moods: string[];
  /** Artists or records named as direction — never copied. */
  references: string[];
}

const ENERGY_HIGH =
  /\b(?:high[- ]energy|energetic|aggressive|hard|banger|festival|club|driving|pounding|intense|hype|mosh|turn(?:ed)? up)\b/;
const ENERGY_LOW =
  /\b(?:chill|mellow|laid[- ]back|relaxed|soft|ambient|downtempo|sleepy|intimate|quiet|gentle)\b/;
const DARK =
  /\b(?:dark|darker|moody|melancholic|sad|haunting|ominous|gritty|brooding|sinister|noir)\b/;
const BRIGHT =
  /\b(?:bright|brighter|uplifting|happy|sunny|warm|joyful|euphoric|hopeful|feel[- ]good)\b/;
const COMPLEX =
  /\b(?:complex|intricate|jazzy|technical|busy|dense|progressive|layered)\b/;
const MINIMAL =
  /\b(?:simple|minimal|sparse|stripped|bare|repetitive)\b/;

const REFERENCE_PATTERN =
  /(?:sounds? like|in the vein of|inspired by|reminiscent of|similar to|a la|à la)\s+([^,.;\n]{2,60})/gi;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

function parseBpm(text: string): number | undefined {
  const match =
    text.match(/\b(\d{2,3})\s*(?:bpm|beats per minute)\b/i) ??
    text.match(/\bat\s+(\d{2,3})\b/i);
  if (!match) return undefined;
  const bpm = Number(match[1]);
  return Number.isFinite(bpm) && bpm >= 40 && bpm <= 220 ? Math.round(bpm) : undefined;
}

function parseKey(text: string): string | undefined {
  const match =
    text.match(/\b(?:in|key of)\s+([A-G](?:#|b)?)\s*(major|minor|maj|min)\b/i) ??
    text.match(/\b([A-G](?:#|b)?)\s+(major|minor)\b/i);
  if (!match) return undefined;
  const root = match[1].charAt(0).toUpperCase() + match[1].slice(1);
  const mode = /^maj/i.test(match[2]) ? 'major' : 'minor';
  return `${root} ${mode}`;
}

function parseBars(text: string): number | undefined {
  const match = text.match(/\b(\d{1,2})[-\s]?bars?\b/i);
  if (!match) return undefined;
  const bars = Number(match[1]);
  return Number.isFinite(bars) ? Math.round(clamp(bars, 2, 64)) : undefined;
}

function parseReferences(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(REFERENCE_PATTERN)) {
    const candidate = match[1]
      .replace(/\s+at\s+\d+\s*(?:bpm)?$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (candidate.length < 2) continue;
    if (found.some((entry) => entry.toLowerCase() === candidate.toLowerCase())) continue;
    found.push(candidate);
    if (found.length === 3) break;
  }
  return found;
}

/**
 * Reads a free-text brief. Every field is optional, so an empty or purely
 * conversational brief leaves the current dials untouched.
 */
export function parseCompositionBrief(raw: string): CompositionBrief {
  const text = (raw ?? '').trim();
  const lower = text.toLowerCase();
  const brief: CompositionBrief = { raw: text, moods: [], references: [] };

  if (!text) return brief;

  const bpm = parseBpm(text);
  if (bpm !== undefined) brief.bpm = bpm;
  const keyLabel = parseKey(text);
  if (keyLabel) brief.keyLabel = keyLabel;
  const bars = parseBars(text);
  if (bars !== undefined) brief.bars = bars;

  if (ENERGY_HIGH.test(lower)) {
    brief.energy = 0.88;
    brief.moods.push('high energy');
  } else if (ENERGY_LOW.test(lower)) {
    brief.energy = 0.3;
    brief.moods.push('laid back');
  }

  if (DARK.test(lower)) {
    brief.darkness = 0.82;
    brief.moods.push('dark');
  } else if (BRIGHT.test(lower)) {
    brief.darkness = 0.22;
    brief.moods.push('bright');
  }

  if (COMPLEX.test(lower)) {
    brief.complexity = 0.84;
    brief.moods.push('intricate');
  } else if (MINIMAL.test(lower)) {
    brief.complexity = 0.26;
    brief.moods.push('minimal');
  }

  brief.references = parseReferences(text);
  return brief;
}

/** Compact chips for the UI and spoken confirmations. */
export function briefSummary(brief: CompositionBrief): string[] {
  const chips: string[] = [];
  if (brief.darkness !== undefined) {
    chips.push(brief.darkness > 0.5 ? 'dark' : 'bright');
  }
  if (brief.energy !== undefined) {
    chips.push(brief.energy > 0.5 ? 'high energy' : 'laid back');
  }
  if (brief.complexity !== undefined) {
    chips.push(brief.complexity > 0.5 ? 'intricate' : 'minimal');
  }
  if (brief.bpm !== undefined) chips.push(`${brief.bpm} BPM`);
  if (brief.keyLabel) chips.push(brief.keyLabel);
  if (brief.bars !== undefined) chips.push(`${brief.bars} bars`);
  for (const reference of brief.references) chips.push(`ref: ${reference}`);
  return chips;
}

/** Rationale lines appended to the score so the steering is auditable. */
export function briefRationale(brief: CompositionBrief): string[] {
  if (!brief.raw) return [];
  const chips = briefSummary(brief);
  // Nothing recognized means nothing was steered — do not claim otherwise.
  if (!chips.length) return [];
  const lines = [
    `Brief: “${brief.raw.slice(0, 160)}”${chips.length ? ` → ${chips.join(', ')}` : ''}.`,
  ];
  if (brief.references.length) {
    lines.push(
      `Reference direction: ${brief.references.join(', ')}. Used as a compass only — the writing stays original and genre-locked.`
    );
  }
  return lines;
}
