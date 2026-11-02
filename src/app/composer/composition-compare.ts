import type { CompositionPass } from './composition-core.service';

/** Flattened, display-ready view of one pass for side-by-side comparison. */
export interface PassCard {
  id: string;
  title: string;
  variation: string;
  bpm: number;
  keyLabel: string;
  bars: number;
  duration: string;
  parts: string;
  partCount: number;
  form: string;
  brief: string;
  energy: number;
  darkness: number;
  complexity: number;
}

export interface PassComparison {
  a: PassCard;
  b: PassCard;
  /** Differences of B relative to A, ready for a single readable line. */
  delta: string[];
}

const formatDuration = (seconds: number): string => {
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
};

const signed = (value: number, suffix: string): string =>
  `${value > 0 ? '+' : ''}${value}${suffix}`;

const clampText = (text: string, limit: number): string =>
  text.length > limit ? `${text.slice(0, limit - 1)}…` : text;

export function passToCard(pass: CompositionPass): PassCard {
  const composition = pass.composition;
  const sounding = composition.parts.filter((part) => !part.reference);
  const form = composition.sections
    .map((section) => `${section.label} ${section.bars}`)
    .join(' · ');
  return {
    id: pass.id,
    title: composition.title,
    variation: composition.variation,
    bpm: composition.bpm,
    keyLabel: composition.keyLabel,
    bars: composition.totalBars,
    duration: formatDuration(composition.durationSeconds),
    parts: sounding.map((part) => part.name).join(', ') || '—',
    partCount: sounding.length,
    form: form || '—',
    brief: pass.brief.trim() ? clampText(pass.brief.trim(), 140) : '—',
    energy: Math.round(composition.energy * 100),
    darkness: Math.round(composition.darkness * 100),
    complexity: Math.round(composition.complexity * 100),
  };
}

/**
 * Compares B against A. This is deliberately descriptive: it names what moved
 * rather than declaring which reading is better.
 */
export function comparePasses(a: CompositionPass, b: CompositionPass): PassComparison {
  const cardA = passToCard(a);
  const cardB = passToCard(b);
  const delta: string[] = [];

  if (a.composition.id === b.composition.id && a.brief === b.brief) {
    return { a: cardA, b: cardB, delta: ['identical reading'] };
  }

  if (cardB.bpm !== cardA.bpm) delta.push(`tempo ${signed(cardB.bpm - cardA.bpm, ' BPM')}`);
  if (cardB.bars !== cardA.bars) delta.push(`${signed(cardB.bars - cardA.bars, ' bars')}`);
  if (cardB.keyLabel !== cardA.keyLabel) delta.push(`key ${cardA.keyLabel} → ${cardB.keyLabel}`);
  if (cardB.partCount !== cardA.partCount) {
    delta.push(`${signed(cardB.partCount - cardA.partCount, ' parts')}`);
  }

  const energy = cardB.energy - cardA.energy;
  if (energy) delta.push(`energy ${signed(energy, '%')}`);
  const darkness = cardB.darkness - cardA.darkness;
  if (darkness) delta.push(`darkness ${signed(darkness, '%')}`);
  const complexity = cardB.complexity - cardA.complexity;
  if (complexity) delta.push(`complexity ${signed(complexity, '%')}`);

  if (cardB.variation !== cardA.variation) {
    delta.push(`${cardA.variation} → ${cardB.variation}`);
  }
  if ((a.brief ?? '').trim() !== (b.brief ?? '').trim()) delta.push('different brief');

  return { a: cardA, b: cardB, delta: delta.length ? delta : ['same shape and direction'] };
}
