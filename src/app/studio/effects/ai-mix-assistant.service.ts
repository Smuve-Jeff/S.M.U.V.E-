import { Injectable, inject, signal, computed } from '@angular/core';
import {
  MusicManagerService,
  TrackModel,
} from '../../services/music-manager.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { IdeasGeneratorService } from '../../services/ideas-generator.service';
import {
  StudioActionResult,
  StudioActionTarget,
} from '../../types/studio-orchestration.types';

export type MixSuggestionStatus =
  | 'pending'
  | 'previewed'
  | 'approved'
  | 'rejected'
  | 'applied'
  | 'replaced'
  | 'exported';

export interface MixSuggestion {
  id: string;
  type:
    | 'eq'
    | 'compression'
    | 'reverb'
    | 'level'
    | 'pan'
    | 'saturation'
    | 'width';
  trackId: string;
  label: string;
  description: string;
  severity: 'critical' | 'recommended' | 'optional';
  action: () => void;
  reason?: string;
  status?: MixSuggestionStatus;
  previewText?: string;
  target?: StudioActionTarget;
  outcomes?: Partial<
    Record<
      | 'preview'
      | 'apply'
      | 'reject'
      | 'approve'
      | 'replace'
      | 'transition'
      | 'export',
      string
    >
  >;
  parameter: string;
  currentValue: number;
  suggestedValue: number;
}

export interface TrackAnalysis {
  trackId: string;
  trackName: string;
  instrumentType: string;
  estimatedLoudness: number; // dBFS
  estimatedDynamicRange: number; // dB
  frequencyProfile: 'dark' | 'warm' | 'balanced' | 'bright' | 'harsh';
  stereoWidth: 'mono' | 'narrow' | 'balanced' | 'wide';
  transientContent: 'low' | 'moderate' | 'high';
  harmonicComplexity: 'simple' | 'moderate' | 'complex';
  suggestedRole: string;
}

/** A genre-specific mastering preset with targets and processing hints. */
export interface GenreMasteringPreset {
  genre: string;
  emoji: string;
  targetLufs: number;
  safeCeiling: number;
  compThreshold: number;
  compRatio: number;
  limiterThreshold: number;
  limiterRatio: number;
  eqSub: number; // Low-shelf gain (dB) at ~60 Hz
  eqHighShelf: number; // High-shelf gain (dB) at ~10 kHz
  eqLowMid: number; // Low-mid cut/boost (dB) at ~300 Hz
  description: string;
  tags: string[];
}

@Injectable({
  providedIn: 'root',
})
export class AiMixAssistantService {
  private readonly musicManager = inject(MusicManagerService);
  private readonly engine = inject(AudioEngineService);
  private readonly ideas = inject(IdeasGeneratorService);

  /** Live track analyses (updated on track change) */
  analyses = signal<TrackAnalysis[]>([]);
  /** Currently active suggestions */
  suggestions = signal<MixSuggestion[]>([]);
  /** Whether the assistant is actively monitoring */
  isMonitoring = signal(false);
  /** Last analysis timestamp */
  lastAnalyzed = signal<number>(0);
  previewedSuggestionId = signal<string | null>(null);
  lastSuggestionOutcome = signal<string | null>(null);

  /** Overall mix quality score 0-100 based on all tracks */
  mixQualityScore = computed(() => {
    const sug = this.suggestions();
    if (sug.length === 0) return 85;
    const criticals = sug.filter((s) => s.severity === 'critical').length;
    const recs = sug.filter((s) => s.severity === 'recommended').length;
    return Math.max(0, Math.min(100, 85 - criticals * 15 - recs * 5));
  });

  /** Summary string for the mix quality badge */
  mixQualityLabel = computed(() => {
    const score = this.mixQualityScore();
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Needs Work';
    return 'Critical';
  });

  constructor() {}

  /**
   * Phase 4: Analyze frequency spectrum data from an AnalyserNode
   * and identify masking conflicts between tracks.
   * Returns per-band energy and masking warnings.
   */
  analyzeFrequencySpectrum(
    frequencyData: Uint8Array,
    sampleRate: number
  ): {
    bands: Array<{
      name: string;
      lowHz: number;
      highHz: number;
      energy: number;
    }>;
    dominantBand: string;
    harmonicDensity: number;
  } {
    const fftSize = frequencyData.length * 2;
    const binWidth = sampleRate / fftSize;

    // Define critical bands (sub, bass, low-mid, mid, high-mid, presence, air)
    const bands = [
      { name: 'Sub', lowHz: 20, highHz: 60, energy: 0 },
      { name: 'Bass', lowHz: 60, highHz: 250, energy: 0 },
      { name: 'Low-Mid', lowHz: 250, highHz: 500, energy: 0 },
      { name: 'Mid', lowHz: 500, highHz: 2000, energy: 0 },
      { name: 'High-Mid', lowHz: 2000, highHz: 6000, energy: 0 },
      { name: 'Presence', lowHz: 6000, highHz: 10000, energy: 0 },
      { name: 'Air', lowHz: 10000, highHz: 20000, energy: 0 },
    ];

    // Sum energy in each band
    for (const band of bands) {
      const lowBin = Math.floor(band.lowHz / binWidth);
      const highBin = Math.min(
        Math.floor(band.highHz / binWidth),
        frequencyData.length - 1
      );
      let sum = 0;
      for (let i = lowBin; i <= highBin; i++) {
        sum += frequencyData[i];
      }
      band.energy = sum / Math.max(1, highBin - lowBin + 1);
    }

    // Find dominant band
    let maxEnergy = 0;
    let dominantBand = 'Mid';
    let totalEnergy = 0;
    for (const band of bands) {
      totalEnergy += band.energy;
      if (band.energy > maxEnergy) {
        maxEnergy = band.energy;
        dominantBand = band.name;
      }
    }

    // Harmonic density: ratio of high-frequency energy to total
    const highEnergy = bands.slice(4).reduce((s, b) => s + b.energy, 0);
    const harmonicDensity = totalEnergy > 0 ? highEnergy / totalEnergy : 0.5;

    return { bands, dominantBand, harmonicDensity };
  }

  /**
   * Detect frequency masking conflicts between multiple tracks.
   * Returns a list of conflicting track pairs with the conflicting band.
   */
  detectMaskingConflicts(
    trackSpectra: Array<{
      trackId: string;
      trackName: string;
      bands: Array<{ name: string; energy: number }>;
    }>
  ): Array<{
    trackA: string;
    trackB: string;
    band: string;
    severity: 'high' | 'medium' | 'low';
  }> {
    const conflicts: Array<{
      trackA: string;
      trackB: string;
      band: string;
      severity: 'high' | 'medium' | 'low';
    }> = [];

    for (let i = 0; i < trackSpectra.length; i++) {
      for (let j = i + 1; j < trackSpectra.length; j++) {
        const a = trackSpectra[i];
        const b = trackSpectra[j];

        for (let bi = 0; bi < a.bands.length; bi++) {
          const aEnergy = a.bands[bi].energy;
          const bEnergy = b.bands[bi].energy;

          // Both tracks have significant energy in the same band
          if (aEnergy > 40 && bEnergy > 40) {
            const ratio =
              Math.min(aEnergy, bEnergy) / Math.max(aEnergy, bEnergy);
            if (ratio > 0.5) {
              // Strong conflict: both have similar energy
              conflicts.push({
                trackA: a.trackName || a.trackId,
                trackB: b.trackName || b.trackId,
                band: a.bands[bi].name,
                severity: ratio > 0.8 ? 'high' : 'medium',
              });
            }
          }
        }
      }
    }

    return conflicts;
  }

  /**
   * Generate specific EQ carving recommendations to resolve masking conflicts.
   */
  recommendEQ(
    conflicts: Array<{
      trackA: string;
      trackB: string;
      band: string;
      severity: string;
    }>
  ): Array<{
    trackId: string;
    band: string;
    action: 'cut' | 'boost';
    amountDb: number;
    frequencyHz: number;
    q: number;
    reason: string;
  }> {
    const bandParams: Record<string, { freqHz: number; q: number }> = {
      Sub: { freqHz: 50, q: 0.7 },
      Bass: { freqHz: 120, q: 0.7 },
      'Low-Mid': { freqHz: 350, q: 1.0 },
      Mid: { freqHz: 1000, q: 1.0 },
      'High-Mid': { freqHz: 4000, q: 1.0 },
      Presence: { freqHz: 8000, q: 1.5 },
      Air: { freqHz: 14000, q: 2.0 },
    };

    return conflicts.map((c) => {
      const bp = bandParams[c.band] || { freqHz: 1000, q: 1.0 };
      return {
        trackId: c.trackB,
        band: c.band,
        action: 'cut' as const,
        amountDb: c.severity === 'high' ? -4 : -2,
        frequencyHz: bp.freqHz,
        q: bp.q,
        reason: `Masking conflict with ${c.trackA} in ${c.band} band — cut to create separation`,
      };
    });
  }

  // ── Genre mastering presets ──────────────────────────────────────

  /**
   * Genre-specific mastering presets for trap, house, lo-fi, and more.
   * Each preset tailors LUFS target, multiband EQ curves, compressor,
   * and limiter behavior for the genre's sonic signature.
   */
  readonly genrePresets: GenreMasteringPreset[] = [
    {
      genre: 'trap',
      emoji: '🔥',
      targetLufs: -10,
      safeCeiling: -0.3,
      compThreshold: -8,
      compRatio: 6,
      limiterThreshold: -0.5,
      limiterRatio: 20,
      eqSub: 3.0,
      eqHighShelf: 2.5,
      eqLowMid: -1.5,
      description:
        'Aggressive sub-bass with crisp hi-hats · hard brick-wall limiting for competitive loudness',
      tags: ['trap', 'drill', 'phonk', 'bass-music', '808'],
    },
    {
      genre: 'house',
      emoji: '🎵',
      targetLufs: -12,
      safeCeiling: -0.8,
      compThreshold: -10,
      compRatio: 4,
      limiterThreshold: -1.2,
      limiterRatio: 10,
      eqSub: 1.5,
      eqHighShelf: 1.8,
      eqLowMid: 0,
      description:
        'Punchy kick · warm low-mids · smooth highs with subtle air · streaming-optimized headroom',
      tags: ['house', 'deep-house', 'tech-house', 'progressive', 'edm'],
    },
    {
      genre: 'lo-fi',
      emoji: '☕',
      targetLufs: -16,
      safeCeiling: -1.5,
      compThreshold: -14,
      compRatio: 2.2,
      limiterThreshold: -2.0,
      limiterRatio: 5,
      eqSub: -0.5,
      eqHighShelf: -2.0,
      eqLowMid: 1.5,
      description:
        'Warm, rolled-off highs · gentle compression · wide dynamic range with soft ceiling',
      tags: ['lo-fi', 'chill', 'jazz-hop', 'ambient', 'study'],
    },
    {
      genre: 'pop',
      emoji: '⭐',
      targetLufs: -13,
      safeCeiling: -0.8,
      compThreshold: -9,
      compRatio: 3.5,
      limiterThreshold: -1.0,
      limiterRatio: 12,
      eqSub: 0.5,
      eqHighShelf: 1.5,
      eqLowMid: 0,
      description:
        'Vocal-forward clarity · balanced lows and highs · streaming-standard loudness',
      tags: ['pop', 'rnb', 'top-40', 'radio'],
    },
    {
      genre: 'dubstep',
      emoji: '💥',
      targetLufs: -9,
      safeCeiling: -0.3,
      compThreshold: -6,
      compRatio: 8,
      limiterThreshold: -0.5,
      limiterRatio: 30,
      eqSub: 4.0,
      eqHighShelf: 3.0,
      eqLowMid: -3.0,
      description:
        'Massive sub-bass with aggressive mid-range scream · hard brick-wall limiting for maximum impact',
      tags: ['dubstep', 'brostep', 'riddim', 'heavy-bass', 'wonky'],
    },
    {
      genre: 'reggaeton',
      emoji: '🎶',
      targetLufs: -11,
      safeCeiling: -0.6,
      compThreshold: -9,
      compRatio: 4.5,
      limiterThreshold: -1.0,
      limiterRatio: 14,
      eqSub: 2.0,
      eqHighShelf: 1.2,
      eqLowMid: -0.5,
      description:
        'Punchy dembow rhythm · warm low-end · clear vocal mids with controlled highs',
      tags: ['reggaeton', 'latin', 'dembow', 'urban-latin', 'latin-trap'],
    },
    {
      genre: 'ambient',
      emoji: '🌌',
      targetLufs: -20,
      safeCeiling: -2.0,
      compThreshold: -18,
      compRatio: 1.8,
      limiterThreshold: -3.0,
      limiterRatio: 4,
      eqSub: -1.0,
      eqHighShelf: -1.5,
      eqLowMid: 0,
      description:
        'Wide dynamic range · gentle compression · soft highs for ethereal soundscapes',
      tags: ['ambient', 'drone', 'soundscape', 'meditation', 'cinematic'],
    },
    {
      genre: 'jazz',
      emoji: '🎷',
      targetLufs: -18,
      safeCeiling: -1.5,
      compThreshold: -14,
      compRatio: 2.0,
      limiterThreshold: -2.5,
      limiterRatio: 6,
      eqSub: -1.5,
      eqHighShelf: -0.5,
      eqLowMid: 1.0,
      description:
        'Natural dynamics · warm mid-range with gentle low-mid emphasis · transparent limiting for acoustic clarity',
      tags: ['jazz', 'acoustic', 'live', 'swing', 'bebop'],
    },
    {
      genre: 'rnb',
      emoji: '🎸',
      targetLufs: -12,
      safeCeiling: -0.8,
      compThreshold: -8,
      compRatio: 3.0,
      limiterThreshold: -1.2,
      limiterRatio: 10,
      eqSub: 1.0,
      eqHighShelf: 2.0,
      eqLowMid: -0.3,
      description:
        'Smooth vocal-forward mix · warm low-end with silky highs · streaming-optimized with punchy drums',
      tags: ['rnb', 'soul', 'neo-soul', 'contemporary', 'urban'],
    },
  ];

  /**
   * Detect the most likely genre from the current track list.
   * Analyzes instrument types, count, and patterns to guess trap, house, lo-fi, or pop.
   */
  detectGenre(): string {
    const tracks = this.musicManager.tracks();
    const types = tracks.map((t) => this.inferInstrumentType(t));
    const names = tracks.map((t) => (t.name || '').toLowerCase());

    // Trap: 808 bass + hi-hats + fast hi-hat patterns
    const has808 = names.some((n) => n.includes('808') || n.includes('trap'));
    const hasHihat = types.some((t) => t === 'percussion');
    const hasHeavySub = types.some((t) => t === 'bass');
    const drumCount = types.filter((t) =>
      ['kick', 'snare', 'drums', 'percussion'].includes(t)
    ).length;

    // Lo-fi: mellow drums + piano/chords + vinyl crackle
    const hasPiano = types.some((t) => t === 'chords');
    const hasVinyl = names.some(
      (n) => n.includes('vinyl') || n.includes('crackle') || n.includes('lo-fi')
    );
    const isSparse = tracks.length <= 4;
    const noHeavy808 = !names.some((n) => n.includes('808'));

    // House: four-on-the-floor kick + synth stabs/pads
    const hasSynthPad = types.some((t) => t === 'synth' || t === 'pad');
    const hasKickAndSynth = types.some((t) => t === 'kick') && hasSynthPad;
    const moderateTrackCount = tracks.length >= 4 && tracks.length <= 10;

    // Weighted scoring
    let trapScore = 0;
    let houseScore = 0;
    let lofiScore = 0;
    let popScore = 0;

    // Dubstep: wubby bass + heavy drums + synth stabs
    const hasWub = names.some(
      (n) =>
        n.includes('wob') ||
        n.includes('wub') ||
        n.includes('growl') ||
        n.includes('dub')
    );
    const hasSynthLead = types.some((t) => t === 'lead');

    // Reggaeton: dembow drums + latin percussion
    const hasDembow = names.some(
      (n) => n.includes('dembow') || n.includes('regga') || n.includes('latin')
    );
    const hasPercussion = types.some((t) => t === 'percussion');

    // Ambient: sparse, pads, no drums
    const hasOnlyPads =
      types.length > 0 &&
      types.every(
        (t) => ['pad', 'texture', 'fx'].includes(t) || t === 'chords'
      );
    const noDrums = !types.some((t) =>
      ['kick', 'snare', 'drums', 'percussion'].includes(t)
    );

    // Jazz: acoustic instruments, piano/bass/drums
    const hasAcoustic = names.some(
      (n) =>
        n.includes('acoustic') ||
        n.includes('jazz') ||
        n.includes('swing') ||
        n.includes('brass')
    );
    const hasMelodic = types.some((t) => t === 'melodic');

    // R&B: vocals + bass + chords, moderate tempo feel

    if (has808) trapScore += 30;
    if (hasHihat && hasHeavySub) trapScore += 20;
    if (drumCount >= 3) trapScore += 10;
    if (names.some((n) => n.includes('hi-hat') || n.includes('hat')))
      trapScore += 15;

    if (hasKickAndSynth && moderateTrackCount) houseScore += 25;
    if (
      types.includes('kick') &&
      (types.includes('pad') || types.includes('synth'))
    )
      houseScore += 20;
    if (names.some((n) => n.includes('stab') || n.includes('pluck')))
      houseScore += 15;

    if (hasPiano && isSparse && noHeavy808) lofiScore += 25;
    if (hasVinyl) lofiScore += 30;
    if (types.includes('bass') && tracks.length <= 4) lofiScore += 10;

    if (tracks.length >= 3 && !has808 && !hasVinyl) popScore += 15;
    if (types.some((t) => t === 'vocal')) popScore += 10;

    // New genre scores
    let dubstepScore = 0;
    let reggaetonScore = 0;
    let ambientScore = 0;
    let jazzScore = 0;
    let rnbScore = 0;

    if (hasWub && hasSynthLead && drumCount >= 2) dubstepScore += 35;
    if (hasWub && hasHeavySub) dubstepScore += 25;
    if (hasSynthLead && hasSynthPad) dubstepScore += 15;

    if (hasDembow) reggaetonScore += 35;
    if (types.includes('kick') && hasPercussion && hasHeavySub)
      reggaetonScore += 25;

    if (hasOnlyPads && noDrums && isSparse) ambientScore += 40;
    if (noDrums && tracks.length <= 3) ambientScore += 20;

    if (hasAcoustic || hasMelodic) jazzScore += 30;
    if (
      (hasPiano || types.includes('chords')) &&
      (types.includes('bass') || hasHeavySub) &&
      types.includes('kick')
    )
      jazzScore += 20;
    if (isSparse && hasAcoustic) jazzScore += 15;

    if (
      types.some((t) => t === 'vocal') &&
      types.includes('bass') &&
      types.includes('chords')
    )
      rnbScore += 25;
    if (types.includes('vocal') && hasPiano && hasHeavySub) rnbScore += 20;

    const scores: Array<{ genre: string; score: number }> = [
      { genre: 'trap', score: trapScore },
      { genre: 'house', score: houseScore },
      { genre: 'lo-fi', score: lofiScore },
      { genre: 'pop', score: popScore },
      { genre: 'dubstep', score: dubstepScore },
      { genre: 'reggaeton', score: reggaetonScore },
      { genre: 'ambient', score: ambientScore },
      { genre: 'jazz', score: jazzScore },
      { genre: 'rnb', score: rnbScore },
    ];

    scores.sort((a, b) => b.score - a.score);
    return scores[0].score > 10 ? scores[0].genre : 'pop';
  }

  /**
   * Get the matching genre preset or fall back to density-based defaults.
   */
  getGenrePreset(genre?: string): GenreMasteringPreset | undefined {
    if (!genre) return undefined;
    const normalized = genre.toLowerCase().replace(/[^a-z-]/g, '');
    return this.genrePresets.find(
      (p) => p.genre === normalized || p.tags.includes(normalized)
    );
  }

  /**
   * Auto-balance mix levels based on genre conventions and track roles.
   * Returns suggested gain adjustments for each track.
   */
  autoBalanceLevels(
    tracks: Array<{
      id: string;
      name: string;
      role: string;
      currentGain: number;
    }>
  ): Array<{ trackId: string; suggestedGain: number; reason: string }> {
    // Target gain levels by role (relative to 0 dB)
    const roleTargets: Record<string, number> = {
      kick: -3,
      bass: -4,
      snare: -3,
      vocal: -1,
      lead: -2,
      chords: -5,
      pad: -7,
      fx: -8,
      percussion: -6,
      rhythm: -4,
      foundation: -4,
      focus: -1,
      harmony: -5,
      atmosphere: -7,
      texture: -7,
      support: -5,
      instrument: -5,
    };

    return tracks.map((t) => {
      const target = roleTargets[t.role] ?? -5;
      const currentDb = 20 * Math.log10(Math.max(t.currentGain, 0.001));
      const diff = target - currentDb;

      if (Math.abs(diff) < 1)
        return {
          trackId: t.id,
          suggestedGain: t.currentGain,
          reason: 'Already balanced',
        };

      const suggestedGain = Math.pow(10, target / 20);
      return {
        trackId: t.id,
        suggestedGain: Math.round(suggestedGain * 100) / 100,
        reason:
          diff > 0
            ? `${t.name}: boost ${Math.abs(diff).toFixed(1)} dB to match ${t.role} target`
            : `${t.name}: cut ${Math.abs(diff).toFixed(1)} dB to match ${t.role} target`,
      };
    });
  }

  /**
   * Analyze all tracks in the project and generate intelligent mix suggestions.
   */
  analyzeAll(): void {
    const tracks = this.musicManager.tracks();
    if (tracks.length === 0) return;

    const analyses: TrackAnalysis[] = [];
    const sug: MixSuggestion[] = [];

    tracks.forEach((track, idx) => {
      const analysis = this.analyzeTrack(track, idx, tracks.length);
      analyses.push(analysis);
      sug.push(...this.generateSuggestions(analysis, track));
    });

    // Add global mix suggestions
    sug.push(...this.getGlobalMixSuggestions(tracks));

    this.analyses.set(analyses);
    this.suggestions.set(sug);
    this.lastAnalyzed.set(Date.now());
    this.isMonitoring.set(true);
  }

  buildStudioActionResults(target: StudioActionTarget): StudioActionResult[] {
    const createdAt = this.lastAnalyzed() || Date.now();
    return this.suggestions().map((suggestion) => ({
      id: `mix_action_${suggestion.id}`,
      source: 'ai-mix',
      kind: 'mix-fix',
      title: suggestion.label,
      description: suggestion.description,
      reason: suggestion.reason ?? suggestion.description,
      preview:
        suggestion.previewText ??
        `${suggestion.parameter}: ${suggestion.currentValue} → ${suggestion.suggestedValue}`,
      status: this.mapStatus(suggestion.status),
      target:
        suggestion.target ??
        (suggestion.trackId === 'master'
          ? target
          : { ...target, selectedTrackId: suggestion.trackId }),
      payload: {
        suggestionId: suggestion.id,
        trackId: suggestion.trackId,
        parameter: suggestion.parameter,
        currentValue: suggestion.currentValue,
        suggestedValue: suggestion.suggestedValue,
      },
      outcomes: suggestion.outcomes ?? {
        preview: 'Preview the mix change.',
        apply: 'Apply the suggested fix.',
        reject: 'Reject the suggestion.',
        approve: 'Approve the fix for async review.',
        replace: 'Replace this suggestion with a custom adjustment.',
        transition: 'Promote the change into the next checkpoint.',
        export: 'Export the fix rationale.',
      },
      createdAt,
      updatedAt: Date.now(),
    }));
  }

  previewSuggestion(id: string): MixSuggestion | null {
    const suggestion = this.findSuggestion(id);
    if (!suggestion) return null;
    this.previewedSuggestionId.set(id);
    this.setSuggestionState(id, {
      status: 'previewed',
      previewText:
        suggestion.previewText ??
        `${suggestion.parameter}: ${suggestion.currentValue} → ${suggestion.suggestedValue}`,
    });
    this.lastSuggestionOutcome.set(`preview:${id}`);
    return this.findSuggestion(id);
  }

  applySuggestion(id: string): MixSuggestion | null {
    const suggestion = this.findSuggestion(id);
    if (!suggestion) return null;
    this.applySuggestionPatch(suggestion);
    this.setSuggestionState(id, { status: 'applied' });
    this.lastSuggestionOutcome.set(`apply:${id}`);
    return this.findSuggestion(id);
  }

  rejectSuggestion(id: string): MixSuggestion | null {
    this.setSuggestionState(id, { status: 'rejected' });
    this.lastSuggestionOutcome.set(`reject:${id}`);
    return this.findSuggestion(id);
  }

  approveSuggestion(id: string): MixSuggestion | null {
    this.setSuggestionState(id, { status: 'approved' });
    this.lastSuggestionOutcome.set(`approve:${id}`);
    return this.findSuggestion(id);
  }

  replaceSuggestion(
    id: string,
    replacement: Partial<
      Pick<MixSuggestion, 'label' | 'description' | 'reason' | 'suggestedValue'>
    >
  ): MixSuggestion | null {
    this.setSuggestionState(id, { ...replacement, status: 'replaced' });
    this.lastSuggestionOutcome.set(`replace:${id}`);
    return this.findSuggestion(id);
  }

  transitionSuggestion(id: string, previewText?: string): MixSuggestion | null {
    this.setSuggestionState(id, {
      status: 'previewed',
      previewText: previewText ?? this.findSuggestion(id)?.previewText,
    });
    this.lastSuggestionOutcome.set(`transition:${id}`);
    return this.findSuggestion(id);
  }

  exportSuggestion(id: string): MixSuggestion | null {
    this.setSuggestionState(id, { status: 'exported' });
    this.lastSuggestionOutcome.set(`export:${id}`);
    return this.findSuggestion(id);
  }

  /**
   * Analyze a single track based on its instrument type, position in mix, etc.
   */
  analyzeTrack(
    track: TrackModel,
    index: number,
    totalTracks: number
  ): TrackAnalysis {
    const instType = this.inferInstrumentType(track);
    const freqProfile = this.inferFrequencyProfile(instType, index);
    const stereoWidth = this.inferStereoWidth(instType);
    const transientContent = this.inferTransients(instType);
    const harmonicComplexity = this.inferHarmonics(instType);
    const suggestedRole = this.getSuggestedRole(instType, index, totalTracks);

    return {
      trackId: track.id,
      trackName: track.name || instType,
      instrumentType: instType,
      estimatedLoudness: -6 - index * 2 + Math.random() * 4,
      estimatedDynamicRange:
        instType === 'drums' ? 18 : instType === 'vocal' ? 14 : 10,
      frequencyProfile: freqProfile,
      stereoWidth: stereoWidth,
      transientContent: transientContent,
      harmonicComplexity: harmonicComplexity,
      suggestedRole: suggestedRole,
    };
  }

  private createSuggestion(
    suggestion: Omit<MixSuggestion, 'action'> & { action?: () => void }
  ): MixSuggestion {
    const next: MixSuggestion = {
      ...suggestion,
      reason: suggestion.reason ?? suggestion.description,
      status: suggestion.status ?? 'pending',
      previewText:
        suggestion.previewText ??
        `${suggestion.parameter}: ${suggestion.currentValue} → ${suggestion.suggestedValue}`,
      outcomes: suggestion.outcomes ?? {
        preview: 'Preview the suggested fix.',
        apply: 'Apply the suggested fix.',
        reject: 'Reject the suggested fix.',
        approve: 'Approve the fix for async collaboration.',
        replace: 'Replace the suggestion with a custom move.',
        transition: 'Transition the fix into the next checkpoint.',
        export: 'Export the rationale for this fix.',
      },
      action: () => {
        this.applySuggestion(suggestion.id);
      },
    };
    return next;
  }

  /**
   * Generate actionable mix suggestions from a track analysis.
   */
  private generateSuggestions(
    analysis: TrackAnalysis,
    track: TrackModel
  ): MixSuggestion[] {
    const result: MixSuggestion[] = [];
    const ti = track.id;

    // EQ suggestions based on frequency profile
    if (
      analysis.frequencyProfile === 'dark' ||
      analysis.frequencyProfile === 'warm'
    ) {
      result.push(
        this.createSuggestion({
          id: `eq-hi-${ti}`,
          type: 'eq',
          trackId: ti,
          label: 'Add High-End Presence',
          description: `${analysis.trackName} sounds dark — try a gentle high-shelf boost around 8-12 kHz to add air and clarity.`,
          severity: 'recommended',
          reason: `${analysis.trackName} is skewing dark in the current ${analysis.suggestedRole} role.`,
          parameter: 'eqHighShelf',
          currentValue: 0,
          suggestedValue: 3,
        })
      );
    }

    if (
      analysis.frequencyProfile === 'harsh' ||
      analysis.frequencyProfile === 'bright'
    ) {
      result.push(
        this.createSuggestion({
          id: `eq-lo-${ti}`,
          type: 'eq',
          trackId: ti,
          label: 'Tame High Frequencies',
          description: `${analysis.trackName} is bright — a gentle cut around 3-5 kHz can reduce listener fatigue.`,
          severity: 'recommended',
          reason: `${analysis.trackName} is occupying the harsh end of the spectrum.`,
          parameter: 'eqNotch',
          currentValue: 0,
          suggestedValue: -2,
        })
      );
    }

    // Stereo width suggestions
    if (
      analysis.stereoWidth === 'mono' &&
      this.isWideInstrument(analysis.instrumentType)
    ) {
      result.push(
        this.createSuggestion({
          id: `width-${ti}`,
          type: 'width',
          trackId: ti,
          label: 'Widen Stereo Image',
          description: `${analysis.trackName} sounds mono — apply stereo enhancement to fill the soundstage.`,
          severity: 'optional',
          reason: `${analysis.trackName} is a width-friendly source but is currently mono.`,
          parameter: 'stereoWidth',
          currentValue: 0,
          suggestedValue: 40,
        })
      );
    }

    // Dynamic range / compression suggestions
    if (
      analysis.transientContent === 'high' &&
      analysis.instrumentType !== 'drums'
    ) {
      result.push(
        this.createSuggestion({
          id: `comp-${ti}`,
          type: 'compression',
          trackId: ti,
          label: 'Apply Gentle Compression',
          description: `${analysis.trackName} has wide dynamics — a 2:1 ratio compressor smooths peaks while retaining punch.`,
          severity: 'optional',
          reason: `${analysis.trackName} has transient spikes that can be smoothed without flattening the part.`,
          parameter: 'compRatio',
          currentValue: 1,
          suggestedValue: 2,
        })
      );
    }

    // Reverb suggestions based on role
    if (
      analysis.suggestedRole === 'pad' ||
      analysis.suggestedRole === 'atmosphere'
    ) {
      result.push(
        this.createSuggestion({
          id: `verb-${ti}`,
          type: 'reverb',
          trackId: ti,
          label: 'Add Ambience',
          description: `${analysis.trackName} would benefit from a hall or plate reverb to create depth.`,
          severity: 'optional',
          reason: `${analysis.trackName} is serving a spacious support role in the mix.`,
          parameter: 'reverbMix',
          currentValue: 0,
          suggestedValue: 25,
        })
      );
    }

    // Level suggestions based on role priority
    const priorityMap: Record<string, number> = {
      kick: 0,
      snare: 1,
      bass: 2,
      vocal: 3,
      lead: 4,
      chords: 5,
      pad: 6,
      fx: 7,
      fill: 8,
    };
    const trackPriority = priorityMap[analysis.instrumentType] ?? 5;
    if (trackPriority > 5 && analysis.estimatedLoudness > -8) {
      result.push(
        this.createSuggestion({
          id: `level-${ti}`,
          type: 'level',
          trackId: ti,
          label: 'Reduce Level Slightly',
          description: `${analysis.trackName} may be too loud for its role — a 1-2 dB reduction can improve mix balance.`,
          severity: 'optional',
          reason: `${analysis.trackName} is louder than expected for its supporting role.`,
          parameter: 'gain',
          currentValue: 0,
          suggestedValue: -1.5,
        })
      );
    }

    return result;
  }

  /**
   * Generate mix-wide suggestions (balance, clarity, etc.)
   */
  private getGlobalMixSuggestions(tracks: TrackModel[]): MixSuggestion[] {
    const result: MixSuggestion[] = [];
    const count = tracks.length;

    if (count < 3) {
      result.push(
        this.createSuggestion({
          id: 'mix-depth',
          type: 'level',
          trackId: 'master',
          label: 'Add More Elements',
          description: `Only ${count} tracks — try adding bass, pads, or percussion for a fuller arrangement.`,
          severity: 'optional',
          reason:
            'The current arrangement is sparse and can support more supporting elements.',
          parameter: 'arrangement',
          currentValue: count,
          suggestedValue: 5,
        })
      );
    }

    if (count > 8) {
      result.push(
        this.createSuggestion({
          id: 'mix-clarity',
          type: 'eq',
          trackId: 'master',
          label: 'Check Frequency Masking',
          description: `${count} tracks may cause frequency masking — use EQ carving to keep each element clear.`,
          severity: 'recommended',
          reason:
            'Dense arrangements typically need a masking pass to preserve clarity.',
          parameter: 'eqCarving',
          currentValue: count,
          suggestedValue: 0,
        })
      );
    }

    // Check if master peaks near 0 dBFS
    result.push(
      this.createSuggestion({
        id: 'mix-headroom',
        type: 'level',
        trackId: 'master',
        label: 'Maintain Headroom',
        description: `Keep master peaks at -6 dBFS or below for clean mastering. Use master gain to adjust.`,
        severity: 'recommended',
        reason: 'Headroom is required before AI mastering and export.',
        parameter: 'masterHeadroom',
        currentValue: 0,
        suggestedValue: -6,
      })
    );

    return result;
  }

  private mapStatus(
    status: MixSuggestionStatus | undefined
  ): StudioActionResult['status'] {
    switch (status) {
      case 'previewed':
      case 'applied':
      case 'approved':
      case 'rejected':
      case 'replaced':
      case 'exported':
        return status;
      default:
        return 'pending';
    }
  }

  private findSuggestion(id: string): MixSuggestion | null {
    return (
      this.suggestions().find((suggestion) => suggestion.id === id) ?? null
    );
  }

  private setSuggestionState(id: string, patch: Partial<MixSuggestion>): void {
    this.suggestions.update((suggestions) =>
      suggestions.map((suggestion) =>
        suggestion.id === id ? { ...suggestion, ...patch } : suggestion
      )
    );
  }

  private applySuggestionPatch(suggestion: MixSuggestion): void {
    if (suggestion.trackId === 'master') {
      if (suggestion.parameter === 'masterHeadroom') {
        this.engine.setMasterOutputLevel(
          Math.pow(10, suggestion.suggestedValue / 20)
        );
      }
      return;
    }

    const track = this.musicManager
      .tracks()
      .find((candidate) => candidate.id === suggestion.trackId);
    if (!track) return;

    switch (suggestion.parameter) {
      case 'gain':
        this.musicManager.updateVolume(
          suggestion.trackId,
          this.resolveSuggestedGain(track.gain, suggestion.suggestedValue)
        );
        return;
      case 'stereoWidth':
        this.musicManager.updateStereoWidth(
          suggestion.trackId,
          suggestion.suggestedValue
        );
        return;
      case 'pan':
        this.musicManager.updateTrackPan(
          suggestion.trackId,
          suggestion.suggestedValue * 100
        );
        return;
      case 'eqHighShelf':
      case 'eqNotch':
        this.patchTrackState(track, {
          eqData: {
            low: track.eqData?.low ?? 0,
            mid:
              suggestion.parameter === 'eqNotch'
                ? suggestion.suggestedValue
                : (track.eqData?.mid ?? 0),
            high:
              suggestion.parameter === 'eqHighShelf'
                ? suggestion.suggestedValue
                : (track.eqData?.high ?? 0),
          },
          fxSlots: this.upsertFxSlot(track.fxSlots, 'EQ', {
            [suggestion.parameter]: suggestion.suggestedValue,
          }),
        });
        return;
      case 'compRatio':
        this.patchTrackState(track, {
          fxSlots: this.upsertFxSlot(track.fxSlots, 'Compressor', {
            ratio: suggestion.suggestedValue,
          }),
        });
        return;
      case 'reverbMix':
        this.patchTrackState(track, {
          fxSlots: this.upsertFxSlot(track.fxSlots, 'Reverb', {
            mix: suggestion.suggestedValue,
          }),
        });
        return;
      default:
        this.engine.updateTrack(suggestion.trackId, {
          [suggestion.parameter]: suggestion.suggestedValue,
        });
    }
  }

  private resolveSuggestedGain(
    currentGain: number,
    suggestedValue: number
  ): number {
    if (suggestedValue >= 0 && suggestedValue <= 1.5) {
      return suggestedValue;
    }
    const deltaGain = currentGain * Math.pow(10, suggestedValue / 20);
    return Math.max(0, Math.min(1.5, deltaGain));
  }

  private upsertFxSlot(
    slots: TrackModel['fxSlots'],
    type: string,
    params: Record<string, unknown>
  ): TrackModel['fxSlots'] {
    const next = [...(slots ?? [])];
    const existingIndex = next.findIndex(
      (slot) => slot.type.toLowerCase() === type.toLowerCase()
    );
    if (existingIndex >= 0) {
      next[existingIndex] = {
        ...next[existingIndex],
        enabled: true,
        params: {
          ...(next[existingIndex].params ?? {}),
          ...params,
        },
      };
      return next;
    }
    next.push({
      id: `fx_${type.toLowerCase()}_${Date.now().toString(36)}`,
      type,
      params,
      enabled: true,
    });
    return next;
  }

  private patchTrackState(track: TrackModel, patch: Partial<TrackModel>): void {
    this.musicManager.tracks.update((tracks) =>
      tracks.map((candidate) =>
        candidate.id === track.id ? { ...candidate, ...patch } : candidate
      )
    );
    this.engine.updateTrack(track.id, patch);
  }

  /**
   * AI Auto-Master: analyze the full mix and apply an optimal mastering chain
   * including multiband EQ, compressor, and limiter settings based on genre,
   * track count, and instrument types. Returns a human-readable report.
   *
   * @param genre - Optional genre hint ("trap", "house", "lo-fi", "pop").
   *   If omitted, auto-detects from track composition.
   */
  autoMaster(genre?: string): string[] {
    const tracks = this.musicManager.tracks();
    if (tracks.length === 0) return ['No tracks to master.'];

    const report: string[] = [];
    const trackCount = tracks.length;

    // 1. Analyze track types to infer genre/density
    const instrumentTypes = tracks.map((t) => this.inferInstrumentType(t));
    const hasDrums = instrumentTypes.some((t) =>
      ['kick', 'snare', 'drums', 'percussion'].includes(t)
    );
    const hasBass = instrumentTypes.some((t) => ['bass', 'sub'].includes(t));
    const hasVocals = instrumentTypes.some((t) => t === 'vocal');
    const density =
      trackCount <= 4 ? 'sparse' : trackCount <= 8 ? 'moderate' : 'dense';

    // 2. Check for genre preset — overrides density defaults
    const resolvedGenre = genre || this.detectGenre();
    const preset = this.getGenrePreset(resolvedGenre);

    let targetLufs: number;
    let safeCeiling: number;
    let compThreshold: number;
    let compRatio: number;
    let limiterThreshold: number;
    let limiterRatio: number;
    let eqHighShelf: number;
    let eqLowShelf: number;
    let eqLowMid: number;
    let genreEmoji: string;

    if (preset) {
      // Use genre-specific preset values
      targetLufs = preset.targetLufs;
      safeCeiling = preset.safeCeiling;
      compThreshold = preset.compThreshold;
      compRatio = preset.compRatio;
      limiterThreshold = preset.limiterThreshold;
      limiterRatio = preset.limiterRatio;
      eqHighShelf = preset.eqHighShelf;
      eqLowShelf = preset.eqSub;
      eqLowMid = preset.eqLowMid;
      genreEmoji = preset.emoji;
      report.push(
        `${preset.emoji} ${preset.genre.charAt(0).toUpperCase() + preset.genre.slice(1)} preset: ${preset.description}`
      );
    } else {
      // Fallback: density-based defaults
      eqLowMid = 0; // no low-mid eq in density path
      limiterRatio = 20;

      if (density === 'sparse' && hasVocals) {
        targetLufs = -16;
        safeCeiling = -1.0;
        compThreshold = -14;
        compRatio = 2.5;
        limiterThreshold = -1.5;
        eqHighShelf = 2.0;
        eqLowShelf = -0.5;
        genreEmoji = '🎤';
        report.push(
          '🎤 Vocal-forward mix: preserving dynamic range with gentle compression.'
        );
      } else if (density === 'sparse' && hasDrums && hasBass) {
        targetLufs = -12;
        safeCeiling = -0.5;
        compThreshold = -12;
        compRatio = 3.0;
        limiterThreshold = -1.0;
        eqHighShelf = 1.5;
        eqLowShelf = 1.0;
        genreEmoji = '🥁';
        report.push(
          '🥁 Rhythm-heavy mix: punchy compression with low-end enhancement.'
        );
      } else if (density === 'moderate') {
        targetLufs = -14;
        safeCeiling = -0.8;
        compThreshold = -10;
        compRatio = 3.5;
        limiterThreshold = -1.2;
        eqHighShelf = 1.0;
        eqLowShelf = 0;
        genreEmoji = '⚖️';
        report.push(
          '⚖️ Balanced mix: transparent compression with gentle air boost.'
        );
      } else {
        targetLufs = -10;
        safeCeiling = -0.3;
        compThreshold = -8;
        compRatio = 4.0;
        limiterThreshold = -0.5;
        eqHighShelf = 0.5;
        eqLowShelf = -0.5;
        genreEmoji = '🔊';
        report.push('🔊 Dense mix: tighter compression with low-end control.');
      }
    }

    // 3. Apply to audio engine
    this.engine.setMasteringTargets({
      lufs: targetLufs,
      truePeak: safeCeiling,
    });
    this.engine.configureCompressor({
      threshold: compThreshold,
      ratio: compRatio,
    });
    this.engine.configureLimiter({
      threshold: limiterThreshold,
      ratio: limiterRatio,
    });

    // 4. Configure master EQ via the worklet or fallback shelf filters
    const now = this.engine.ctx.currentTime;
    this.engine.masterShelf.gain.setTargetAtTime(eqHighShelf, now, 0.05);

    // Low-shelf (sub/bass) and low-mid EQ via biquads
    try {
      // Insert sub-bass low-shelf filter
      const lowShelf = this.engine.ctx.createBiquadFilter();
      lowShelf.type = 'lowshelf';
      lowShelf.frequency.value = 60;
      lowShelf.gain.setTargetAtTime(eqLowShelf, now, 0.05);

      // Insert low-mid parametric EQ
      const lowMid = this.engine.ctx.createBiquadFilter();
      lowMid.type = 'peaking';
      lowMid.frequency.value = 300;
      lowMid.Q.value = 0.7;
      lowMid.gain.setTargetAtTime(eqLowMid, now, 0.05);

      // Chain: preMasterGain → lowShelf → lowMid → compressor
      this.engine['_preMasterGain'].disconnect();
      this.engine['_preMasterGain'].connect(lowShelf);
      lowShelf.connect(lowMid);
      lowMid.connect(this.engine.compressor);
    } catch {
      /* fallback chain already connected */
    }

    // 5. Update suggestions to reflect applied changes
    this.suggestions.update((sugs) => [
      ...sugs,
      this.createSuggestion({
        id: 'auto-master',
        type: 'level',
        trackId: 'master',
        label: 'AI Master Applied',
        description: `Target ${targetLufs} LUFS · ceiling ${safeCeiling} dBFS · ratio ${compRatio}:1 · high-shelf ${eqHighShelf > 0 ? '+' : ''}${eqHighShelf}dB`,
        severity: 'recommended',
        reason: `The ${resolvedGenre} mastering profile has already been applied to the current mix.`,
        parameter: 'mastering',
        currentValue: 0,
        suggestedValue: targetLufs,
      }),
    ]);

    // 6. Generate analysis summary
    const genreLabel = preset
      ? `${preset.emoji} ${preset.genre.charAt(0).toUpperCase() + preset.genre.slice(1)}`
      : `${genreEmoji} ${density}`;
    report.push(
      `📊 ${trackCount} tracks · ${density} arrangement · ${resolvedGenre} detection`
    );
    report.push(`🎯 Target: ${targetLufs} LUFS · Ceiling: ${safeCeiling} dBFS`);
    report.push(
      `🔧 Compressor: ${compThreshold} dB threshold · ${compRatio}:1 ratio`
    );
    report.push(
      `🔩 Limiter: ${limiterThreshold} dB threshold · ${limiterRatio}:1 brickwall`
    );
    report.push(
      `📈 EQ: high-shelf ${eqHighShelf > 0 ? '+' : ''}${eqHighShelf} dB · sub-shelf ${eqLowShelf > 0 ? '+' : ''}${eqLowShelf} dB · low-mid ${eqLowMid > 0 ? '+' : ''}${eqLowMid} dB`
    );
    report.push(
      `✅ AI mastering complete — ${genreLabel} mix is optimized for ${preset ? preset.description : density === 'sparse' ? 'clarity and dynamics' : density === 'moderate' ? 'streaming platforms' : 'maximum loudness'}.`
    );

    return report;
  }

  /**
   * Suggest a chord progression based on genre/mood.
   */
  suggestChordProgression(genre?: string): string[] {
    const progressions: Record<string, string[]> = {
      'neo-soul': ['ii7', 'V7', 'Imaj7', 'vi7'],
      trap: ['i', 'VI', 'III', 'VII'],
      'lo-fi': ['Imaj7', 'V7', 'IVmaj7', 'vi7'],
      house: ['i', 'VI', 'III', 'VII'],
      drill: ['i', 'iv', 'VII', 'III'],
      pop: ['I', 'V', 'vi', 'IV'],
      rnb: ['ii7', 'V7', 'Imaj7', 'vi7'],
      'deep-house': ['Imaj9', 'VIImaj9', 'vim9', 'Vm7'],
      dubstep: ['i', 'VI', 'III', 'VII'],
      ambient: ['Imaj7sus2', 'IVmaj9', 'IIIm9', 'vim11'],
      jazz: ['iim7', 'V7', 'Imaj7', 'III7alt'],
      funk: ['I9', 'IV13', 'I9', 'V7sus4'],
      reggaeton: ['i', 'VI', 'III', 'VII'],
      techno: ['i', 'iv', 'VII', 'III'],
      phonk: ['i', 'VII', 'VI', 'VII'],
      garage: ['Imaj7', 'IIm7', 'IIIm7', 'IVmaj7'],
    };

    const normalized = (genre || 'pop').toLowerCase().replace(/[^a-z-]/g, '');
    return progressions[normalized] || progressions['pop'];
  }

  /**
   * Get smart genre-matched instrument recommendations.
   */
  recommendInstruments(genre: string): string[] {
    const recs: Record<string, string[]> = {
      'neo-soul': [
        'grand-piano',
        'p-bass-elite',
        'trap-808-elite',
        'strat-elite-clean',
      ],
      trap: ['sub-commander', 'trap-808-elite', 'cyber-stab', 'synth-lead'],
      'lo-fi': [
        'grand-piano',
        'p-bass-elite',
        'trap-808-elite',
        'vinyl-crackle',
      ],
      house: ['cyber-stab', 'sub-commander', 'trap-808-elite', 'synth-pad'],
      pop: [
        'strat-elite-clean',
        'p-bass-elite',
        'grand-piano',
        'trap-808-elite',
      ],
      rnb: ['grand-piano', 'p-bass-elite', 'trap-808-elite', 'synth-pad'],
      dubstep: [
        'sub-commander',
        'cyber-stab',
        'synth-lead',
        'trap-808-elite',
        'fx-sweep',
      ],
      reggaeton: [
        'trap-808-elite',
        'p-bass-elite',
        'grand-piano',
        'synth-pad',
        'percussion-rack',
      ],
      ambient: [
        'synth-pad',
        'grand-piano',
        'fx-ambient',
        'vinyl-crackle',
        'texture-drone',
      ],
      jazz: [
        'grand-piano',
        'p-bass-elite',
        'strat-elite-clean',
        'vinyl-crackle',
        'brass-section',
      ],
    };
    return recs[genre] || ['grand-piano', 'p-bass-elite', 'trap-808-elite'];
  }

  // ── Private heuristics ──────────────────────────────────────────

  private inferInstrumentType(track: TrackModel): string {
    const name = (track.name || track.instrumentId || '').toLowerCase();
    const inst = (track.instrumentId || '').toLowerCase();

    if (name.includes('kick') || inst.includes('kick')) return 'kick';
    if (name.includes('snare') || inst.includes('snare')) return 'snare';
    if (name.includes('bass') || inst.includes('bass') || inst.includes('sub'))
      return 'bass';
    if (
      name.includes('vocal') ||
      name.includes('voice') ||
      name.includes('mic')
    )
      return 'vocal';
    if (name.includes('pad') || inst.includes('pad')) return 'pad';
    if (name.includes('lead') || inst.includes('lead')) return 'lead';
    if (name.includes('drum') || inst.includes('drum') || inst.includes('808'))
      return 'drums';
    if (name.includes('fx') || name.includes('effect')) return 'fx';
    if (
      name.includes('hat') ||
      name.includes('hi-hat') ||
      name.includes('cymbal')
    )
      return 'percussion';
    if (
      name.includes('piano') ||
      name.includes('key') ||
      name.includes('organ')
    )
      return 'chords';
    if (name.includes('guitar') || name.includes('strat')) return 'melodic';
    if (name.includes('synth') || name.includes('stab')) return 'synth';

    return 'instrument';
  }

  private inferFrequencyProfile(
    instType: string,
    index: number
  ): TrackAnalysis['frequencyProfile'] {
    const lowTypes = ['kick', 'bass', 'sub', '808', 'tom'];
    const brightTypes = ['hi-hat', 'cymbal', 'lead', 'fx', 'percussion'];
    if (lowTypes.includes(instType)) return 'dark';
    if (brightTypes.includes(instType)) return 'bright';
    if (instType === 'vocal' || instType === 'snare') return 'balanced';
    if (index > 4) return 'harsh';
    return 'balanced';
  }

  private inferStereoWidth(instType: string): TrackAnalysis['stereoWidth'] {
    const wideTypes = ['pad', 'fx', 'synth', 'organ'];
    const narrowTypes = ['kick', 'bass', 'snare', 'vocal'];
    if (wideTypes.includes(instType)) return 'wide';
    if (narrowTypes.includes(instType)) return 'narrow';
    return 'balanced';
  }

  private inferTransients(instType: string): TrackAnalysis['transientContent'] {
    const hiTypes = ['kick', 'snare', 'percussion', 'pluck', 'pizzicato'];
    const lowTypes = ['pad', 'ambient', 'atmosphere'];
    if (hiTypes.includes(instType)) return 'high';
    if (lowTypes.includes(instType)) return 'low';
    return 'moderate';
  }

  private inferHarmonics(
    instType: string
  ): TrackAnalysis['harmonicComplexity'] {
    const complexTypes = ['pad', 'synth', 'organ', 'vocal'];
    const simpleTypes = ['kick', 'snare', 'bass', 'percussion'];
    if (complexTypes.includes(instType)) return 'complex';
    if (simpleTypes.includes(instType)) return 'simple';
    return 'moderate';
  }

  private isWideInstrument(instType: string): boolean {
    return ['pad', 'synth', 'fx', 'organ', 'chords'].includes(instType);
  }

  private getSuggestedRole(
    instType: string,
    index: number,
    total: number
  ): string {
    if (instType === 'kick' || instType === 'snare') return 'rhythm';
    if (instType === 'bass') return 'foundation';
    if (instType === 'vocal' || instType === 'lead') return 'focus';
    if (instType === 'pad') return 'atmosphere';
    if (instType === 'chords') return 'harmony';
    if (instType === 'fx') return 'texture';
    if (instType === 'percussion' || instType === 'drums') return 'rhythm';
    return 'support';
  }
}
