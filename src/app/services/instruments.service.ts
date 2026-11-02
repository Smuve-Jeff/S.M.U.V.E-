import { Injectable, inject } from '@angular/core';
import { AudioEngineService, type VoiceControlPoint } from './audio-engine.service';

export type SampleZone = {
  midiRange: [number, number];
  /** Original MIDI pitch, when it cannot be inferred from the filename. */
  rootNote?: number;
  url: string;
  rr?: number;
  velLayers?: { threshold: number; url: string }[];
  quality?: 'standard' | 'high';
};

/** MIDI root of a sample: explicit metadata, single-note zone, or filename. */
export function sampleZoneRoot(zone: SampleZone): number {
  if (zone.rootNote !== undefined) return zone.rootNote;
  if (zone.midiRange[0] === zone.midiRange[1]) return zone.midiRange[0];
  const match = zone.url.match(/(?:^|[/_-])([A-G])([#b]?)(-?\d+)(?:[_.]|$)/i);
  if (!match) return 60;
  const pitch: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return (Number(match[3]) + 1) * 12 + pitch[match[1].toUpperCase()] +
    (match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0);
}

export type InstrumentArticulation = {
  attack: number;
  release: number;
  tone: number;
  character: number;
};

export interface InstrumentPreset {
  id: string;
  name: string;
  type: 'sample' | 'synth' | 'hybrid';
  category:
    | 'piano'
    | 'bass'
    | 'drum'
    | 'keys'
    | 'lead'
    | 'pad'
    | 'guitar'
    | 'strings'
    | 'vfx'
    | 'perc'
    | 'brass'
    | 'woodwind'
    | 'choir'
    | 'organ'
    | 'world'
    | 'other';
  tags: string[];
  icon?: string;
  previewUrl?: string;
  sampleQuality?: 'standard' | 'high' | 'studio';
  fallbackPresetId?: string;
  articulation?: InstrumentArticulation;
  zones?: SampleZone[];
  defaultFx?: {
    id: string;
    type: string;
    params: any;
    enabled: boolean;
    mix?: number;
  }[];
  synth?: {
    type: string;
    attack: number;
    decay: number;
    sustain: number;
    release: number;
    cutoff: number;
    q: number;
    resonance?: number;
    detune?: number;
    voices?: number;
    unison?: number;
    spread?: number;
  };
}

/**
 * Oscillator fallback per category, used for presets that ship samples only.
 * Their samples are the real instrument, but until a station's samples are
 * loaded a channel still needs a timbre of its own rather than the previous
 * instrument's patch.
 */
const CATEGORY_OSCILLATOR: Record<InstrumentPreset['category'], string> = {
  piano: 'triangle',
  keys: 'triangle',
  organ: 'square',
  brass: 'sawtooth',
  woodwind: 'sine',
  strings: 'sawtooth',
  pad: 'sawtooth',
  choir: 'sine',
  guitar: 'sawtooth',
  bass: 'sawtooth',
  lead: 'square',
  drum: 'triangle',
  perc: 'triangle',
  vfx: 'square',
  world: 'triangle',
  other: 'sine',
};

/**
 * Synth patch for a preset that has no `synth` block of its own (every
 * sample-based preset). Articulation — where the preset declares it — drives
 * the envelope, and percussive categories get a one-shot shape instead of a
 * sustaining one.
 */
export function synthParamsForPreset(preset: InstrumentPreset): {
  oscillator: string;
  type: string;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  cutoff: number;
  q: number;
} {
  const articulation = preset.articulation;
  const percussive =
    preset.category === 'drum' || preset.category === 'perc';
  const oscillator = CATEGORY_OSCILLATOR[preset.category] ?? 'sine';
  return {
    oscillator,
    type: oscillator,
    attack: articulation?.attack ?? (percussive ? 0.002 : 0.02),
    decay: percussive ? 0.18 : 0.25,
    sustain: percussive ? 0 : 0.55,
    release: articulation?.release ?? (percussive ? 0.12 : 0.35),
    cutoff: percussive ? 8000 : 6000,
    q: 1,
  };
}

export type PresetSample = {
  buffer: AudioBuffer;
  rate: number;
  oneShot: boolean;
  release: number;
};

/** Schedule a preset sample into an offline track, matching live note length and pan. */
export function scheduleOfflinePresetSample(
  ctx: BaseAudioContext,
  destination: AudioNode,
  sample: PresetSample,
  start: number,
  duration: number,
  velocity: number,
  pan: number,
  control: VoiceControlPoint[] = [],
): void {
  const length = Math.max(0.001, Math.min(
    sample.buffer.duration / sample.rate,
    sample.oneShot ? Infinity : Math.max(0.01, duration) + sample.release,
  ));
  const source = ctx.createBufferSource();
  source.buffer = sample.buffer;
  source.playbackRate.setValueAtTime(sample.rate, start);
  const points = Array.isArray(control)
    ? control.filter((point) => point && Number.isFinite(point.at))
    : [];
  const startPoint = points[0];
  const panner = ctx.createStereoPanner();
  panner.pan.setValueAtTime(
    Math.max(-1, Math.min(1, startPoint?.pan ?? pan)),
    start,
  );
  const gain = ctx.createGain();
  const peak = Math.max(0, velocity);
  gain.gain.setValueAtTime(0, start);
  gain.gain.setTargetAtTime(peak, start, 0.005);
  if (!sample.oneShot && sample.release > 0) {
    const fade = Math.min(sample.release, length);
    gain.gain.setValueAtTime(peak, start + length - fade);
    gain.gain.linearRampToValueAtTime(0, start + length);
  }
  const expressionGain = points.some(
    (point) => typeof point.expression === 'number',
  )
    ? ctx.createGain()
    : null;
  if (expressionGain) {
    expressionGain.gain.setValueAtTime(
      Math.max(0, Math.min(1, startPoint?.expression ?? 1)),
      start,
    );
  }
  const schedule = (
    param: AudioParam,
    key: keyof VoiceControlPoint,
    scale: (value: number) => number,
  ): void => {
    let scheduled = false;
    for (const point of points) {
      const raw = point[key];
      if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
      const at = start + Math.max(0, point.at);
      const value = scale(raw);
      if (!scheduled) {
        param.setValueAtTime(value, at);
        scheduled = true;
      } else {
        param.linearRampToValueAtTime(value, at);
      }
    }
  };
  if (points.some((point) => typeof point.pan === 'number')) {
    schedule(panner.pan, 'pan', (value) => Math.max(-1, Math.min(1, value)));
  }
  if (expressionGain) {
    schedule(expressionGain.gain, 'expression', (value) =>
      Math.max(0, Math.min(1, value)),
    );
  }
  source.connect(panner);
  panner.connect(gain);
  if (expressionGain) {
    gain.connect(expressionGain);
    expressionGain.connect(destination);
  } else {
    gain.connect(destination);
  }
  source.start(start);
  source.stop(start + length + 0.01);
}

@Injectable({ providedIn: 'root' })
export class InstrumentsService {
  private audioEngine = inject(AudioEngineService);

  presets: InstrumentPreset[] = [
    {
      id: 'grand-piano',
      name: 'Grand Piano Elite',
      type: 'sample',
      category: 'piano',
      tags: ['classic', 'acoustic', 'high-fidelity', 'elite'],
      sampleQuality: 'high',
      fallbackPresetId: 'stage-piano',
      zones: [
        {
          midiRange: [21, 108],
          url: 'https://tonejs.github.io/audio/salamander/C4.mp3',
          velLayers: [
            {
              threshold: 64,
              url: 'https://danigb.github.io/samples/splendid-grand-piano/PP-C4.m4a',
            },
            {
              threshold: 127,
              url: 'https://danigb.github.io/samples/splendid-grand-piano/FF-C4.m4a',
            },
          ],
        },
      ],
    },
    {
      id: 'modern-kit-elite',
      name: 'Modern Pop Kit',
      type: 'sample',
      category: 'drum',
      tags: ['drums', 'modern', 'pop', 'elite'],
      sampleQuality: 'high',
      zones: [
        {
          midiRange: [36, 36],
          url: 'https://tonejs.github.io/audio/drum-samples/CR78/kick.mp3',
        },
        {
          midiRange: [38, 38],
          url: 'https://tonejs.github.io/audio/drum-samples/CR78/snare.mp3',
        },
        {
          midiRange: [42, 42],
          url: 'https://tonejs.github.io/audio/drum-samples/CR78/hihat.mp3',
        },
      ],
    },
    {
      id: 'strat-elite-clean',
      name: 'Strat Elite Clean',
      type: 'sample',
      category: 'guitar',
      tags: ['electric', 'clean', 'stratocaster', 'elite'],
      sampleQuality: 'high',
      zones: [
        {
          midiRange: [40, 88],
          url: 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/electric_guitar_clean-mp3/G3.mp3',
        },
      ],
    },
    {
      id: 'chamber-strings-elite',
      name: 'Chamber Strings Elite',
      type: 'sample',
      category: 'strings',
      tags: ['orchestral', 'ensemble', 'high-fidelity', 'elite'],
      sampleQuality: 'high',
      zones: [
        {
          midiRange: [36, 96],
          url: 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/string_ensemble_1-mp3/C4.mp3',
        },
      ],
    },
    {
      id: 'p-bass-elite',
      name: 'P-Bass Elite',
      type: 'sample',
      category: 'bass',
      tags: ['electric', 'bass', 'precision', 'elite'],
      sampleQuality: 'high',
      zones: [
        {
          midiRange: [28, 64],
          url: 'https://tonejs.github.io/audio/casio/A1.mp3',
        },
      ],
    },
    {
      id: 'solo-violin-elite',
      name: 'Solo Violin Elite',
      type: 'sample',
      category: 'strings',
      tags: ['acoustic', 'solo', 'virtuoso', 'elite'],
      sampleQuality: 'high',
      zones: [
        {
          midiRange: [55, 103],
          url: 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/violin-mp3/C4.mp3',
        },
      ],
    },
    {
      id: 'analog-warmth',
      name: 'Analog Warmth',
      type: 'synth',
      category: 'lead',
      tags: ['analog', 'warm', 'moog-style'],
      synth: {
        type: 'sawtooth',
        attack: 0.1,
        decay: 0.2,
        sustain: 0.5,
        release: 0.4,
        cutoff: 800,
        q: 2.0,
      },
    },
    {
      id: 'sub-commander',
      name: 'Sub Commander',
      type: 'synth',
      category: 'bass',
      tags: ['sub', 'deep', 'electronic'],
      synth: {
        type: 'sine',
        attack: 0.08,
        decay: 0.4,
        sustain: 0.8,
        release: 0.6,
        cutoff: 120,
        q: 1,
      },
    },
    {
      id: 'trap-808-elite',
      name: 'Trap 808 Elite',
      type: 'synth',
      category: 'bass',
      tags: ['808', 'trap', 'saturated'],
      synth: {
        type: 'triangle',
        attack: 0.001,
        decay: 0.8,
        sustain: 0.0,
        release: 0.8,
        cutoff: 400,
        q: 3.0,
        detune: 5,
      },
    },
    {
      id: 'ethereal-wind',
      name: 'Ethereal Wind',
      type: 'synth',
      category: 'pad',
      tags: ['ambient', 'wind', 'lush'],
      synth: {
        type: 'sawtooth',
        attack: 1.2,
        decay: 1.5,
        sustain: 0.8,
        release: 2.0,
        cutoff: 1500,
        q: 0.3,
      },
    },
    {
      id: 'cyber-stab',
      name: 'Cyber Stab',
      type: 'synth',
      category: 'vfx',
      tags: ['futuristic', 'impact', 'short'],
      synth: {
        type: 'square',
        attack: 0.01,
        decay: 0.1,
        sustain: 0,
        release: 0.1,
        cutoff: 4000,
        q: 8.0,
      },
    },
    {
      id: 'deep-orbit',
      name: 'Deep Orbit',
      type: 'synth',
      category: 'pad',
      tags: ['space', 'dark', 'evolve'],
      synth: {
        type: 'sawtooth',
        attack: 3.0,
        decay: 2.0,
        sustain: 0.9,
        release: 4.0,
        cutoff: 600,
        q: 0.5,
        detune: 12,
      },
    },
    {
      id: 'neon-shimmer',
      name: 'Neon Shimmer',
      type: 'synth',
      category: 'keys',
      tags: ['bright', 'digital', 'dreamy'],
      synth: {
        type: 'sine',
        attack: 0.05,
        decay: 0.5,
        sustain: 0.4,
        release: 1.2,
        cutoff: 3000,
        q: 1.5,
        detune: 2,
      },
    },
    // ═══ 25+ NEW HIGH-QUALITY PRESETS ════════════════════
    // ── BRASS ──────────────────────────────────────────
    {
      id: 'trumpet-pro',
      name: 'Trumpet Pro Solo',
      type: 'sample',
      category: 'brass',
      tags: ['acoustic', 'solo', 'jazz', 'orchestral', 'pro'],
      sampleQuality: 'studio',
      zones: [
        {
          midiRange: [55, 84],
          url: 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/trumpet-mp3/C4.mp3',
        },
      ],
      articulation: { attack: 0.08, release: 0.3, tone: 0.7, character: 0.6 },
    },
    {
      id: 'trombone-pro',
      name: 'Trombone Pro',
      type: 'sample',
      category: 'brass',
      tags: ['acoustic', 'orchestral', 'bold', 'pro'],
      sampleQuality: 'studio',
      zones: [
        {
          midiRange: [36, 72],
          url: 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/trombone-mp3/C3.mp3',
        },
      ],
    },
    {
      id: 'french-horn-ensemble',
      name: 'French Horn Ensemble',
      type: 'sample',
      category: 'brass',
      tags: ['orchestral', 'ensemble', 'epic', 'cinematic'],
      sampleQuality: 'high',
      zones: [
        {
          midiRange: [34, 72],
          url: 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/french_horn-mp3/C3.mp3',
        },
      ],
    },
    {
      id: 'brass-stab-synth',
      name: 'Brass Stab Synth',
      type: 'synth',
      category: 'brass',
      tags: ['electronic', 'stab', 'energetic', 'synthwave'],
      synth: {
        type: 'sawtooth',
        attack: 0.02,
        decay: 0.3,
        sustain: 0.5,
        release: 0.4,
        cutoff: 2500,
        q: 3.0,
        unison: 4,
        spread: 0.12,
      },
    },
    // ── WOODWINDS ─────────────────────────────────────
    {
      id: 'flute-pro',
      name: 'Concert Flute Pro',
      type: 'sample',
      category: 'woodwind',
      tags: ['acoustic', 'orchestral', 'airy', 'pro'],
      sampleQuality: 'studio',
      zones: [
        {
          midiRange: [60, 96],
          url: 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/flute-mp3/C4.mp3',
        },
      ],
      articulation: { attack: 0.12, release: 0.4, tone: 0.8, character: 0.3 },
    },
    {
      id: 'clarinet-pro',
      name: 'Clarinet Pro',
      type: 'sample',
      category: 'woodwind',
      tags: ['acoustic', 'jazz', 'classical', 'warm'],
      sampleQuality: 'high',
      zones: [
        {
          midiRange: [50, 86],
          url: 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/clarinet-mp3/C4.mp3',
        },
      ],
    },
    {
      id: 'sax-alto-pro',
      name: 'Alto Sax Pro',
      type: 'sample',
      category: 'woodwind',
      tags: ['acoustic', 'jazz', 'soul', 'pro'],
      sampleQuality: 'studio',
      zones: [
        {
          midiRange: [49, 81],
          url: 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/alto_sax-mp3/C4.mp3',
        },
      ],
      articulation: { attack: 0.1, release: 0.35, tone: 0.75, character: 0.7 },
    },
    // ── CHOIR / VOCAL ─────────────────────────────────
    {
      id: 'choir-ensemble',
      name: 'Cathedral Choir',
      type: 'sample',
      category: 'choir',
      tags: ['vocal', 'ensemble', 'cinematic', 'epic', 'sacred'],
      sampleQuality: 'studio',
      zones: [
        {
          midiRange: [48, 84],
          url: 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/choir_aahs-mp3/C4.mp3',
        },
      ],
    },
    {
      id: 'vocal-pad-ethereal',
      name: 'Ethereal Voice Pad',
      type: 'synth',
      category: 'choir',
      tags: ['vocal', 'ambient', 'ethereal', 'dreamy'],
      synth: {
        type: 'sine',
        attack: 1.5,
        decay: 2.0,
        sustain: 0.8,
        release: 3.0,
        cutoff: 1200,
        q: 0.4,
        voices: 6,
        detune: 8,
        spread: 0.25,
      },
    },
    {
      id: 'whisper-choir',
      name: 'Whisper Choir',
      type: 'hybrid',
      category: 'choir',
      tags: ['vocal', 'atmospheric', 'haunting', 'texture'],
      sampleQuality: 'high',
      zones: [
        {
          midiRange: [55, 84],
          url: 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/choir_aahs-mp3/C5.mp3',
        },
      ],
      synth: {
        type: 'sine',
        attack: 0.8,
        decay: 1.5,
        sustain: 0.6,
        release: 2.5,
        cutoff: 800,
        q: 0.3,
      },
    },
    // ── ORGAN ─────────────────────────────────────────
    {
      id: 'hammond-b3',
      name: 'Hammond B3 Classic',
      type: 'synth',
      category: 'organ',
      tags: ['vintage', 'classic', 'rock', 'jazz', 'soul'],
      synth: {
        type: 'sawtooth',
        attack: 0.02,
        decay: 0.1,
        sustain: 1.0,
        release: 0.2,
        cutoff: 4000,
        q: 2.5,
        voices: 3,
        detune: 3,
        spread: 0.08,
      },
    },
    {
      id: 'pipe-organ-grand',
      name: 'Grand Pipe Organ',
      type: 'sample',
      category: 'organ',
      tags: ['church', 'cinematic', 'epic', 'gothic'],
      sampleQuality: 'studio',
      zones: [
        {
          midiRange: [36, 96],
          url: 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/church_organ-mp3/C4.mp3',
        },
      ],
    },
    // ── WORLD ─────────────────────────────────────────
    {
      id: 'sitar-pro',
      name: 'Sitar Pro',
      type: 'sample',
      category: 'world',
      tags: ['indian', 'ethnic', 'plucked', 'meditative'],
      sampleQuality: 'high',
      zones: [
        {
          midiRange: [48, 84],
          url: 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/sitar-mp3/C4.mp3',
        },
      ],
    },
    {
      id: 'koto-japanese',
      name: 'Koto Japanese',
      type: 'sample',
      category: 'world',
      tags: ['japanese', 'ethnic', 'plucked', 'serene'],
      sampleQuality: 'high',
      zones: [
        {
          midiRange: [55, 90],
          url: 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/koto-mp3/C4.mp3',
        },
      ],
    },
    {
      id: 'steel-drum-island',
      name: 'Steel Drum Island',
      type: 'sample',
      category: 'world',
      tags: ['caribbean', 'percussive', 'melodic', 'happy'],
      sampleQuality: 'high',
      zones: [
        {
          midiRange: [55, 84],
          url: 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/steel_drums-mp3/C4.mp3',
        },
      ],
    },
    // ── DRUM KITS ─────────────────────────────────────
    {
      id: 'trap-kit-elite',
      name: 'Trap Kit Elite',
      type: 'sample',
      category: 'drum',
      tags: ['trap', 'hard', 'modern', 'elite'],
      sampleQuality: 'studio',
      zones: [
        {
          midiRange: [36, 36],
          url: 'https://danigb.github.io/samples/sample-pi/drums/one-shots/kick/bd_808.m4a',
        },
        {
          midiRange: [38, 38],
          url: 'https://danigb.github.io/samples/sample-pi/drums/one-shots/snare/elec_snare.m4a',
        },
        {
          midiRange: [42, 42],
          url: 'https://danigb.github.io/samples/sample-pi/drums/one-shots/cymbal/drum_cymbal_closed.m4a',
        },
        {
          midiRange: [46, 46],
          url: 'https://danigb.github.io/samples/sample-pi/drums/one-shots/cymbal/drum_cymbal_open.m4a',
        },
      ],
    },
    {
      id: 'lo-fi-kit',
      name: 'Lo-Fi Dusty Kit',
      type: 'sample',
      category: 'drum',
      tags: ['lofi', 'vintage', 'chill', 'dusty'],
      sampleQuality: 'high',
      zones: [
        {
          midiRange: [36, 36],
          url: 'https://danigb.github.io/samples/sample-pi/drums/one-shots/kick/drum_bass_soft.m4a',
        },
        {
          midiRange: [38, 38],
          url: 'https://danigb.github.io/samples/sample-pi/drums/one-shots/snare/drum_snare_soft.m4a',
        },
        {
          midiRange: [42, 42],
          url: 'https://danigb.github.io/samples/sample-pi/drums/one-shots/cymbal/drum_cymbal_pedal.m4a',
        },
      ],
    },
    {
      id: 'acoustic-kit-pro',
      name: 'Acoustic Studio Kit',
      type: 'sample',
      category: 'drum',
      tags: ['acoustic', 'studio', 'live', 'pro'],
      sampleQuality: 'studio',
      zones: [
        {
          midiRange: [36, 36],
          url: 'https://tonejs.github.io/audio/drum-samples/acoustic-kit/kick.mp3',
        },
        {
          midiRange: [38, 38],
          url: 'https://tonejs.github.io/audio/drum-samples/acoustic-kit/snare.mp3',
        },
        {
          midiRange: [42, 42],
          url: 'https://tonejs.github.io/audio/drum-samples/acoustic-kit/hihat.mp3',
        },
      ],
    },
    // ── GUITARS ───────────────────────────────────────
    {
      id: 'nylon-guitar-pro',
      name: 'Nylon Guitar Pro',
      type: 'sample',
      category: 'guitar',
      tags: ['acoustic', 'classical', 'nylon', 'warm', 'pro'],
      sampleQuality: 'studio',
      zones: [
        {
          midiRange: [40, 80],
          url: 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/acoustic_guitar_nylon-mp3/C4.mp3',
        },
      ],
      articulation: { attack: 0.15, release: 0.6, tone: 0.65, character: 0.4 },
    },
    {
      id: 'distortion-amp',
      name: 'High-Gain Amp Stack',
      type: 'synth',
      category: 'guitar',
      tags: ['electric', 'distortion', 'rock', 'metal', 'heavy'],
      synth: {
        type: 'sawtooth',
        attack: 0.01,
        decay: 0.2,
        sustain: 0.6,
        release: 0.3,
        cutoff: 5000,
        q: 6.0,
        unison: 2,
        detune: 15,
      },
      defaultFx: [
        {
          id: 'dist-1',
          type: 'distortion',
          params: { drive: 0.8, tone: 0.6 },
          enabled: true,
          mix: 0.9,
        },
      ],
    },
    // ── SYNTH LEADS & PLUCKS ──────────────────────────
    {
      id: 'supersaw-stack',
      name: 'SuperSaw Stack',
      type: 'synth',
      category: 'lead',
      tags: ['edm', 'trance', 'anthem', 'festival'],
      synth: {
        type: 'sawtooth',
        attack: 0.03,
        decay: 0.4,
        sustain: 0.7,
        release: 0.6,
        cutoff: 6000,
        q: 1.5,
        unison: 8,
        detune: 25,
        spread: 0.3,
      },
    },
    {
      id: 'pluck-marimba-hybrid',
      name: 'Marimba Hybrid Pluck',
      type: 'synth',
      category: 'keys',
      tags: ['pluck', 'percussive', 'melodic', 'tropical'],
      synth: {
        type: 'triangle',
        attack: 0.001,
        decay: 0.6,
        sustain: 0.0,
        release: 0.3,
        cutoff: 2000,
        q: 4.0,
        detune: 1,
      },
    },
    // ── BASS ──────────────────────────────────────────
    {
      id: 'reese-bass-neuro',
      name: 'Reese Neuro Bass',
      type: 'synth',
      category: 'bass',
      tags: ['drum-and-bass', 'neurofunk', 'growl', 'dark'],
      synth: {
        type: 'sawtooth',
        attack: 0.01,
        decay: 0.3,
        sustain: 0.8,
        release: 0.5,
        cutoff: 300,
        q: 5.0,
        unison: 3,
        detune: 30,
        spread: 0.2,
      },
    },
    {
      id: 'upright-bass-pro',
      name: 'Upright Bass Pro',
      type: 'sample',
      category: 'bass',
      tags: ['acoustic', 'jazz', 'classical', 'warm', 'pro'],
      sampleQuality: 'studio',
      zones: [
        {
          midiRange: [28, 55],
          url: 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/acoustic_bass-mp3/C3.mp3',
        },
      ],
      articulation: { attack: 0.2, release: 0.5, tone: 0.5, character: 0.6 },
    },
    // ── PERCUSSION ────────────────────────────────────
    {
      id: 'afro-cuban-kit',
      name: 'Afro-Cuban Perc Kit',
      type: 'sample',
      category: 'perc',
      tags: ['latin', 'conga', 'bongo', 'world'],
      sampleQuality: 'high',
      zones: [
        {
          midiRange: [60, 60],
          url: 'https://danigb.github.io/samples/vcsl/Struck%20Membranophones/Conga/Quinto_HitN_v2_rr1_Sum.m4a',
        },
        {
          midiRange: [62, 62],
          url: 'https://danigb.github.io/samples/vcsl/Struck%20Membranophones/Conga/Conga_HitN_v2_rr1_Sum.m4a',
        },
        {
          midiRange: [64, 64],
          url: 'https://danigb.github.io/samples/vcsl/Struck%20Membranophones/Conga/Tumba_HitN_v2_rr1_Sum.m4a',
        },
      ],
    },
    // ── PADS & ATMOS ──────────────────────────────────
    {
      id: 'wavetable-dream',
      name: 'Wavetable Dream Pad',
      type: 'synth',
      category: 'pad',
      tags: ['ambient', 'wavetable', 'evolving', 'cinematic'],
      synth: {
        type: 'sine',
        attack: 2.0,
        decay: 3.0,
        sustain: 0.9,
        release: 5.0,
        cutoff: 2000,
        q: 0.5,
        voices: 5,
        detune: 12,
        spread: 0.35,
      },
    },
    {
      id: 'vhs-memory',
      name: 'VHS Memory Texture',
      type: 'synth',
      category: 'vfx',
      tags: ['lofi', 'nostalgia', 'texture', 'vaporwave'],
      synth: {
        type: 'triangle',
        attack: 0.5,
        decay: 1.0,
        sustain: 0.7,
        release: 2.0,
        cutoff: 1500,
        q: 0.8,
        detune: 7,
      },
    },

    // ═══ 35 VINTAGE + HIGH-QUALITY INSTRUMENT PRESETS ═════════════
    {
      id: 'wurlitzer-200a-ep',
      name: 'Wurlitzer 200A EP',
      type: 'synth',
      category: 'keys',
      tags: ['vintage', 'electric-piano', 'classic', 'soul', 'funk'],
      sampleQuality: 'studio',
      articulation: { attack: 0.05, release: 0.6, tone: 0.5, character: 0.7 },
      synth: {
        type: 'triangle',
        attack: 0.03,
        decay: 0.4,
        sustain: 0.3,
        release: 0.5,
        cutoff: 2500,
        q: 3.5,
        detune: 8,
        voices: 2,
        spread: 0.06,
      },
    },
    {
      id: 'rhodes-mk2-stage',
      name: 'Rhodes Mk II Stage',
      type: 'synth',
      category: 'keys',
      tags: ['vintage', 'electric-piano', 'classic', 'soul', 'jazz'],
      sampleQuality: 'studio',
      articulation: { attack: 0.08, release: 0.7, tone: 0.55, character: 0.65 },
      synth: {
        type: 'sine',
        attack: 0.04,
        decay: 0.5,
        sustain: 0.4,
        release: 0.8,
        cutoff: 2000,
        q: 2.0,
        detune: 5,
        voices: 2,
        spread: 0.04,
      },
    },
    {
      id: 'clavinet-d6',
      name: 'Hohner D6 Clavinet',
      type: 'synth',
      category: 'keys',
      tags: ['vintage', 'clav', 'funk', 'soul', 'percussive'],
      sampleQuality: 'high',
      synth: {
        type: 'square',
        attack: 0.002,
        decay: 0.15,
        sustain: 0.2,
        release: 0.15,
        cutoff: 4000,
        q: 5.0,
        detune: 2,
      },
    },
    {
      id: 'dx7-electric-piano',
      name: 'DX7 Classic EP',
      type: 'synth',
      category: 'keys',
      tags: ['fm', 'classic', '80s', 'electronic', 'studio'],
      synth: {
        type: 'sine',
        attack: 0.001,
        decay: 0.4,
        sustain: 0.1,
        release: 0.3,
        cutoff: 3500,
        q: 1.5,
        detune: 5,
      },
    },
    {
      id: 'mellotron-m400-strings',
      name: 'Mellotron M400 Strings',
      type: 'hybrid',
      category: 'keys',
      tags: ['vintage', 'mellotron', 'tape', '70s', 'progressive'],
      sampleQuality: 'studio',
      zones: [
        {
          midiRange: [48, 84],
          url: 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/string_ensemble_1-mp3/C4.mp3',
        },
      ],
      synth: {
        type: 'sawtooth',
        attack: 0.4,
        decay: 1.0,
        sustain: 0.8,
        release: 1.5,
        cutoff: 1200,
        q: 0.5,
        detune: 8,
      },
      articulation: { attack: 0.4, release: 1.0, tone: 0.5, character: 0.85 },
    },
    {
      id: 'mellotron-m400-choir',
      name: 'Mellotron M400 Choir',
      type: 'sample',
      category: 'choir',
      tags: ['vintage', 'mellotron', 'tape', 'vocal', 'epic'],
      sampleQuality: 'studio',
      zones: [
        {
          midiRange: [48, 84],
          url: 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/choir_aahs-mp3/C4.mp3',
        },
      ],
      articulation: { attack: 0.5, release: 1.2, tone: 0.6, character: 0.9 },
    },
    {
      id: 'mellotron-m400-flute',
      name: 'Mellotron M400 Flute',
      type: 'sample',
      category: 'woodwind',
      tags: ['vintage', 'mellotron', 'tape', '70s', 'gentle'],
      sampleQuality: 'high',
      zones: [
        {
          midiRange: [55, 91],
          url: 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/flute-mp3/C4.mp3',
        },
      ],
      articulation: { attack: 0.15, release: 0.5, tone: 0.7, character: 0.5 },
    },
    {
      id: 'minimoog-model-d-lead',
      name: 'Minimoog Model D Lead',
      type: 'synth',
      category: 'lead',
      tags: ['vintage', 'analog', 'mono', 'classic', 'fat'],
      synth: {
        type: 'sawtooth',
        attack: 0.005,
        decay: 0.4,
        sustain: 0.4,
        release: 0.5,
        cutoff: 1200,
        q: 6.0,
        unison: 3,
        detune: 8,
        spread: 0.18,
      },
    },
    {
      id: 'minimoog-model-d-bass',
      name: 'Minimoog Model D Bass',
      type: 'synth',
      category: 'bass',
      tags: ['vintage', 'analog', 'mono', 'classic', 'warm'],
      synth: {
        type: 'sawtooth',
        attack: 0.005,
        decay: 0.5,
        sustain: 0.6,
        release: 0.4,
        cutoff: 350,
        q: 4.0,
        unison: 2,
        detune: 4,
      },
    },
    {
      id: 'prophet5-rev3',
      name: 'Sequential Prophet-5 Rev 3',
      type: 'synth',
      category: 'keys',
      tags: ['vintage', 'analog', 'poly', '80s', 'punchy'],
      synth: {
        type: 'sawtooth',
        attack: 0.02,
        decay: 0.4,
        sustain: 0.7,
        release: 0.5,
        cutoff: 2200,
        q: 2.0,
        unison: 2,
        detune: 9,
        spread: 0.1,
      },
    },
    {
      id: 'jupiter-8-strings',
      name: 'Roland Jupiter-8 Strings',
      type: 'synth',
      category: 'pad',
      tags: ['vintage', 'analog', 'poly', '80s', 'lush'],
      synth: {
        type: 'sawtooth',
        attack: 0.4,
        decay: 1.5,
        sustain: 0.85,
        release: 2.0,
        cutoff: 1800,
        q: 0.6,
        unison: 4,
        detune: 14,
        spread: 0.25,
      },
    },
    {
      id: 'jupiter-8-brass-lead',
      name: 'Roland Jupiter-8 Lead',
      type: 'synth',
      category: 'lead',
      tags: ['vintage', 'analog', 'poly', '80s', 'anthem'],
      synth: {
        type: 'sawtooth',
        attack: 0.03,
        decay: 0.3,
        sustain: 0.8,
        release: 0.4,
        cutoff: 4500,
        q: 1.8,
        unison: 4,
        detune: 22,
        spread: 0.3,
      },
    },
    {
      id: 'ob-xa-strings',
      name: 'Oberheim OB-Xa Strings',
      type: 'synth',
      category: 'strings',
      tags: ['vintage', 'analog', 'poly', 'early-80s', 'cinematic'],
      synth: {
        type: 'sawtooth',
        attack: 0.5,
        decay: 1.0,
        sustain: 0.85,
        release: 1.8,
        cutoff: 1600,
        q: 0.7,
        unison: 2,
        detune: 11,
        spread: 0.22,
      },
    },
    {
      id: 'ms20-squelchy-lead',
      name: 'Korg MS-20 Squelchy Lead',
      type: 'synth',
      category: 'lead',
      tags: ['vintage', 'analog', 'mono', 'squelchy', 'punk'],
      synth: {
        type: 'square',
        attack: 0.005,
        decay: 0.2,
        sustain: 0.7,
        release: 0.3,
        cutoff: 600,
        q: 7.0,
        unison: 1,
      },
    },
    {
      id: 'arp-2600-bass',
      name: 'ARP 2600 Bass',
      type: 'synth',
      category: 'bass',
      tags: ['vintage', 'analog', 'modular', 'glide', 'cinematic'],
      synth: {
        type: 'sawtooth',
        attack: 0.01,
        decay: 0.5,
        sustain: 0.8,
        release: 0.6,
        cutoff: 500,
        q: 5.0,
        unison: 2,
        detune: 18,
        spread: 0.15,
      },
    },
    {
      id: 'ondes-martenot',
      name: 'Ondes Martenot',
      type: 'synth',
      category: 'lead',
      tags: ['vintage', 'etheral', 'expression', 'cinematic', 'expressive'],
      synth: {
        type: 'sine',
        attack: 0.2,
        decay: 0.4,
        sustain: 0.9,
        release: 1.5,
        cutoff: 3000,
        q: 2.0,
        detune: 20,
      },
    },
    {
      id: 'vox-continental-ii',
      name: 'Vox Continental II',
      type: 'synth',
      category: 'organ',
      tags: ['vintage', 'organ', '60s', 'invasion', 'beatles'],
      synth: {
        type: 'square',
        attack: 0.02,
        decay: 0.1,
        sustain: 1.0,
        release: 0.2,
        cutoff: 3500,
        q: 1.8,
        unison: 2,
        detune: 2,
        spread: 0.05,
      },
    },
    {
      id: 'farfisa-compact',
      name: 'Farfisa Compact Combo',
      type: 'synth',
      category: 'organ',
      tags: ['vintage', 'organ', '60s', 'psychedelic', 'moody'],
      synth: {
        type: 'sawtooth',
        attack: 0.03,
        decay: 0.15,
        sustain: 0.95,
        release: 0.3,
        cutoff: 2200,
        q: 2.2,
        unison: 2,
        detune: 1,
      },
    },
    {
      id: 'solina-string-ensemble',
      name: 'Solina String Ensemble',
      type: 'hybrid',
      category: 'strings',
      tags: ['vintage', 'ensemble', '70s', 'cosmic', 'progressive'],
      sampleQuality: 'studio',
      zones: [
        {
          midiRange: [36, 96],
          url: 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/violin-mp3/C4.mp3',
        },
      ],
      synth: {
        type: 'sawtooth',
        attack: 0.5,
        decay: 1.5,
        sustain: 0.85,
        release: 2.0,
        cutoff: 1800,
        q: 0.6,
        detune: 12,
        spread: 0.2,
      },
      articulation: { attack: 0.6, release: 1.4, tone: 0.5, character: 0.9 },
    },
    {
      id: 'steinway-d-concert-grand',
      name: 'Steinway D Concert Grand',
      type: 'sample',
      category: 'piano',
      tags: ['high-quality', 'concert', 'grand', 'recital', 'professional'],
      sampleQuality: 'studio',
      zones: [
        {
          midiRange: [21, 108],
          url: 'https://tonejs.github.io/audio/salamander/A1.mp3',
        },
        {
          midiRange: [21, 108],
          url: 'https://tonejs.github.io/audio/salamander/C4.mp3',
        },
      ],
      articulation: { attack: 0.04, release: 0.7, tone: 0.85, character: 0.6 },
    },
    {
      id: 'bosendorfer-imperial-290',
      name: 'Boesendorfer Imperial 290',
      type: 'sample',
      category: 'piano',
      tags: ['high-quality', 'grand', 'vienna', 'warm', 'romantic'],
      sampleQuality: 'studio',
      zones: [
        {
          midiRange: [27, 108],
          url: 'https://tonejs.github.io/audio/salamander/C4.mp3',
        },
      ],
      articulation: { attack: 0.05, release: 0.8, tone: 0.8, character: 0.5 },
    },
    {
      id: 'yamaha-c7-studio',
      name: 'Yamaha C7 Studio Grand',
      type: 'sample',
      category: 'piano',
      tags: ['high-quality', 'studio', 'grand', 'jazz', 'contemporary'],
      sampleQuality: 'high',
      zones: [
        {
          midiRange: [21, 108],
          url: 'https://tonejs.github.io/audio/salamander/A2.mp3',
        },
      ],
    },
    {
      id: 'steinway-upright-pro',
      name: 'Steinway Studio Upright',
      type: 'sample',
      category: 'piano',
      tags: ['high-quality', 'upright', 'ballad', 'intimate', 'pro'],
      sampleQuality: 'high',
      zones: [
        {
          midiRange: [33, 96],
          url: 'https://tonejs.github.io/audio/salamander/A3.mp3',
        },
      ],
    },
    {
      id: 'gibson-les-paul-59',
      name: "Gibson Les Paul '59",
      type: 'synth',
      category: 'guitar',
      tags: ['vintage', 'electric', 'classic-rock', 'rock'],
      sampleQuality: 'studio',
      articulation: { attack: 0.02, release: 0.6, tone: 0.7, character: 0.85 },
      synth: {
        type: 'sawtooth',
        attack: 0.005,
        decay: 0.3,
        sustain: 0.4,
        release: 0.4,
        cutoff: 3500,
        q: 6.0,
        unison: 2,
        detune: 10,
        spread: 0.12,
      },
      defaultFx: [
        {
          id: 'dist-gibson',
          type: 'distortion',
          params: { drive: 0.7, tone: 0.5 },
          enabled: true,
          mix: 0.8,
        },
      ],
    },
    {
      id: 'fender-stratocaster-65',
      name: 'Fender Stratocaster 65',
      type: 'synth',
      category: 'guitar',
      tags: ['vintage', 'electric', 'clean', 'versatile', 'blues'],
      sampleQuality: 'high',
      synth: {
        type: 'triangle',
        attack: 0.003,
        decay: 0.2,
        sustain: 0.3,
        release: 0.2,
        cutoff: 5000,
        q: 2.0,
        voices: 2,
        detune: 6,
        spread: 0.05,
      },
    },
    {
      id: 'rickenbacker-360-12',
      name: 'Rickenbacker 360 12-String',
      type: 'synth',
      category: 'guitar',
      tags: ['vintage', 'electric', '12-string', 'jangle', '60s'],
      sampleQuality: 'high',
      synth: {
        type: 'triangle',
        attack: 0.002,
        decay: 0.3,
        sustain: 0.2,
        release: 0.3,
        cutoff: 6000,
        q: 1.5,
        voices: 2,
        unison: 2,
        detune: 18,
        spread: 0.2,
      },
    },
    {
      id: 'music-man-stingray-bass',
      name: 'Music Man StingRay Bass',
      type: 'synth',
      category: 'bass',
      tags: ['vintage', 'electric-bass', 'funk', 'rock', 'punchy'],
      sampleQuality: 'studio',
      synth: {
        type: 'sawtooth',
        attack: 0.003,
        decay: 0.3,
        sustain: 0.6,
        release: 0.3,
        cutoff: 400,
        q: 5.0,
        detune: 5,
      },
    },
    {
      id: 'fender-precision-1972',
      name: 'Fender Precision Bass 72',
      type: 'sample',
      category: 'bass',
      tags: ['vintage', 'electric-bass', 'classic', 'soul'],
      sampleQuality: 'high',
      zones: [
        {
          midiRange: [28, 64],
          url: 'https://tonejs.github.io/audio/casio/A1.mp3',
        },
      ],
    },
    {
      id: 'stone-marimba',
      name: 'Stone Marimba',
      type: 'synth',
      category: 'perc',
      tags: ['high-quality', 'acoustic', 'percussive', 'meditative', 'exotic'],
      sampleQuality: 'high',
      synth: {
        type: 'triangle',
        attack: 0.001,
        decay: 0.5,
        sustain: 0.0,
        release: 0.4,
        cutoff: 4000,
        q: 4.0,
        detune: 2,
      },
    },
    {
      id: 'glass-marimba',
      name: 'Glass Marimba',
      type: 'synth',
      category: 'perc',
      tags: ['high-quality', 'crystal', 'sparkle', 'cinematic', 'delicate'],
      sampleQuality: 'high',
      synth: {
        type: 'sine',
        attack: 0.001,
        decay: 0.6,
        sustain: 0.0,
        release: 0.6,
        cutoff: 5000,
        q: 2.0,
        detune: 3,
        voices: 2,
      },
    },
    {
      id: 'celeste-classic',
      name: 'Celeste Classic',
      type: 'synth',
      category: 'keys',
      tags: ['vintage', 'celesta', 'bell-like', 'classical', 'glass'],
      sampleQuality: 'high',
      synth: {
        type: 'sine',
        attack: 0.002,
        decay: 0.7,
        sustain: 0.0,
        release: 0.8,
        cutoff: 4500,
        q: 1.5,
        detune: 4,
        voices: 2,
      },
    },
    {
      id: 'tubular-bells',
      name: 'Tubular Bells',
      type: 'synth',
      category: 'perc',
      tags: ['high-quality', 'orchestral', 'cinematic', 'epic'],
      sampleQuality: 'studio',
      synth: {
        type: 'sine',
        attack: 0.002,
        decay: 1.5,
        sustain: 0.1,
        release: 2.0,
        cutoff: 3000,
        q: 1.0,
        voices: 2,
        detune: 6,
      },
    },
    {
      id: 'hang-drum-handpan',
      name: 'Hang Drum / HandPan',
      type: 'synth',
      category: 'perc',
      tags: ['modern-vintage', 'meditative', 'acoustic', 'calming', 'world'],
      sampleQuality: 'high',
      synth: {
        type: 'sine',
        attack: 0.008,
        decay: 0.5,
        sustain: 0.2,
        release: 1.0,
        cutoff: 2000,
        q: 3.0,
        voices: 2,
        detune: 3,
      },
    },
    {
      id: 'hammered-dulcimer',
      name: 'Hammered Dulcimer',
      type: 'synth',
      category: 'perc',
      tags: ['high-quality', 'folk', 'acoustic', 'celtic', 'lush'],
      sampleQuality: 'high',
      synth: {
        type: 'triangle',
        attack: 0.002,
        decay: 0.6,
        sustain: 0.1,
        release: 0.8,
        cutoff: 5000,
        q: 3.0,
        detune: 8,
        voices: 2,
      },
    },
    {
      id: 'autoharp-vintage',
      name: 'Autoharp (Vintage)',
      type: 'synth',
      category: 'keys',
      tags: ['vintage', 'folk', 'strummed', 'acoustic-sim', 'country'],
      synth: {
        type: 'triangle',
        attack: 0.005,
        decay: 0.4,
        sustain: 0.3,
        release: 0.5,
        cutoff: 3000,
        q: 2.0,
        detune: 12,
        unison: 4,
        spread: 0.3,
      },
    },
    {
      id: 'tibetan-singing-bowl',
      name: 'Tibetan Singing Bowl',
      type: 'synth',
      category: 'world',
      tags: ['high-quality', 'meditative', 'sustained', 'drone', 'spiritual'],
      synth: {
        type: 'sine',
        attack: 1.5,
        decay: 2.5,
        sustain: 0.9,
        release: 6.0,
        cutoff: 1500,
        q: 0.4,
        detune: 8,
        unison: 3,
        spread: 0.4,
      },
    },
    {
      id: 'tabla-classic',
      name: 'Tabla Classic',
      type: 'synth',
      category: 'perc',
      tags: ['high-quality', 'indian', 'percussive', 'hand-played'],
      sampleQuality: 'high',
      synth: {
        type: 'triangle',
        attack: 0.001,
        decay: 0.3,
        sustain: 0.0,
        release: 0.2,
        cutoff: 3000,
        q: 6.0,
      },
    },
  ];

  getPresets() {
    return this.presets;
  }

  /** Shared by audition, playback and offline exports. */
  private previewBuffers = new Map<string, AudioBuffer>();
  private pendingBuffers = new Map<string, Promise<AudioBuffer | null>>();

  /** Select the closest matching root for overlapping zones, then a velocity layer. */
  private sampleFor(presetId: string, midi: number, velocity: number) {
    const preset = this.presets.find((p) => p.id === presetId);
    if (!preset || (preset.type !== 'sample' && preset.type !== 'hybrid')) return null;
    const zones = (preset.zones ?? []).filter(
      (zone) => midi >= zone.midiRange[0] && midi <= zone.midiRange[1],
    );
    zones.sort((a, b) => Math.abs(midi - sampleZoneRoot(a)) - Math.abs(midi - sampleZoneRoot(b)));
    const zone = zones[0];
    if (!zone) return null;
    const layers = [...(zone.velLayers ?? [])].sort((a, b) => a.threshold - b.threshold);
    const velocity127 = Math.max(0, Math.min(127, velocity * 127));
    const layer = layers.find((l) => velocity127 <= l.threshold) ?? layers[layers.length - 1];
    return { preset, zone, url: layer?.url ?? zone.url, rootNote: sampleZoneRoot(zone) };
  }

  isSamplePreset(presetId: string): boolean {
    const preset = this.presets.find((p) => p.id === presetId);
    return !!preset && (preset.type === 'sample' || preset.type === 'hybrid') && !!preset.zones?.length;
  }

  async loadPresetSample(presetId: string, midi: number, velocity: number): Promise<void> {
    const selection = this.sampleFor(presetId, midi, velocity);
    if (!selection) throw new Error(`No sample zone for MIDI ${midi} in “${presetId}”.`);
    const buffer = await this.loadPreviewBuffer(selection.url) ??
      (selection.url !== selection.zone.url ? await this.loadPreviewBuffer(selection.zone.url) : null);
    if (!buffer) throw new Error(`Sample for MIDI ${midi} in “${selection.preset.name}” could not be loaded.`);
  }

  getPresetSample(presetId: string, midi: number, velocity: number, pitchBend = 0) {
    const selection = this.sampleFor(presetId, midi, velocity);
    if (!selection) return null;
    const buffer = this.previewBuffers.get(selection.url) ?? this.previewBuffers.get(selection.zone.url);
    if (!buffer) return null;
    return {
      buffer,
      rate: Math.pow(2, (midi + pitchBend - selection.rootNote) / 12),
      oneShot: selection.preset.category === 'drum' || selection.preset.category === 'perc',
      release: selection.preset.articulation?.release ?? 0.05,
    };
  }

  /**
   * The note an instrument should audition at.
   *
   * A caller can name the note (the performance pads do — a snare must play
   * its snare zone, not the kit's lowest note). With no note requested, basses
   * and kick-bearing kits play low and melodic instruments play middle C; if
   * that note is not mapped by a sampled instrument, the nearest zone root is
   * used so an audition is never silent.
   */
  private previewNoteFor(
    preset: InstrumentPreset,
    requestedNote?: number,
  ): number {
    const wanted = Number.isFinite(requestedNote)
      ? Math.round(requestedNote as number)
      : null;
    const zones = preset.zones ?? [];

    if (zones.length > 0) {
      if (wanted !== null) {
        const exact = zones.find(
          (zone) => wanted >= zone.midiRange[0] && wanted <= zone.midiRange[1],
        );
        if (exact) return wanted;
        // A pad assigned to a kit with different note names still has to
        // sound: fall back to the closest declared zone instead of silence.
        const nearest = [...zones].sort(
          (a, b) =>
            Math.abs(sampleZoneRoot(a) - wanted) -
            Math.abs(sampleZoneRoot(b) - wanted),
        )[0];
        return sampleZoneRoot(nearest);
      }
      const fallback =
        preset.category === 'bass' || preset.category === 'drum' ? 36 : 60;
      const mapped = zones.find(
        (zone) =>
          fallback >= zone.midiRange[0] && fallback <= zone.midiRange[1],
      );
      return mapped ? fallback : sampleZoneRoot(zones[0]);
    }

    if (wanted !== null) return wanted;
    if (preset.category === 'bass') return 36;
    if (preset.category === 'drum') return 36;
    return 60;
  }

  /** Decode (and cache) a preset sample without pulling in HttpClient. */
  private async loadPreviewBuffer(url: string): Promise<AudioBuffer | null> {
    const cached = this.previewBuffers.get(url);
    if (cached) return cached;
    const pending = this.pendingBuffers.get(url);
    if (pending) return pending;
    const load = (async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) return null;
        const bytes = await response.arrayBuffer();
        const buffer = await this.audioEngine.ctx.decodeAudioData(bytes.slice(0));
        if (!buffer || !(buffer.duration > 0)) return null;
        this.previewBuffers.set(url, buffer);
        return buffer;
      } catch {
        return null;
      }
    })();
    this.pendingBuffers.set(url, load);
    try {
      return await load;
    } finally {
      this.pendingBuffers.delete(url);
    }
  }

  /**
   * One-shot preview of a preset.
   *
   * Everything here used to be a bare oscillator: sample presets auditioned
   * as a fixed 440 Hz sine (the oscillator was never given the sample or even
   * a frequency), and synth presets ignored their own attack/decay/sustain/
   * release and filter. So "Audition" on a grand piano or an 808 kit played a
   * beep, and two different presets were indistinguishable. Sample presets now
   * play the sample they declare (falling back to their category patch when a
   * sample cannot be fetched), and synth presets play their own patch through
   * the same voice builder the arrangement uses.
   */
  async audition(presetId: string, requestedNote?: number) {
    const preset = this.presets.find((p) => p.id === presetId);
    if (!preset) return;

    const ctx = this.audioEngine.ctx;
    if (!ctx) return;
    await this.audioEngine.resume();

    const note = this.previewNoteFor(preset, requestedNote);
    const freq = 440 * Math.pow(2, (note - 69) / 12);

    if ((preset.type === 'sample' || preset.type === 'hybrid') && preset.zones?.length) {
      try {
        await this.loadPresetSample(presetId, note, 0.9);
      } catch {
        // Audition retains its synth fallback when a sample is unavailable.
      }
      const sample = this.getPresetSample(presetId, note, 0.9);
      if (sample) {
        const { buffer, rate: playbackRate } = sample;
        this.audioEngine.triggerSampler(
          'preview',
          buffer,
          this.audioEngine.ctx.currentTime,
          0.9,
          0,
          Math.min(2.5, Math.max(0.35, buffer.duration)),
          playbackRate,
        );
        return;
      }
    }

    const params = preset.synth
      ? {
          ...preset.synth,
          oscillator: preset.synth.type,
          type: preset.synth.type,
          q: preset.synth.resonance ?? preset.synth.q,
        }
      : synthParamsForPreset(preset);

    this.audioEngine.triggerAttack(
      'preview',
      freq,
      this.audioEngine.ctx.currentTime,
      0.85,
      0.9,
      1,
      0,
      0,
      0,
      params,
    );
  }
}
