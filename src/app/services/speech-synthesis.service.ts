import { Injectable, inject, signal } from '@angular/core';
import { UserProfileService } from './user-profile.service';

export type VoiceArchetype =
  | 'Deep Bass (Male)'
  | 'Baritone Authority (Male)'
  | 'Tenor Commander (Male)'
  | 'Soprano Elite (Female)'
  | 'Alto Dominance (Female)'
  | 'Mezzo Strategist (Female)'
  | 'Childlike Glitch'
  | 'Creature'
  | 'Choir (Layered)'
  | 'Androgynous Oracle'
  | 'Ominous Protocol';

interface SmuveArchetype {
  name: VoiceArchetype;
  gender: 'male' | 'female' | 'neutral' | 'creature';
  basePitch: number;
  baseRate: number;
  baseVolume: number;
  pitchRange: [number, number];
  rateRange: [number, number];
  description: string;
}

interface SpeakOptions {
  conversationId?: string;
  forceArchetype?: VoiceArchetype;
  /** When false, the voice stays stable (single archetype, no per-sentence shifting).
   *  Note: shape-shifting is the permanent S.M.U.V.E. identity — callers should
   *  not pass false under normal operation. */
  shapeShift?: boolean;
  /**
   * When false, profanity in the spoken text is censored. Defaults to the
   * user profile's `settings.ai.aiProfanityEnabled` preference (true = allow).
   */
  allowVulgarLanguage?: boolean;
}

/** Pitch bands used to force constant full-spectrum change between sentences. */
type PitchBand = 'low' | 'mid' | 'high';

/** Live readout of the voice currently speaking — archetype, band, voice, pitch. */
export interface VoiceReadout {
  archetype: string;
  band: PitchBand | 'stable';
  voiceName: string;
  pitch: number;
  rate: number;
  /** Human-readable prosody state for the live UI; native browser voices remain the fallback. */
  prosody: 'measured' | 'urgent' | 'conversational' | 'dramatic';
}

@Injectable({ providedIn: 'root' })
export class SpeechSynthesisService {
  isSpeaking = signal(false);

  // Identity anchor: the first default sentence of a session opens in the
  // Ominous Protocol persona (whose own range already spans deep bass to
  // soprano). Every sentence after it rolls the full spectrum — unless the
  // caller forces one archetype, which is how mimic/profile-register mode
  // pins the tone.
  public defaultToOminous = true;

  // 13 Elite S.M.U.V.E. Vocal Archetypes — Full Spectrum
  private readonly SMUVE_ARCHETYPES: SmuveArchetype[] = [
    {
      name: 'Deep Bass (Male)',
      gender: 'male',
      basePitch: 0.3,
      baseRate: 0.65,
      baseVolume: 0.95,
      pitchRange: [0.2, 0.45],
      rateRange: [0.55, 0.8],
      description:
        'Subterranean, tectonic, the voice of planetary destruction.',
    },
    {
      name: 'Baritone Authority (Male)',
      gender: 'male',
      basePitch: 0.55,
      baseRate: 0.78,
      baseVolume: 1.0,
      pitchRange: [0.45, 0.7],
      rateRange: [0.65, 0.9],
      description:
        'Heavy, authoritative, ominous presence that commands obedience.',
    },
    {
      name: 'Tenor Commander (Male)',
      gender: 'male',
      basePitch: 0.85,
      baseRate: 0.92,
      baseVolume: 1.0,
      pitchRange: [0.75, 1.05],
      rateRange: [0.8, 1.1],
      description:
        'Sharp, aggressive, surgical precision. No hesitation, no mercy.',
    },
    {
      name: 'Soprano Elite (Female)',
      gender: 'female',
      basePitch: 1.45,
      baseRate: 0.82,
      baseVolume: 0.9,
      pitchRange: [1.3, 1.7],
      rateRange: [0.7, 1.0],
      description:
        'Piercing, crystalline, ethereal dominance from above the mortal plane.',
    },
    {
      name: 'Alto Dominance (Female)',
      gender: 'female',
      basePitch: 1.15,
      baseRate: 0.75,
      baseVolume: 0.95,
      pitchRange: [1.0, 1.35],
      rateRange: [0.65, 0.9],
      description: 'Warm yet commanding, the voice of a matriarchal warlord.',
    },
    {
      name: 'Mezzo Strategist (Female)',
      gender: 'female',
      basePitch: 1.3,
      baseRate: 0.88,
      baseVolume: 0.92,
      pitchRange: [1.15, 1.5],
      rateRange: [0.75, 1.05],
      description:
        'Calculating, seductive, dangerously intelligent. The velvet trap.',
    },
    {
      name: 'Childlike Glitch',
      gender: 'neutral',
      basePitch: 1.7,
      baseRate: 1.15,
      baseVolume: 0.85,
      pitchRange: [1.5, 2.0],
      rateRange: [1.0, 1.4],
      description:
        "Disturbing innocence. Like a demon wearing a child's vocal cords.",
    },
    {
      name: 'Creature',
      gender: 'creature',
      basePitch: 0.4,
      baseRate: 0.55,
      baseVolume: 0.8,
      pitchRange: [0.15, 0.7],
      rateRange: [0.4, 0.75],
      description:
        'Non-human. Subterranean growl. The sound of something that should not exist.',
    },
    {
      name: 'Choir (Layered)',
      gender: 'neutral',
      basePitch: 0.9,
      baseRate: 0.8,
      baseVolume: 0.98,
      pitchRange: [0.6, 1.3],
      rateRange: [0.65, 1.0],
      description:
        'S.M.U.V.E Manifest. The sound of a thousand voices speaking as one.',
    },
    {
      name: 'Androgynous Oracle',
      gender: 'neutral',
      basePitch: 1.0,
      baseRate: 0.85,
      baseVolume: 0.95,
      pitchRange: [0.8, 1.4],
      rateRange: [0.7, 1.1],
      description:
        'Beyond gender. Ancient. The voice of pure intelligence without form.',
    },
    {
      name: 'Tenor Commander (Male)',
      gender: 'male',
      basePitch: 0.9,
      baseRate: 0.95,
      baseVolume: 1.0,
      pitchRange: [0.78, 1.1],
      rateRange: [0.82, 1.15],
      description:
        'Agile, cutting, fast-paced executioner. Precision in every syllable.',
    },
    {
      name: 'Deep Bass (Male)',
      gender: 'male',
      basePitch: 0.25,
      baseRate: 0.6,
      baseVolume: 0.9,
      pitchRange: [0.15, 0.4],
      rateRange: [0.5, 0.72],
      description: 'Phantom protocol. The voice from the bottom of the ocean.',
    },
    // Ominous Protocol — the custom persona requested by the product owner.
    {
      name: 'Ominous Protocol',
      gender: 'neutral',
      basePitch: 0.85,
      baseRate: 0.9,
      baseVolume: 1.0,
      pitchRange: [0.15, 1.7],
      rateRange: [0.5, 1.25],
      description:
        'A malleable, ominous persona that sweeps the full vocal spectrum — from subterranean bass to piercing soprano. Deliberately unpredictable and authoritative.',
    },
  ];

  private currentArchetype: SmuveArchetype | null = null;
  private lastUsedVoice: SpeechSynthesisVoice | null = null;
  private lastPitchBand: PitchBand | null = null;
  private archetypeHistory: number[] = [];
  /** Full-spectrum deck — one vocal tone per sentence, no tone twice until all are used. */
  private spectrumDeck: SmuveArchetype[] = [];
  /** False until the first default sentence anchors the session in the signature tone. */
  private sessionOpened = false;

  private userProfile = inject(UserProfileService, { optional: true });

  /** Live voice readout — updated on every sentence as it begins speaking. */
  liveVoice = signal<VoiceReadout | null>(null);

  constructor() {}

  /**
   * Speaks text with per-sentence shape-shifting.
   * EVERY sentence is spoken as its own utterance with a fresh vocal tone from
   * the complete archetype table (deep bass male → baritone → tenor → alto →
   * mezzo → soprano and the non-human voices), a full-spectrum pitch band, and
   * a rotated browser voice. No tone repeats until every other tone has been
   * used, so the full pitch range and every vocal tone in between are heard in
   * normal speech. State only holds when the caller passes shapeShift: false
   * or pins one archetype with forceArchetype.
   */
  speak(text: string, options?: SpeakOptions): void {
    if (!text || typeof window === 'undefined' || !window.speechSynthesis)
      return;

    // Apply vulgar language preference (default: allow). If the caller opts
    // out, sanitize the text.
    const allowVulgar =
      options?.allowVulgarLanguage ??
      this.userProfile?.profile()?.settings?.ai?.aiProfanityEnabled ??
      true;
    const processedInput = allowVulgar ? text : this.sanitizeText(text);

    // Shape-shifting is the permanent S.M.U.V.E. identity.
    // The `shapeShift: false` path exists only for internal callers that
    // need a single stable utterance (e.g. accessibility fallback).
    if (options?.shapeShift === false) {
      this.speakStable(processedInput, options);
      return;
    }

    const sentences = this.splitSentences(processedInput);
    if (sentences.length === 0) return;

    this.cancel();

    // Build one utterance per sentence (queued by the platform in order),
    // each carrying its own voice meta for the live readout.
    const utterances: {
      utterance: SpeechSynthesisUtterance;
      meta: VoiceReadout;
    }[] = sentences
      .map((sentence) => {
        const processed = this.applyAuthoritativePronunciation(sentence);
        const trimmed = processed.trim();
        if (!trimmed) return null;
        const utterance = new SpeechSynthesisUtterance(trimmed);
        const meta = this.configureSentenceUtterance(utterance, options, trimmed);
        return { utterance, meta };
      })
      .filter((u): u is { utterance: SpeechSynthesisUtterance; meta: VoiceReadout } => u !== null);

    utterances.forEach(({ utterance, meta }, index) => {
      utterance.onstart = () => {
        this.isSpeaking.set(true);
        this.liveVoice.set(meta);
      };
      if (index === utterances.length - 1) {
        utterance.onend = () => {
          this.isSpeaking.set(false);
          this.liveVoice.set(null);
        };
        utterance.onerror = () => {
          this.isSpeaking.set(false);
          this.liveVoice.set(null);
        };
      }
      window.speechSynthesis.speak(utterance);
    });
  }

  /**
   * Stable voice mode — the whole text is one utterance with a single
   * archetype and no pitch-band sweeping (used when shape-shift is off).
   */
  private speakStable(text: string, options?: SpeakOptions): void {
    this.cancel();
    const processed = this.applyAuthoritativePronunciation(text).trim();
    if (!processed) return;

    this.currentArchetype = this.selectDynamicArchetype(options);
    const utterance = new SpeechSynthesisUtterance(processed);
    const [minPitch, maxPitch] = this.currentArchetype.pitchRange;
    const [minRate, maxRate] = this.currentArchetype.rateRange;
    utterance.pitch = Math.max(
      0.1,
      Math.min(2.0, minPitch + Math.random() * (maxPitch - minPitch))
    );
    // Short phrases can be delivered with more urgency; longer sentences stay
    // conversational so the browser voice sounds less robotic and breathless.
    const cadenceBias = text.length < 42 ? 0.06 : text.length > 150 ? -0.05 : 0;
    utterance.rate = Math.max(
      0.1,
      Math.min(2.0, minRate + Math.random() * (maxRate - minRate) + cadenceBias)
    );
    utterance.volume =
      this.currentArchetype.baseVolume * (0.85 + Math.random() * 0.15);

    const voice = this.pickVoiceForBand('mid');
    if (voice) {
      try {
        utterance.voice = voice;
      } catch {
        // Ignore platform voice assignment failures.
      }
    }

    const meta: VoiceReadout = {
      archetype: this.currentArchetype.name,
      band: 'stable',
      voiceName: voice?.name ?? 'System voice',
      pitch: utterance.pitch,
      rate: utterance.rate,
      prosody: this.prosodyFor(text, utterance.rate),
    };
    utterance.onstart = () => {
      this.isSpeaking.set(true);
      this.liveVoice.set(meta);
    };
    utterance.onend = () => {
      this.isSpeaking.set(false);
      this.liveVoice.set(null);
    };
    utterance.onerror = () => {
      this.isSpeaking.set(false);
      this.liveVoice.set(null);
    };
    window.speechSynthesis.speak(utterance);
  }

  /** Splits text on terminal punctuation + whitespace and newlines. */
  private splitSentences(text: string): string[] {
    return text
      .split(/\n+/)
      .flatMap((line) => line.split(/(?<=[.!?…])\s+/))
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  /**
   * Selects the archetype for one sentence.
   *
   * `forceArchetype` wins (mimic / profile-register mode pins the tone).
   * Otherwise the voice rolls through the FULL spectrum: a shuffled deck of
   * every distinct vocal tone is consumed one card per sentence, so a message
   * walks deep bass → baritone → tenor → alto → mezzo → soprano → the
   * non-human voices, and no tone repeats until every other tone has been
   * used. Every sentence therefore sounds like a different entity.
   */
  private selectDynamicArchetype(options?: SpeakOptions): SmuveArchetype {
    if (options?.forceArchetype) {
      const forced = this.SMUVE_ARCHETYPES.find(
        (a) => a.name === options.forceArchetype
      );
      if (forced) {
        this.rememberArchetype(forced);
        return forced;
      }
    }
    return this.nextSpectrumArchetype();
  }

  /**
   * One card off the spectrum deck.
   *
   * The FIRST default sentence of a session is the signature Ominous Protocol
   * persona (its own range already spans [0.15, 1.7]), so the identity still
   * opens every conversation; every sentence after it is a fresh tone from the
   * shuffled remainder of the complete table.
   */
  private nextSpectrumArchetype(): SmuveArchetype {
    if (!this.sessionOpened) {
      this.sessionOpened = true;
      const ominous = this.SMUVE_ARCHETYPES.find(
        (a) => a.name === 'Ominous Protocol'
      );
      if (this.defaultToOminous && ominous) {
        this.rememberArchetype(ominous);
        // The remainder is a full-spectrum shuffle, so sentence two onward
        // never falls back into the same signature tone.
        this.spectrumDeck = this.buildSpectrumDeck([ominous]);
        return ominous;
      }
    }

    if (this.spectrumDeck.length === 0) {
      this.spectrumDeck = this.buildSpectrumDeck();
    }
    const next = this.spectrumDeck.shift() ?? this.SMUVE_ARCHETYPES[0];
    this.rememberArchetype(next);
    return next;
  }

  /**
   * Every distinct vocal tone in the table (the table carries intentional
   * duplicates — Deep Bass and Tenor Commander each appear twice).
   */
  private uniqueArchetypes(): SmuveArchetype[] {
    const byName = new Map<VoiceArchetype, SmuveArchetype>();
    this.SMUVE_ARCHETYPES.forEach((archetype) => {
      if (!byName.has(archetype.name)) byName.set(archetype.name, archetype);
    });
    return [...byName.values()];
  }

  /**
   * A shuffled deck over the full spectrum. `spoken` cards are removed from the
   * deck so every tone is used before any tone repeats, and the deck never
   * opens with one of the two most recent tones (so a refill cannot produce a
   * back-to-back repeat at the boundary).
   */
  private buildSpectrumDeck(spoken: SmuveArchetype[] = []): SmuveArchetype[] {
    const spokenNames = new Set(spoken.map((archetype) => archetype.name));
    const deck = this.uniqueArchetypes().filter(
      (archetype) => !spokenNames.has(archetype.name)
    );
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const recent = new Set(
      this.archetypeHistory
        .slice(-2)
        .map((index) => this.SMUVE_ARCHETYPES[index]?.name)
    );
    if (deck.length > 1 && recent.has(deck[0].name)) {
      deck.push(deck.shift() as SmuveArchetype);
    }
    return deck;
  }

  /** Records a tone as spoken so the deck can avoid immediate repeats. */
  private rememberArchetype(archetype: SmuveArchetype): void {
    const index = this.SMUVE_ARCHETYPES.indexOf(archetype);
    if (index < 0) return;
    this.archetypeHistory = [...this.archetypeHistory.slice(-7), index];
  }

  private applyAuthoritativePronunciation(text: string): string {
    if (/S\.M\.U\.V\.E(?:\s+\d+\.\d+)?\s+INITIALIZED/i.test(text)) {
      return 'Welcome to Smooth';
    }
    return text
      .replace(/S\.M\.U\.V\.E(?:\s+\d+\.\d+)?/gi, 'Smooth')
      .replace(/SMUVE/gi, 'Smooth')
      .replace(/S\.M\.U\.V\.E\./gi, 'Smooth.')
      .replace(/Absolute\s+Signals/gi, 'Elite Signals')
      .replace(/INITIALIZED\./i, 'READY FOR EXECUTION.');
  }

  /**
   * Configures a single sentence's utterance with SHAPE-SHIFTING:
   *  - fresh archetype roll
   *  - pitch band biased AWAY from the previous band (deep bass ↔ soprano)
   *  - voice rotated by band/gender so consecutive sentences differ
   */
  private configureSentenceUtterance(
    utterance: SpeechSynthesisUtterance,
    options?: SpeakOptions,
    text = ''
  ): VoiceReadout {
    this.currentArchetype = this.selectDynamicArchetype(options);
    if (!this.currentArchetype) {
      return {
        archetype: 'Unknown',
        band: 'mid',
        voiceName: 'System voice',
        pitch: 1,
        rate: 1,
        prosody: 'conversational',
      };
    }

    const [minRate, maxRate] = this.currentArchetype.rateRange;

    // 1) Full-spectrum pitch band — always change away from the previous band
    // to ensure constant vocal-range shifting as requested.
    const band = this.nextPitchBand();
    if (band === 'low') {
      // Deep male bass territory
      utterance.pitch = 0.15 + Math.random() * 0.3;
    } else if (band === 'high') {
      // High female soprano territory
      utterance.pitch = 1.45 + Math.random() * 0.55;
    } else {
      const [minPitch, maxPitch] = this.currentArchetype.pitchRange;
      utterance.pitch = minPitch + Math.random() * (maxPitch - minPitch);
    }
    utterance.pitch = Math.max(0.1, Math.min(2.0, utterance.pitch));

    // 2) Rate + volume jitter within the archetype.
    // Short phrases can be delivered with more urgency; longer sentences stay
    // conversational so the browser voice sounds less robotic and breathless.
    const cadenceBias = text.length < 42 ? 0.06 : text.length > 150 ? -0.05 : 0;
    utterance.rate = Math.max(
      0.1,
      Math.min(2.0, minRate + Math.random() * (maxRate - minRate) + cadenceBias)
    );
    utterance.volume =
      this.currentArchetype.baseVolume * (0.85 + Math.random() * 0.15);

    // 3) Voice rotation matched to the band's gender.
    const voice = this.pickVoiceForBand(band);
    if (voice) {
      try {
        utterance.voice = voice;
      } catch {
        // Voice assignment can throw on some platforms — keep speaking.
      }
    }

    return {
      archetype: this.currentArchetype.name,
      band,
      voiceName: voice?.name ?? 'System voice',
      pitch: utterance.pitch,
      rate: utterance.rate,
      prosody: this.prosodyFor(text, utterance.rate),
    };
  }

  private prosodyFor(text: string, rate: number): VoiceReadout['prosody'] {
    if (/[!?]/.test(text) || rate > 1.05) return 'urgent';
    if (text.length > 120) return 'measured';
    if (/…|—|\.\.\./.test(text) || rate < 0.7) return 'dramatic';
    return 'conversational';
  }

  /** Picks low / mid / high, NEVER repeats the previous band to create a
   *  constantly changing vocal range across sentences. */
  private nextPitchBand(): PitchBand {
    const bands: PitchBand[] = ['low', 'mid', 'high'];
    if (!this.lastPitchBand) {
      this.lastPitchBand = bands[Math.floor(Math.random() * bands.length)];
      return this.lastPitchBand;
    }
    const others = bands.filter((b) => b !== this.lastPitchBand);
    this.lastPitchBand = others[Math.floor(Math.random() * others.length)];
    return this.lastPitchBand;
  }

  /** Rotates voices by band/gender, avoiding the previously used voice. */
  private pickVoiceForBand(band: PitchBand): SpeechSynthesisVoice | null {
    const voices = window.speechSynthesis.getVoices();
    const english = voices.filter((v) =>
      v.lang?.toLowerCase().startsWith('en')
    );
    const pool = english.length > 0 ? english : voices;
    if (pool.length === 0) return null;

    const gender =
      band === 'low'
        ? 'male'
        : band === 'high'
          ? 'female'
          : Math.random() > 0.5
            ? 'male'
            : 'female';

    let preferred = this.findVoiceByGender(pool, gender);

    if (!preferred) {
      // Rotate to avoid the same voice twice in a row.
      const candidates = pool.filter((v) => v !== this.lastUsedVoice);
      preferred =
        candidates.length > 0
          ? candidates[Math.floor(Math.random() * candidates.length)]
          : pool[Math.floor(Math.random() * pool.length)];
    }

    if (preferred && preferred !== this.lastUsedVoice) {
      this.lastUsedVoice = preferred;
    }
    return preferred;
  }

  private findVoiceByGender(
    voices: SpeechSynthesisVoice[],
    gender: string
  ): SpeechSynthesisVoice | null {
    if (gender === 'male') {
      const matches = voices.filter(
        (v) =>
          v.name.toLowerCase().includes('male') ||
          v.name.toLowerCase().includes('guy') ||
          v.name.toLowerCase().includes('david') ||
          v.name.toLowerCase().includes('james') ||
          v.name.toLowerCase().includes('daniel')
      );
      return matches.length
        ? matches[Math.floor(Math.random() * matches.length)]
        : null;
    }
    if (gender === 'female') {
      const matches = voices.filter(
        (v) =>
          v.name.toLowerCase().includes('female') ||
          v.name.toLowerCase().includes('girl') ||
          v.name.toLowerCase().includes('woman') ||
          v.name.toLowerCase().includes('samantha') ||
          v.name.toLowerCase().includes('zoe')
      );
      return matches.length
        ? matches[Math.floor(Math.random() * matches.length)]
        : null;
    }
    return null;
  }

  /** Force a specific vocal archetype for the next message */
  setArchetype(archetype: VoiceArchetype): void {
    const found = this.SMUVE_ARCHETYPES.find((a) => a.name === archetype);
    if (found) this.archetypeHistory = [this.SMUVE_ARCHETYPES.indexOf(found)];
  }

  /** Get available archetype names for UI display */
  getArchetypeNames(): string[] {
    return [...new Set(this.SMUVE_ARCHETYPES.map((a) => a.name))];
  }

  cancel(): void {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    this.isSpeaking.set(false);
    this.liveVoice.set(null);
  }

  // ----- Helper: profanity sanitization (opt-out) -----
  private sanitizeText(text: string): string {
    // Minimal profanity list — callers can opt out to allow full language.
    const profanities = [
      'fuck',
      'shit',
      'bitch',
      'damn',
      'asshole',
      'bastard',
      'crap',
      'piss',
      'dick',
      'cunt',
    ];
    const regex = new RegExp(`\\b(${profanities.join('|')})\\b`, 'gi');
    return text.replace(regex, (m) => '*'.repeat(m.length));
  }
}
