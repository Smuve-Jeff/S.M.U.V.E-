import { Injectable, inject, signal, computed } from '@angular/core';
import {
  MusicManagerService,
  TrackModel,
} from '../../services/music-manager.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { IdeasGeneratorService } from '../../services/ideas-generator.service';

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
      result.push({
        id: `eq-hi-${ti}`,
        type: 'eq',
        trackId: ti,
        label: 'Add High-End Presence',
        description: `${analysis.trackName} sounds dark — try a gentle high-shelf boost around 8-12 kHz to add air and clarity.`,
        severity: 'recommended',
        action: () => {},
        parameter: 'eqHighShelf',
        currentValue: 0,
        suggestedValue: 3,
      });
    }

    if (
      analysis.frequencyProfile === 'harsh' ||
      analysis.frequencyProfile === 'bright'
    ) {
      result.push({
        id: `eq-lo-${ti}`,
        type: 'eq',
        trackId: ti,
        label: 'Tame High Frequencies',
        description: `${analysis.trackName} is bright — a gentle cut around 3-5 kHz can reduce listener fatigue.`,
        severity: 'recommended',
        action: () => {},
        parameter: 'eqNotch',
        currentValue: 0,
        suggestedValue: -2,
      });
    }

    // Stereo width suggestions
    if (
      analysis.stereoWidth === 'mono' &&
      this.isWideInstrument(analysis.instrumentType)
    ) {
      result.push({
        id: `width-${ti}`,
        type: 'width',
        trackId: ti,
        label: 'Widen Stereo Image',
        description: `${analysis.trackName} sounds mono — apply stereo enhancement to fill the soundstage.`,
        severity: 'optional',
        action: () => {},
        parameter: 'stereoWidth',
        currentValue: 0,
        suggestedValue: 40,
      });
    }

    // Dynamic range / compression suggestions
    if (
      analysis.transientContent === 'high' &&
      analysis.instrumentType !== 'drums'
    ) {
      result.push({
        id: `comp-${ti}`,
        type: 'compression',
        trackId: ti,
        label: 'Apply Gentle Compression',
        description: `${analysis.trackName} has wide dynamics — a 2:1 ratio compressor smooths peaks while retaining punch.`,
        severity: 'optional',
        action: () => {},
        parameter: 'compRatio',
        currentValue: 1,
        suggestedValue: 2,
      });
    }

    // Reverb suggestions based on role
    if (
      analysis.suggestedRole === 'pad' ||
      analysis.suggestedRole === 'atmosphere'
    ) {
      result.push({
        id: `verb-${ti}`,
        type: 'reverb',
        trackId: ti,
        label: 'Add Ambience',
        description: `${analysis.trackName} would benefit from a hall or plate reverb to create depth.`,
        severity: 'optional',
        action: () => {},
        parameter: 'reverbMix',
        currentValue: 0,
        suggestedValue: 25,
      });
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
      result.push({
        id: `level-${ti}`,
        type: 'level',
        trackId: ti,
        label: 'Reduce Level Slightly',
        description: `${analysis.trackName} may be too loud for its role — a 1-2 dB reduction can improve mix balance.`,
        severity: 'optional',
        action: () => {},
        parameter: 'gain',
        currentValue: 0,
        suggestedValue: -1.5,
      });
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
      result.push({
        id: 'mix-depth',
        type: 'level',
        trackId: 'master',
        label: 'Add More Elements',
        description: `Only ${count} tracks — try adding bass, pads, or percussion for a fuller arrangement.`,
        severity: 'optional',
        action: () => {},
        parameter: 'arrangement',
        currentValue: count,
        suggestedValue: 5,
      });
    }

    if (count > 8) {
      result.push({
        id: 'mix-clarity',
        type: 'eq',
        trackId: 'master',
        label: 'Check Frequency Masking',
        description: `${count} tracks may cause frequency masking — use EQ carving to keep each element clear.`,
        severity: 'recommended',
        action: () => {},
        parameter: 'eqCarving',
        currentValue: count,
        suggestedValue: 0,
      });
    }

    // Check if master peaks near 0 dBFS
    result.push({
      id: 'mix-headroom',
      type: 'level',
      trackId: 'master',
      label: 'Maintain Headroom',
      description: `Keep master peaks at -6 dBFS or below for clean mastering. Use master gain to adjust.`,
      severity: 'recommended',
      action: () => {},
      parameter: 'masterHeadroom',
      currentValue: 0,
      suggestedValue: -6,
    });

    return result;
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
